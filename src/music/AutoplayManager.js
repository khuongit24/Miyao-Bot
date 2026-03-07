/**
 * @file AutoplayManager.js
 * @description Manages autoplay functionality — finding and queuing related tracks
 * Extracted from EnhancedQueue.js for single-responsibility principle.
 * @version 1.9.0
 */

import logger from '../utils/logger.js';
import { AUTOPLAY } from '../utils/constants.js';
import { getRecommendationEngine } from './RecommendationEngine.js';
import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../config/design-system.js';

/**
 * Manages autoplay — finding related tracks when queue is empty
 * Uses RecommendationEngine for smart recommendations via collaborative filtering,
 * smart search strategies, and trending fallback.
 */
export class AutoplayManager {
    /**
     * @param {string} guildId - Guild ID for logging context
     */
    constructor(guildId) {
        this.guildId = guildId;

        /** @type {boolean} Whether autoplay is enabled */
        this.enabled = false;

        /** @type {Promise<void>|null} In-flight autoplay operation */
        this._inFlight = null;
    }

    /**
     * Set autoplay state
     * @param {boolean} enabled - Enable/disable autoplay
     */
    setAutoplay(enabled) {
        this.enabled = enabled;
        logger.music(`Autoplay ${enabled ? 'enabled' : 'disabled'}`, { guildId: this.guildId });
    }

    /**
     * Add a related track when queue is empty (autoplay feature)
     * Enhanced version using RecommendationEngine for smarter recommendations
     *
     * Strategy priority:
     * 1. Collaborative filtering from guild history
     * 2. Smart search strategies based on genre/mood/artist
     * 3. Trending fallback
     *
     * @param {Object} queue - EnhancedQueue instance (provides current, history, manager, tracks, play, scheduleLeave)
     * @version 2.0.0 - Enhanced with RecommendationEngine
     */
    async addRelatedTrack(queue) {
        if (this._inFlight) {
            logger.debug('Autoplay already in progress, skipping duplicate trigger', { guildId: this.guildId });
            return this._inFlight;
        }

        if (!queue.current || !queue.current.info) {
            logger.warn('Cannot add related track: no current track', { guildId: this.guildId });
            return;
        }

        this._inFlight = (async () => {
            try {
                const track = queue.current;
                const recEngine = getRecommendationEngine();
                const recentUrls = this._getRecentHistoryUrls(queue, track);

                logger.info('Autoplay: Starting enhanced recommendation', {
                    guildId: this.guildId,
                    currentTrack: track.info.title,
                    currentAuthor: track.info.author
                });

                // PHASE 1: Collaborative Filtering
                let { selectedTrack, strategyUsed } = await this._tryCollaborativeFiltering(
                    recEngine,
                    track,
                    recentUrls
                );

                // PHASE 2: Smart Search Strategies
                if (!selectedTrack) {
                    ({ selectedTrack, strategyUsed } = await this._trySmartSearch(queue, recEngine, track, recentUrls));
                }

                // PHASE 3: Fallback / No Results
                if (!selectedTrack) {
                    this._handleNoResults(queue);
                    return;
                }

                await this._playNextTrack(queue, selectedTrack, strategyUsed);
            } catch (error) {
                logger.error('Autoplay error', { guildId: this.guildId, error: error.message, stack: error.stack });
                queue.scheduleLeave();
            } finally {
                this._inFlight = null;
            }
        })();

        return this._inFlight;
    }

    _getRecentHistoryUrls(queue, currentTrack) {
        const recentUrls = new Set(
            queue.history
                .slice(0, 10)
                .map(h => h.track?.info?.uri)
                .filter(Boolean)
        );
        recentUrls.add(currentTrack.info.uri);
        return recentUrls;
    }

    async _tryCollaborativeFiltering(recEngine, track, recentUrls) {
        try {
            const results = recEngine.getCollaborativeRecommendations(
                this.guildId,
                track.info.uri,
                track.info.title,
                recentUrls,
                5
            );

            if (results.length > 0) {
                const scored = recEngine.scoreAndRank(results, {
                    referenceTrack: track,
                    guildProfile: recEngine.getGuildGenreProfile(this.guildId)
                });

                const diversified = recEngine.applyDiversity(scored);
                if (diversified.length > 0) {
                    // Pick from top 3
                    const selected = diversified[Math.floor(Math.random() * Math.min(diversified.length, 3))];
                    logger.debug('Autoplay: Collaborative filtering succeeded', {
                        guildId: this.guildId,
                        track: selected.info.title
                    });
                    return { selectedTrack: selected, strategyUsed: 'collaborative' };
                }
            }
        } catch (error) {
            logger.debug('Autoplay: Collaborative filtering failed', { error: error.message });
        }
        return { selectedTrack: null, strategyUsed: 'none' };
    }

    async _trySmartSearch(queue, recEngine, track, recentUrls) {
        const strategies = recEngine.buildAutoplayStrategies(track, this.guildId);
        const RACE_COUNT = AUTOPLAY?.RACE_STRATEGIES_COUNT || 3;
        const TIMEOUT = AUTOPLAY?.STRATEGY_TIMEOUT || 2000;

        // Try racing strategies
        let searchResult = await this._raceStrategies(queue, strategies.slice(0, RACE_COUNT), TIMEOUT);
        let strategyUsed = searchResult ? searchResult.strategy : 'none';

        // Fallback to sequential if race failed
        if (!searchResult) {
            const sequentialResult = await this._runSequentialStrategies(queue, strategies.slice(RACE_COUNT), TIMEOUT);
            if (sequentialResult) {
                searchResult = sequentialResult.result;
                strategyUsed = sequentialResult.strategy;
            }
        }

        if (searchResult?.tracks?.length > 0) {
            const selectedTrack = this._selectFromSearchResults(recEngine, searchResult.tracks, track, recentUrls);
            if (selectedTrack) return { selectedTrack, strategyUsed };
        }

        return { selectedTrack: null, strategyUsed: 'none' };
    }

    async _raceStrategies(queue, strategies, timeout) {
        try {
            logger.debug(`Autoplay: Racing ${strategies.length} strategies`, { guildId: this.guildId });
            return await Promise.any(strategies.map(s => this._executeStrategy(queue, s, timeout)));
        } catch (err) {
            if (err instanceof AggregateError) {
                logger.debug(
                    'All autoplay strategies failed:',
                    err.errors.map(e => e.message)
                );
            }
            return null;
        }
    }

    async _runSequentialStrategies(queue, strategies, timeout) {
        for (const strategy of strategies) {
            try {
                return await this._executeStrategy(queue, strategy, timeout);
            } catch {
                continue;
            }
        }
        return null;
    }

    async _executeStrategy(queue, strategy, timeout) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeout);
        let onAbort = null;

        try {
            const result = await Promise.race([
                queue.manager.search(strategy.query, null),
                new Promise((_, reject) => {
                    onAbort = () => reject(new Error('Timeout'));
                    ac.signal.addEventListener('abort', onAbort, { once: true });
                })
            ]);

            if (result?.tracks?.length > 0) {
                return { result, strategy: strategy.name };
            }
            throw new Error('No results');
        } finally {
            clearTimeout(timer);
            if (onAbort) {
                ac.signal.removeEventListener('abort', onAbort);
            }
        }
    }

    _selectFromSearchResults(recEngine, tracks, referenceTrack, recentUrls) {
        const candidates = tracks.filter(t => {
            if (recentUrls.has(t.info.uri)) return false;
            // Simple title check
            return !recEngine.shouldSkipTrack(t);
        });

        if (candidates.length === 0) return null;

        const ranked = recEngine.scoreAndRank(
            candidates.map(c => ({ ...c, score: 0 })),
            {
                referenceTrack
            }
        );

        const diversified = recEngine.applyDiversity(ranked);
        if (diversified.length === 0) return null;
        return diversified[Math.floor(Math.random() * Math.min(diversified.length, 5))];
    }

    _handleNoResults(queue) {
        logger.warn('Autoplay: No related tracks found', { guildId: this.guildId });
        queue.scheduleLeave();
    }

    async _playNextTrack(queue, track, strategy) {
        track.requester = 'autoplay';
        if (track.detectedGenre) track._autoplayGenre = track.detectedGenre;

        queue.tracks.push(track);
        await queue.play();

        logger.info('Autoplay: Added track', {
            guildId: this.guildId,
            title: track.info.title,
            strategy
        });

        await this._sendNotification(queue.textChannel, track, strategy);
    }

    /**
     * Send autoplay notification to text channel
     * @param {TextChannel|null} textChannel - Discord text channel
     * @param {Object} track - The track being played
     * @param {string} strategy - Strategy used to find the track
     * @private
     */
    async _sendNotification(textChannel, track, strategy = 'search') {
        if (!textChannel || !track) return;

        try {
            const strategyIcons = {
                collaborative: '👥',
                artist_tracks: '🎤',
                artist_popular: '⭐',
                genre_trending: '🎵',
                genre_popular: '🔥',
                similar_keywords: '🔍',
                mood_match: '🎭',
                guild_preference: '📊',
                trending_global: '🌍',
                search: '🎵'
            };

            const icon = strategyIcons[strategy] || '🎵';
            const isSerendipity = track.isSerendipity;
            const genre = track._autoplayGenre || track.detectedGenre;

            let reason = '';
            switch (strategy) {
                case 'collaborative':
                    reason = '🎯 Người nghe tương tự cũng thích';
                    break;
                case 'artist_tracks':
                case 'artist_popular':
                    reason = `🎤 Bài khác của ${track.info.author}`;
                    break;
                case 'genre_trending':
                case 'genre_popular':
                    reason = `🎵 ${genre ? `${genre.toUpperCase()} đang hot` : 'Cùng thể loại'}`;
                    break;
                case 'mood_match':
                    reason = '🎭 Cùng tâm trạng';
                    break;
                case 'guild_preference':
                    reason = '📊 Dựa trên sở thích server';
                    break;
                default:
                    reason = '🎵 Gợi ý cho bạn';
            }

            const embed = new EmbedBuilder()
                .setColor(isSerendipity ? COLORS.PRIMARY : COLORS.FILTER_ACTIVE)
                .setDescription(
                    `${icon} **Autoplay${isSerendipity ? ' ✨' : ''}:** [${track.info.title}](${track.info.uri})\n` +
                        `└ 🎤 ${track.info.author}\n\n` +
                        `${reason}`
                )
                .setFooter({ text: '💡 Dùng /autoplay để tắt • /similar để xem thêm' });

            await textChannel.send({ embeds: [embed] });
        } catch (error) {
            logger.debug('Could not send autoplay notification', { guildId: this.guildId, error: error.message });
        }
    }
}

export default AutoplayManager;
