/**
 * @file EnhancedQueue.js
 * @description Enhanced Queue with advanced features for music playback
 * @version 1.9.1 - Performance optimization: cached imports for hot paths
 */

import logger from '../utils/logger.js';
import { TIME, PLAYBACK, AUTOPLAY, RECONNECTION } from '../utils/constants.js';
import { getRecommendationEngine } from './RecommendationEngine.js';
import { EmbedBuilder } from 'discord.js';

// Pre-import frequently used UI modules to avoid dynamic import overhead in hot paths
// These are used in updateNowPlaying(), autoplay notifications, and reconnection messages
// which can be called many times during playback
import { createNowPlayingEmbed } from '../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons } from '../UI/components/MusicControls.js';

/**
 * Enhanced Queue with advanced features
 */
export class EnhancedQueue {
    /**
     * Create a new EnhancedQueue
     * @param {MusicManager} manager - Music manager instance
     * @param {string} guildId - Guild ID
     * @param {string} voiceChannelId - Voice channel ID
     * @param {TextChannel} textChannel - Text channel for notifications
     */
    constructor(manager, guildId, voiceChannelId, textChannel) {
        this.manager = manager;
        this.guildId = guildId;
        this.voiceChannelId = voiceChannelId;
        this.textChannel = textChannel;

        this.tracks = [];
        this.current = null;
        this.player = null;
        this.loop = 'off';
        this.volume = manager.config.music.defaultVolume || 50;
        this.paused = false;
        this.autoplay = false; // Autoplay related tracks
        this.removeDuplicates = false; // Auto-remove duplicate tracks when adding

        // Filters
        this.filters = {
            equalizer: [],
            karaoke: null,
            timescale: null,
            tremolo: null,
            vibrato: null,
            rotation: null,
            distortion: null,
            channelMix: null,
            lowPass: null
        };

        this.leaveTimeout = null;
        this.nowPlayingMessage = null;
        this.updateInterval = null;

        // Smart progress update tracking
        this.lastUserInteraction = Date.now(); // Track last user interaction
        this.lastProgressUpdate = 0; // Track last progress update time for debounce
        this.progressUpdatePaused = false; // Flag to pause updates when idle

        // Track history for analytics
        this.history = [];
        this.maxHistory = 50;

        // Playback statistics
        this.stats = {
            tracksPlayed: 0,
            totalDuration: 0,
            skips: 0,
            errors: 0
        };

        // Reconnection state for exponential backoff
        this.reconnectionState = {
            attempts: 0,
            lastAttempt: 0,
            isReconnecting: false
        };

        // Filter compatibility map: defines which filters CAN work together
        // Key: filter type, Value: array of compatible filter types
        // If a filter is NOT in the compatible list, it will be cleared when applying the key filter
        this.COMPATIBLE_FILTERS = {
            // Equalizer presets are compatible with rotation (8D), tremolo, vibrato, lowPass
            equalizer: ['rotation', 'tremolo', 'vibrato', 'lowPass', 'channelMix'],
            // Timescale (nightcore/vaporwave) is compatible with rotation (8D), tremolo, vibrato
            // NOTE: timescale and equalizer are NOT compatible as per original design (they conflict)
            timescale: ['rotation', 'tremolo', 'vibrato', 'lowPass', 'channelMix'],
            // Rotation (8D) is compatible with everything except other rotation
            rotation: [
                'equalizer',
                'timescale',
                'tremolo',
                'vibrato',
                'karaoke',
                'distortion',
                'lowPass',
                'channelMix'
            ],
            // Karaoke is compatible with most filters
            karaoke: ['equalizer', 'timescale', 'rotation', 'tremolo', 'vibrato', 'lowPass', 'channelMix'],
            // Tremolo/Vibrato are compatible with most
            tremolo: ['equalizer', 'timescale', 'rotation', 'karaoke', 'vibrato', 'lowPass', 'channelMix'],
            vibrato: ['equalizer', 'timescale', 'rotation', 'karaoke', 'tremolo', 'lowPass', 'channelMix'],
            // Distortion is generally incompatible with equalizer for clean sound
            distortion: ['rotation', 'timescale', 'tremolo', 'vibrato', 'channelMix'],
            // Low pass is compatible with most
            lowPass: ['equalizer', 'timescale', 'rotation', 'karaoke', 'tremolo', 'vibrato', 'channelMix'],
            // Channel mix is compatible with most
            channelMix: ['equalizer', 'timescale', 'rotation', 'karaoke', 'tremolo', 'vibrato', 'lowPass', 'distortion']
        };

        // Filters that CONFLICT and will be cleared (inverse of compatibility)
        // This is a special case: timescale and equalizer cannot coexist well
        // because timescale changes pitch/speed which affects how EQ sounds
        this.CONFLICTING_FILTERS = {
            timescale: ['equalizer'], // Nightcore/Vaporwave clears equalizer
            equalizer: ['timescale'] // Applying EQ preset clears nightcore/vaporwave
        };
    }

    /**
     * Connect with retry logic
     * @param {number} retries - Number of retry attempts
     * @returns {Promise<Player>}
     */
    async connect(retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const node = this.manager.nodeMonitor.getBestNode(this.manager.shoukaku);

                if (!node) {
                    throw new Error('No available nodes');
                }

                const guild = this.manager.client.guilds.cache.get(this.guildId);
                const shardId = guild ? guild.shardId : 0;

                logger.info(`Connecting to voice channel (attempt ${i + 1}/${retries})`);

                this.player = await this.manager.shoukaku.joinVoiceChannel({
                    guildId: this.guildId,
                    channelId: this.voiceChannelId,
                    shardId: shardId
                });

                this.setupPlayerEvents();
                await this.player.setGlobalVolume(this.volume);

                // Apply any existing filters
                await this.applyFilters();

                logger.music('Player connected successfully', {
                    guildId: this.guildId,
                    node: node.name
                });

                return this.player;
            } catch (error) {
                logger.error(`Connection attempt ${i + 1} failed`, error);
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }

    /**
     * Reconnect after node failure with exponential backoff
     * Implements: 1s → 2s → 4s → 8s → 16s → 30s max
     * Max 5 retries before giving up
     */
    async reconnect() {
        // Prevent concurrent reconnection attempts
        if (this.reconnectionState.isReconnecting) {
            logger.warn('Reconnection already in progress, ignoring duplicate request', { guildId: this.guildId });
            return;
        }

        // Configuration from constants (with defaults for backward compatibility)
        const INITIAL_DELAY = RECONNECTION?.INITIAL_DELAY_MS || 1000;
        const MAX_DELAY = RECONNECTION?.MAX_DELAY_MS || 30000;
        const MULTIPLIER = RECONNECTION?.MULTIPLIER || 2;
        const MAX_RETRIES = RECONNECTION?.MAX_RETRIES || 5;
        const JITTER_FACTOR = RECONNECTION?.JITTER_FACTOR || 0.1;

        this.reconnectionState.isReconnecting = true;

        const currentTrack = this.current;
        const currentPosition = this.player?.position || 0;

        logger.info(`Starting reconnection for guild ${this.guildId}`, {
            currentTrack: currentTrack?.info?.title,
            position: currentPosition,
            previousAttempts: this.reconnectionState.attempts
        });

        // Notify user about reconnection
        await this._sendReconnectionNotification('starting');

        // Disconnect old player
        if (this.player) {
            try {
                await this.manager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (err) {
                logger.warn('Error leaving voice channel during reconnect', err);
            }
        }

        // Exponential backoff retry loop
        let attempt = 0;
        let lastError = null;

        while (attempt < MAX_RETRIES) {
            attempt++;
            this.reconnectionState.attempts++;
            this.reconnectionState.lastAttempt = Date.now();

            // Calculate backoff delay: 1s, 2s, 4s, 8s, 16s, capped at 30s
            let delay = Math.min(INITIAL_DELAY * Math.pow(MULTIPLIER, attempt - 1), MAX_DELAY);

            // Add jitter to prevent thundering herd
            const jitter = delay * JITTER_FACTOR * Math.random();
            delay = Math.round(delay + jitter);

            logger.info(`Reconnection attempt ${attempt}/${MAX_RETRIES}`, {
                guildId: this.guildId,
                delay: delay,
                totalAttempts: this.reconnectionState.attempts
            });

            // Wait before attempting
            if (attempt > 1) {
                await this._sendReconnectionNotification('retrying', attempt, MAX_RETRIES, delay);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            try {
                // Attempt to reconnect
                await this.connect();

                // Reconnection successful!
                logger.info(`Reconnection successful after ${attempt} attempts`, {
                    guildId: this.guildId,
                    totalAttempts: this.reconnectionState.attempts
                });

                // Reset reconnection state on success
                this.reconnectionState.attempts = 0;
                this.reconnectionState.isReconnecting = false;

                // Resume playback if there was a track playing
                if (currentTrack) {
                    try {
                        await this.player.playTrack({ track: { encoded: currentTrack.encoded } });
                        if (currentPosition > 0) {
                            await this.player.seekTo(currentPosition);
                        }

                        // Notify user about successful reconnection
                        await this._sendReconnectionNotification('success', attempt);

                        logger.info(`Playback resumed at position ${currentPosition}ms`, {
                            guildId: this.guildId,
                            track: currentTrack.info?.title
                        });
                    } catch (playError) {
                        logger.error('Failed to resume playback after reconnection', {
                            guildId: this.guildId,
                            error: playError.message
                        });
                        // Don't fail the reconnection, just log
                    }
                }

                return; // Success - exit the function
            } catch (error) {
                lastError = error;
                logger.warn(`Reconnection attempt ${attempt} failed`, {
                    guildId: this.guildId,
                    error: error.message
                });

                // Record failure in node health monitor
                if (this.manager.nodeMonitor) {
                    this.manager.nodeMonitor.recordFailure('reconnect', error.message);
                }
            }
        }

        // All retries exhausted
        this.reconnectionState.isReconnecting = false;

        logger.error(`Reconnection failed after ${MAX_RETRIES} attempts`, {
            guildId: this.guildId,
            lastError: lastError?.message,
            totalAttempts: this.reconnectionState.attempts
        });

        // Notify user about failure
        await this._sendReconnectionNotification('failed', MAX_RETRIES, MAX_RETRIES);

        // Clean up
        this.destroy();
        throw new Error(`Reconnection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
    }

    /**
     * Send reconnection status notification to text channel
     * @private
     * @param {'starting'|'retrying'|'success'|'failed'} status - Reconnection status
     * @param {number} attempt - Current attempt number
     * @param {number} maxAttempts - Maximum attempts
     * @param {number} delay - Delay before next attempt in ms
     */
    async _sendReconnectionNotification(status, attempt = 0, maxAttempts = 0, delay = 0) {
        if (!this.textChannel) return;

        try {
            // Use pre-imported EmbedBuilder for better performance
            let embed;

            switch (status) {
                case 'starting':
                    embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🔄 Đang kết nối lại...')
                        .setDescription('Phát hiện lỗi kết nối. Đang cố gắng kết nối lại với server nhạc...')
                        .setTimestamp();
                    break;

                case 'retrying':
                    embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🔄 Đang thử lại...')
                        .setDescription(
                            `Lần thử ${attempt}/${maxAttempts}\n` +
                            `⏳ Đợi ${Math.round(delay / 1000)} giây trước khi thử lại...`
                        )
                        .setTimestamp();
                    break;

                case 'success':
                    embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Đã kết nối lại!')
                        .setDescription(`Kết nối thành công sau ${attempt} lần thử.\n` + 'Đang tiếp tục phát nhạc...')
                        .setTimestamp();
                    break;

                case 'failed':
                    embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Không thể kết nối lại')
                        .setDescription(
                            `Đã thử ${maxAttempts} lần nhưng không thành công.\n` +
                            'Vui lòng thử lại sau hoặc dùng lệnh /play để bắt đầu lại.'
                        )
                        .setTimestamp();
                    break;
            }

            if (embed) {
                await this.textChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            logger.debug('Could not send reconnection notification', {
                guildId: this.guildId,
                status,
                error: error.message
            });
        }
    }

    /**
     * Setup enhanced player events
     */
    setupPlayerEvents() {
        if (!this.player) return;

        this.player.on('start', async data => {
            logger.music('Track started', {
                guildId: this.guildId,
                track: data.track?.info?.title
            });
            this.clearLeaveTimeout();
            this.stats.tracksPlayed++;

            // Add to in-memory history
            if (this.current) {
                this.history.unshift({
                    track: this.current,
                    playedAt: Date.now()
                });
                if (this.history.length > this.maxHistory) {
                    this.history.pop();
                }

                // Add to database history (non-blocking)
                this._saveToDatabase(this.current).catch(error => {
                    logger.error('Failed to save track to database history', {
                        guildId: this.guildId,
                        track: this.current?.info?.title,
                        error
                    });
                });
            }

            if (this.nowPlayingMessage) {
                this.startProgressUpdates();
            }
        });

        this.player.on('end', data => {
            logger.music('Track ended', { guildId: this.guildId, reason: data.reason });
            this.stopProgressUpdates();

            if (this.current) {
                this.stats.totalDuration += this.current.info.length;
            }

            if (data.reason === 'replaced') return;

            if (this.loop === 'track' && this.current) {
                this.play(this.current);
                return;
            }

            if (this.loop === 'queue' && this.current) {
                this.tracks.push(this.current);
            }

            if (this.tracks.length > 0) {
                this.play();
            } else if (this.autoplay && this.current) {
                // Autoplay: add related track
                logger.info('Autoplay enabled, searching for related track', { guildId: this.guildId });
                this.addRelatedTrack().catch(error => {
                    logger.error('Autoplay failed', { guildId: this.guildId, error: error.message });
                    this.current = null;
                    this.scheduleLeave();
                });
            } else {
                this.current = null;
                this.scheduleLeave();
            }
        });

        this.player.on('exception', data => {
            logger.error('Player exception', { guildId: this.guildId, exception: data.exception });
            this.stats.errors++;

            if (this.tracks.length > 0) {
                this.play();
            } else {
                this.scheduleLeave();
            }
        });

        this.player.on('stuck', data => {
            logger.warn('Player stuck', { guildId: this.guildId, threshold: data.thresholdMs });
            if (this.tracks.length > 0) {
                this.play();
            }
        });

        this.player.on('closed', data => {
            logger.warn('WebSocket closed', { guildId: this.guildId, code: data.code, reason: data.reason });
        });

        this.player.on('update', _data => {
            // Position updates - handled silently
        });
    }

    /**
     * Apply filters to player
     * @returns {Promise<boolean>} Success status
     */
    async applyFilters() {
        if (!this.player) {
            logger.warn('Cannot apply filters: player not connected', { guildId: this.guildId });
            return false;
        }

        try {
            const filters = {};

            // Build filters object from current state
            if (this.filters.equalizer.length > 0) {
                filters.equalizer = this.filters.equalizer;
            }
            if (this.filters.karaoke) {
                filters.karaoke = this.filters.karaoke;
            }
            if (this.filters.timescale) {
                filters.timescale = this.filters.timescale;
            }
            if (this.filters.tremolo) {
                filters.tremolo = this.filters.tremolo;
            }
            if (this.filters.vibrato) {
                filters.vibrato = this.filters.vibrato;
            }
            if (this.filters.rotation) {
                filters.rotation = this.filters.rotation;
            }
            if (this.filters.distortion) {
                filters.distortion = this.filters.distortion;
            }
            if (this.filters.channelMix) {
                filters.channelMix = this.filters.channelMix;
            }
            if (this.filters.lowPass) {
                filters.lowPass = this.filters.lowPass;
            }

            // CRITICAL FIX: Always call setFilters, even with empty object
            // This is required to clear filters in Lavalink
            // According to Lavalink v4 docs: "filters overrides all previously applied filters"
            await this.player.setFilters(filters);

            const filterCount = Object.keys(filters).length;
            if (filterCount > 0) {
                logger.info(`Applied ${filterCount} filter(s) to player`, {
                    guildId: this.guildId,
                    filters: Object.keys(filters)
                });
            } else {
                logger.info('Cleared all filters from player', { guildId: this.guildId });
            }

            return true;
        } catch (error) {
            logger.error('Failed to apply filters', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Clear only conflicting filters when applying a new filter type
     * This allows compatible filters to coexist (e.g., bass + 8D)
     * @param {string} newFilterType - The type of filter being applied
     * @returns {string[]} Array of filter types that were cleared
     * @private
     */
    _clearConflictingFilters(newFilterType) {
        const clearedFilters = [];
        const conflicts = this.CONFLICTING_FILTERS[newFilterType] || [];

        for (const conflictType of conflicts) {
            if (conflictType === 'equalizer' && this.filters.equalizer.length > 0) {
                this.filters.equalizer = [];
                clearedFilters.push('equalizer');
                logger.debug(`Cleared conflicting filter: equalizer (due to ${newFilterType})`, {
                    guildId: this.guildId
                });
            } else if (conflictType !== 'equalizer' && this.filters[conflictType]) {
                this.filters[conflictType] = null;
                clearedFilters.push(conflictType);
                logger.debug(`Cleared conflicting filter: ${conflictType} (due to ${newFilterType})`, {
                    guildId: this.guildId
                });
            }
        }

        return clearedFilters;
    }

    /**
     * Get filters that would conflict with a new filter type
     * @param {string} filterType - The type of filter to check
     * @returns {string[]} Array of currently active conflicting filter names
     */
    getConflictingActiveFilters(filterType) {
        const conflicts = this.CONFLICTING_FILTERS[filterType] || [];
        const activeConflicts = [];

        for (const conflictType of conflicts) {
            if (conflictType === 'equalizer' && this.filters.equalizer.length > 0) {
                activeConflicts.push('equalizer');
            } else if (conflictType !== 'equalizer' && this.filters[conflictType]) {
                activeConflicts.push(conflictType);
            }
        }

        return activeConflicts;
    }

    /**
     * Clear all filters and reset to default state
     * @returns {Promise<boolean>} Success status
     */
    async clearFilters() {
        try {
            // Reset all filter states to default
            this.filters = {
                equalizer: [],
                karaoke: null,
                timescale: null,
                tremolo: null,
                vibrato: null,
                rotation: null,
                distortion: null,
                channelMix: null,
                lowPass: null
            };

            // Apply empty filters to Lavalink
            const success = await this.applyFilters();

            if (success) {
                logger.info('Successfully cleared all filters', { guildId: this.guildId });
            }

            return success;
        } catch (error) {
            logger.error('Failed to clear filters', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Get active filter names
     * @returns {string[]} Array of active filter names
     */
    getActiveFilters() {
        const active = [];

        if (this.filters.equalizer.length > 0) active.push('equalizer');
        if (this.filters.karaoke) active.push('karaoke');
        if (this.filters.timescale) active.push('timescale');
        if (this.filters.tremolo) active.push('tremolo');
        if (this.filters.vibrato) active.push('vibrato');
        if (this.filters.rotation) active.push('rotation');
        if (this.filters.distortion) active.push('distortion');
        if (this.filters.channelMix) active.push('channelMix');
        if (this.filters.lowPass) active.push('lowPass');

        return active;
    }

    /**
     * Set equalizer preset
     * @param {string} preset - Preset name (flat, bass, rock, jazz, pop)
     * @returns {Promise<Object>} Result with success status and cleared filters
     */
    async setEqualizer(preset) {
        const presets = {
            flat: [],
            bass: [
                { band: 0, gain: 0.6 },
                { band: 1, gain: 0.67 },
                { band: 2, gain: 0.67 },
                { band: 3, gain: 0 },
                { band: 4, gain: -0.5 },
                { band: 5, gain: 0.15 },
                { band: 6, gain: -0.45 },
                { band: 7, gain: 0.23 },
                { band: 8, gain: 0.35 },
                { band: 9, gain: 0.45 },
                { band: 10, gain: 0.55 },
                { band: 11, gain: 0.6 },
                { band: 12, gain: 0.55 },
                { band: 13, gain: 0 }
            ],
            rock: [
                { band: 0, gain: 0.3 },
                { band: 1, gain: 0.25 },
                { band: 2, gain: 0.2 },
                { band: 3, gain: 0.1 },
                { band: 4, gain: 0.05 },
                { band: 5, gain: -0.05 },
                { band: 6, gain: -0.15 },
                { band: 7, gain: -0.2 },
                { band: 8, gain: -0.1 },
                { band: 9, gain: -0.05 },
                { band: 10, gain: 0.05 },
                { band: 11, gain: 0.1 },
                { band: 12, gain: 0.15 },
                { band: 13, gain: 0.2 }
            ],
            jazz: [
                { band: 0, gain: 0.3 },
                { band: 1, gain: 0.3 },
                { band: 2, gain: 0.2 },
                { band: 3, gain: 0.2 },
                { band: 4, gain: -0.2 },
                { band: 5, gain: -0.2 },
                { band: 6, gain: 0 },
                { band: 7, gain: 0.2 },
                { band: 8, gain: 0.25 },
                { band: 9, gain: 0.3 },
                { band: 10, gain: 0.3 },
                { band: 11, gain: 0.3 },
                { band: 12, gain: 0.3 },
                { band: 13, gain: 0.3 }
            ],
            pop: [
                { band: 0, gain: -0.25 },
                { band: 1, gain: -0.2 },
                { band: 2, gain: -0.15 },
                { band: 3, gain: -0.1 },
                { band: 4, gain: -0.05 },
                { band: 5, gain: 0.05 },
                { band: 6, gain: 0.15 },
                { band: 7, gain: 0.2 },
                { band: 8, gain: 0.25 },
                { band: 9, gain: 0.25 },
                { band: 10, gain: 0.25 },
                { band: 11, gain: 0.25 },
                { band: 12, gain: 0.25 },
                { band: 13, gain: 0.25 }
            ]
        };

        if (!presets[preset]) {
            logger.warn(`Unknown equalizer preset: ${preset}`, { guildId: this.guildId });
            return false;
        }

        // Clear only conflicting filters (timescale conflicts with equalizer)
        const clearedFilters = this._clearConflictingFilters('equalizer');
        this.filters.equalizer = presets[preset];

        const success = await this.applyFilters();
        if (success) {
            const activeFilters = this.getActiveFilters();
            logger.info(`Applied equalizer preset: ${preset}`, {
                guildId: this.guildId,
                clearedFilters,
                activeFilters
            });
        }

        return success;
    }

    /**
     * Set nightcore filter
     * @param {boolean} enabled - Enable/disable nightcore
     * @returns {Promise<boolean>} Success status
     */
    async setNightcore(enabled) {
        try {
            if (enabled) {
                // Clear only conflicting filters (equalizer conflicts with timescale)
                // Other filters like rotation (8D) will be preserved
                const clearedFilters = this._clearConflictingFilters('timescale');
                this.filters.timescale = { speed: 1.1, pitch: 1.1, rate: 1 };

                const activeFilters = this.getActiveFilters();
                logger.info('Enabled nightcore filter', {
                    guildId: this.guildId,
                    clearedFilters,
                    activeFilters
                });
            } else {
                this.filters.timescale = null;
                logger.info('Disabled nightcore filter', { guildId: this.guildId });
            }

            const success = await this.applyFilters();
            return success;
        } catch (error) {
            logger.error('Failed to set nightcore filter', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Set vaporwave filter
     * @param {boolean} enabled - Enable/disable vaporwave
     * @returns {Promise<boolean>} Success status
     */
    async setVaporwave(enabled) {
        try {
            if (enabled) {
                // Clear only conflicting filters (equalizer conflicts with timescale)
                // Other filters like rotation (8D) will be preserved
                const clearedFilters = this._clearConflictingFilters('timescale');
                this.filters.timescale = { speed: 0.8, pitch: 0.8, rate: 1 };

                const activeFilters = this.getActiveFilters();
                logger.info('Enabled vaporwave filter', {
                    guildId: this.guildId,
                    clearedFilters,
                    activeFilters
                });
            } else {
                this.filters.timescale = null;
                logger.info('Disabled vaporwave filter', { guildId: this.guildId });
            }

            const success = await this.applyFilters();
            return success;
        } catch (error) {
            logger.error('Failed to set vaporwave filter', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Set 8D audio filter
     * @param {boolean} enabled - Enable/disable 8D
     * @returns {Promise<boolean>} Success status
     */
    async set8D(enabled) {
        try {
            if (enabled) {
                // 8D (rotation) is compatible with most other filters
                // No need to clear conflicting filters
                this.filters.rotation = { rotationHz: 0.2 };

                const activeFilters = this.getActiveFilters();
                logger.info('Enabled 8D audio filter', {
                    guildId: this.guildId,
                    activeFilters
                });
            } else {
                this.filters.rotation = null;
                logger.info('Disabled 8D audio filter', { guildId: this.guildId });
            }

            const success = await this.applyFilters();
            return success;
        } catch (error) {
            logger.error('Failed to set 8D filter', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Add track(s) to queue
     * @param {Object|Object[]} track - Track or array of tracks
     * @param {Object} options - Options for adding tracks
     * @param {boolean} options.skipDuplicateCheck - Skip duplicate check even if removeDuplicates is enabled
     * @returns {Object} Result with added count and skipped duplicates
     */
    add(track, options = {}) {
        const tracks = Array.isArray(track) ? track : [track];
        const skipDuplicateCheck = options.skipDuplicateCheck || false;

        let addedCount = 0;
        const skippedDuplicates = [];

        if (this.removeDuplicates && !skipDuplicateCheck) {
            // Build a Set of existing track URIs for quick lookup
            const existingUris = new Set();

            // Add current track URI if playing
            if (this.current?.info?.uri) {
                existingUris.add(this.current.info.uri);
            }

            // Add all queued track URIs
            for (const t of this.tracks) {
                if (t.info?.uri) {
                    existingUris.add(t.info.uri);
                }
            }

            // Filter out duplicates
            for (const t of tracks) {
                const uri = t.info?.uri;

                if (uri && existingUris.has(uri)) {
                    // Track is a duplicate
                    skippedDuplicates.push({
                        title: t.info?.title || 'Unknown',
                        uri: uri
                    });
                    logger.debug('Skipped duplicate track', {
                        guildId: this.guildId,
                        title: t.info?.title,
                        uri: uri
                    });
                } else {
                    // Track is unique, add it
                    this.tracks.push(t);
                    addedCount++;

                    // Add to existing URIs to catch duplicates within the batch
                    if (uri) {
                        existingUris.add(uri);
                    }
                }
            }

            if (skippedDuplicates.length > 0) {
                logger.info('Skipped duplicate tracks during add', {
                    guildId: this.guildId,
                    added: addedCount,
                    skipped: skippedDuplicates.length
                });
            }
        } else {
            // No duplicate check, add all tracks
            this.tracks.push(...tracks);
            addedCount = tracks.length;
        }

        return {
            added: addedCount,
            skipped: skippedDuplicates.length,
            skippedTracks: skippedDuplicates,
            total: this.tracks.length
        };
    }

    /**
     * Set remove duplicates mode
     * @param {boolean} enabled - Enable/disable duplicate removal
     * @returns {boolean} New state
     */
    setRemoveDuplicates(enabled) {
        this.removeDuplicates = enabled;
        logger.music(`Remove duplicates ${enabled ? 'enabled' : 'disabled'}`, { guildId: this.guildId });
        return this.removeDuplicates;
    }

    /**
     * Check if a track is already in queue or currently playing
     * @param {Object} track - Track to check
     * @returns {boolean} True if duplicate
     */
    isDuplicate(track) {
        const uri = track.info?.uri;
        if (!uri) return false;

        // Check current track
        if (this.current?.info?.uri === uri) {
            return true;
        }

        // Check queue
        return this.tracks.some(t => t.info?.uri === uri);
    }

    /**
     * Remove all duplicate tracks from current queue
     * @returns {Object} Result with removed count and removed tracks info
     */
    removeDuplicatesFromQueue() {
        const seenUris = new Set();
        const removed = [];
        const uniqueTracks = [];

        // Current track is always kept first
        if (this.current?.info?.uri) {
            seenUris.add(this.current.info.uri);
        }

        for (const track of this.tracks) {
            const uri = track.info?.uri;

            if (uri && seenUris.has(uri)) {
                removed.push({
                    title: track.info?.title || 'Unknown',
                    uri: uri
                });
            } else {
                uniqueTracks.push(track);
                if (uri) {
                    seenUris.add(uri);
                }
            }
        }

        const removedCount = this.tracks.length - uniqueTracks.length;
        this.tracks = uniqueTracks;

        if (removedCount > 0) {
            logger.info('Removed duplicate tracks from queue', {
                guildId: this.guildId,
                removed: removedCount,
                remaining: this.tracks.length
            });
        }

        return {
            removed: removedCount,
            removedTracks: removed,
            remaining: this.tracks.length
        };
    }

    /**
     * Play a track or next in queue
     * @param {Object} [track] - Specific track to play
     * @returns {Promise<boolean>} Success status
     */
    async play(track) {
        if (!this.player) {
            await this.connect();
        }

        const toPlay = track || this.tracks.shift();

        if (!toPlay) {
            this.current = null;
            this.scheduleLeave();
            return false;
        }

        this.current = toPlay;
        this.paused = false;

        try {
            await this.player.playTrack({ track: { encoded: toPlay.encoded } });
            return true;
        } catch (error) {
            logger.error('Failed to play track', error);
            this.stats.errors++;

            if (this.tracks.length > 0) {
                return await this.play();
            }

            return false;
        }
    }

    /**
     * Pause playback
     * @returns {Promise<boolean>} Success status
     */
    async pause() {
        if (!this.player || this.paused) return false;
        await this.player.setPaused(true);
        this.paused = true;
        this.recordUserInteraction();
        await this.updateNowPlaying();
        return true;
    }

    /**
     * Resume playback
     * @returns {Promise<boolean>} Success status
     */
    async resume() {
        if (!this.player || !this.paused) return false;
        await this.player.setPaused(false);
        this.paused = false;
        this.recordUserInteraction();
        await this.updateNowPlaying();
        return true;
    }

    /**
     * Skip current track
     * @returns {Promise<boolean>} Success status
     */
    async skip() {
        if (!this.player) return false;
        this.stats.skips++;
        this.recordUserInteraction();
        await this.player.stopTrack();
        return true;
    }

    /**
     * Stop playback and clear queue
     * @returns {Promise<boolean>} Success status
     */
    async stop() {
        this.tracks = [];
        this.current = null;
        if (this.player) {
            await this.player.stopTrack();
        }
        this.scheduleLeave();
        return true;
    }

    /**
     * Set volume
     * @param {number} volume - Volume level (0-100)
     * @returns {Promise<number>} Actual volume set
     */
    async setVolume(volume) {
        volume = Math.max(0, Math.min(100, volume));
        this.volume = volume;
        this.recordUserInteraction();
        if (this.player) {
            await this.player.setGlobalVolume(volume);
        }
        return volume;
    }

    /**
     * Seek to position
     * @param {number} position - Position in milliseconds
     * @returns {Promise<boolean>} Success status
     */
    async seek(position) {
        if (!this.player || !this.current) return false;
        this.recordUserInteraction();
        await this.player.seekTo(position);
        return true;
    }

    /**
     * Set loop mode
     * @param {string} mode - Loop mode (off, track, queue)
     * @returns {Promise<string>} Loop mode set
     */
    async setLoop(mode) {
        if (!['off', 'track', 'queue'].includes(mode)) {
            throw new Error('Invalid loop mode');
        }
        this.loop = mode;
        this.recordUserInteraction();
        await this.updateNowPlaying();
        return mode;
    }

    /**
     * Shuffle queue
     */
    shuffle() {
        this.recordUserInteraction();
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
    }

    /**
     * Clear queue
     */
    clear() {
        this.tracks = [];
    }

    /**
     * Remove track at index
     * @param {number} index - Index of track to remove
     * @returns {Object|null} Removed track or null
     */
    remove(index) {
        if (index < 0 || index >= this.tracks.length) {
            return null;
        }
        return this.tracks.splice(index, 1)[0];
    }

    /**
     * Move track from one position to another
     * @param {number} fromIndex - Current index
     * @param {number} toIndex - Destination index
     * @returns {boolean} Success status
     */
    move(fromIndex, toIndex) {
        if (this.tracks.length === 0) return false;
        if (fromIndex === toIndex) return true;
        if (fromIndex < 0 || fromIndex >= this.tracks.length) return false;
        if (toIndex < 0 || toIndex >= this.tracks.length) return false;
        const [track] = this.tracks.splice(fromIndex, 1);
        this.tracks.splice(toIndex, 0, track);
        return true;
    }

    /**
     * Go back to the previous track from history
     * @returns {Promise<{success: boolean, track?: Object, message?: string}>} Result with success status and played track
     */
    async previous() {
        try {
            // Check if there's any history to go back to
            if (!this.history || this.history.length === 0) {
                logger.debug('No history available for previous track', { guildId: this.guildId });
                return {
                    success: false,
                    message: 'Không có bài hát nào trong lịch sử để quay lại!'
                };
            }

            // Get the most recent track from history
            const previousEntry = this.history.shift();

            if (!previousEntry || !previousEntry.track) {
                logger.debug('Invalid history entry for previous track', { guildId: this.guildId });
                return {
                    success: false,
                    message: 'Dữ liệu lịch sử không hợp lệ!'
                };
            }

            const previousTrack = previousEntry.track;

            // If there's a current track, push it to the front of the queue
            // so it plays next after the previous track finishes
            if (this.current) {
                this.tracks.unshift(this.current);
                logger.debug('Pushed current track to front of queue', {
                    guildId: this.guildId,
                    track: this.current.info?.title
                });
            }

            // Record user interaction for progress updates
            this.recordUserInteraction();

            // Play the previous track
            logger.info('Playing previous track from history', {
                guildId: this.guildId,
                track: previousTrack.info?.title,
                historyRemaining: this.history.length
            });

            // Set current to null first to avoid it being added to history again
            // when play() calls stopTrack
            const wasPlaying = this.current !== null;

            // Stop current playback if playing
            if (this.player && wasPlaying) {
                // Don't trigger the 'end' event logic which would play next track
                await this.player.stopTrack();
            }

            // Play the previous track directly
            this.current = previousTrack;
            this.paused = false;

            if (!this.player) {
                await this.connect();
            }

            await this.player.playTrack({ track: { encoded: previousTrack.encoded } });

            // Update now playing embed
            await this.updateNowPlaying();

            return {
                success: true,
                track: previousTrack,
                message: `Đang phát: ${previousTrack.info?.title}`
            };
        } catch (error) {
            logger.error('Failed to play previous track', {
                guildId: this.guildId,
                error: error.message
            });
            return {
                success: false,
                message: 'Đã xảy ra lỗi khi quay lại bài trước!'
            };
        }
    }

    /**
     * Jump to specific position in queue
     * @param {number} position - 1-based position
     * @returns {Promise<boolean>} Success status
     */
    async jump(position) {
        if (!Number.isInteger(position)) return false;
        if (position < 1 || position > this.tracks.length) return false;
        const index = position - 1;
        const [track] = this.tracks.splice(index, 1);
        if (!track) return false;
        await this.play(track);
        return true;
    }

    /**
     * Schedule leave after playback ends
     */
    scheduleLeave() {
        this.clearLeaveTimeout();
        const delay = this.manager.config.music.leaveOnEndDelay || PLAYBACK.AUTO_LEAVE_DELAY;
        if (this.manager.config.music.leaveOnEnd) {
            // Store text channel and stats before timeout (they may be gone after delay)
            const textChannelRef = this.textChannel;
            const guildId = this.guildId;
            const sessionStats = { ...this.stats };
            const delayMinutes = Math.round(delay / 60000);
            const footerText = this.manager.config?.bot?.footer || 'Miyao Music Bot';

            this.leaveTimeout = setTimeout(async () => {
                try {
                    // Send goodbye message before destroying
                    await this._sendGoodbyeMessage({
                        textChannel: textChannelRef,
                        guildId: guildId,
                        reason: 'end',
                        delayMinutes: delayMinutes,
                        tracksPlayed: sessionStats.tracksPlayed || 0,
                        totalDuration: sessionStats.totalDuration || 0,
                        footer: footerText
                    });
                } catch (error) {
                    logger.warn('Failed to send goodbye message on leave', {
                        guildId: guildId,
                        error: error.message
                    });
                }

                this.destroy();
            }, delay);
        }
    }

    /**
     * Clear leave timeout
     */
    clearLeaveTimeout() {
        if (this.leaveTimeout) {
            clearTimeout(this.leaveTimeout);
            this.leaveTimeout = null;
        }
    }

    /**
     * Send goodbye message when bot leaves voice channel
     * @private
     * @param {Object} options - Options for the goodbye message
     * @param {TextChannel} options.textChannel - Text channel to send message
     * @param {string} options.guildId - Guild ID for logging
     * @param {string} options.reason - Reason for leaving ('end' or 'empty')
     * @param {number} options.delayMinutes - Delay before leaving in minutes
     * @param {number} options.tracksPlayed - Number of tracks played in session
     * @param {number} options.totalDuration - Total duration played in ms
     * @param {string} options.footer - Footer text
     */
    async _sendGoodbyeMessage(options = {}) {
        const {
            textChannel,
            guildId,
            reason = 'end',
            delayMinutes = 1,
            tracksPlayed = 0,
            totalDuration = 0,
            footer = 'Miyao Music Bot'
        } = options;

        if (!textChannel) {
            logger.debug('Cannot send goodbye message: no text channel', { guildId });
            return;
        }

        try {
            // Use pre-imported EmbedBuilder for better performance

            // Format duration helper
            const formatDuration = ms => {
                if (!ms || ms <= 0) return '0 phút';
                const minutes = Math.floor(ms / 60000);
                const hours = Math.floor(minutes / 60);
                if (hours > 0) {
                    return `${hours} giờ ${minutes % 60} phút`;
                }
                return `${minutes} phút`;
            };

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('👋 Hẹn gặp lại!')
                .setDescription('Cảm ơn bạn đã nghe nhạc cùng mình')
                .setTimestamp();

            // Add session stats if available
            if (tracksPlayed > 0 || totalDuration > 0) {
                embed.addFields({
                    name: 'Phiên nghe nhạc',
                    value: `🎵 **${tracksPlayed}** bài • ⏱️ **${formatDuration(totalDuration)}**`,
                    inline: false
                });
            }

            // Add tips based on reason
            if (reason === 'end') {
                embed.addFields({
                    name: '💡 Mẹo',
                    value: '`/play` để tiếp tục • `/autoplay on` để phát nhạc liên tục',
                    inline: false
                });
                embed.setFooter({
                    text: `${footer} • Rời sau ${delayMinutes} phút không có nhạc`
                });
            } else if (reason === 'empty') {
                embed.addFields({
                    name: '💡 Mẹo',
                    value: '`/play` để phát nhạc • `/settings 247 on` để bot ở lại',
                    inline: false
                });
                embed.setFooter({
                    text: `${footer} • Rời sau ${delayMinutes} phút không có ai`
                });
            } else if (reason === 'disconnect') {
                // Bot was manually disconnected/kicked
                embed.addFields({
                    name: '💡 Mẹo',
                    value: '`/play` để bắt đầu lại phiên nhạc mới',
                    inline: false
                });
                embed.setFooter({
                    text: footer
                });
            }

            await textChannel.send({ embeds: [embed] });
            logger.debug('Goodbye message sent successfully', { guildId, reason });
        } catch (error) {
            logger.warn('Failed to send goodbye message', {
                guildId,
                reason,
                error: error.message
            });
        }
    }

    /**
     * Start progress updates with adaptive frequency
     * Updates continue as long as music is playing, with reduced frequency when idle
     * to balance UX (smooth progress bar) with API call optimization
     */
    startProgressUpdates() {
        this.stopProgressUpdates();

        // Reset interaction tracking when starting updates
        this.lastUserInteraction = Date.now();
        this.lastProgressUpdate = 0;
        this.progressUpdatePaused = false;

        // Track update count for adaptive frequency
        this.updateCount = 0;

        this.updateInterval = setInterval(async () => {
            try {
                // Don't update if no message or no current track
                if (!this.nowPlayingMessage || !this.current || !this.player) {
                    return;
                }

                // Check if player is actually playing (not paused, not ended)
                if (this.paused) {
                    // When paused, update less frequently (every 10 seconds) just to keep embed alive
                    const timeSinceLastUpdate = Date.now() - this.lastProgressUpdate;
                    if (timeSinceLastUpdate < 10000) {
                        return;
                    }
                }

                // Smart frequency adjustment based on user interaction
                const timeSinceInteraction = Date.now() - this.lastUserInteraction;
                const idleTimeout = TIME.PROGRESS_IDLE_TIMEOUT || 30000;

                // Calculate dynamic update interval based on idle time
                // Active: every 2s, Idle (30s-60s): every 5s, Very idle (60s+): every 10s
                let effectiveInterval;
                if (timeSinceInteraction <= idleTimeout) {
                    // User is active - use normal interval
                    effectiveInterval = TIME.PROGRESS_UPDATE_INTERVAL || 2000;
                    if (this.progressUpdatePaused) {
                        this.progressUpdatePaused = false;
                        logger.debug('Progress updates at full frequency (user active)', { guildId: this.guildId });
                    }
                } else if (timeSinceInteraction <= idleTimeout * 2) {
                    // User is idle - use reduced frequency (every 5s)
                    effectiveInterval = 5000;
                    if (!this.progressUpdatePaused) {
                        this.progressUpdatePaused = true;
                        logger.debug('Progress updates at reduced frequency (user idle)', { guildId: this.guildId });
                    }
                } else {
                    // User is very idle - use minimal frequency (every 10s)
                    // Still update to keep the embed looking alive
                    effectiveInterval = 10000;
                }

                // Debounce: Ensure minimum time between updates based on current frequency
                const timeSinceLastUpdate = Date.now() - this.lastProgressUpdate;
                const debounceTime = Math.max(effectiveInterval - 500, TIME.PROGRESS_UPDATE_DEBOUNCE || 1500);

                if (timeSinceLastUpdate < debounceTime) {
                    return;
                }

                await this.updateNowPlaying();
                this.lastProgressUpdate = Date.now();
                this.updateCount++;
            } catch (error) {
                logger.error('Failed to update now playing message', error);
            }
        }, TIME.PROGRESS_UPDATE_INTERVAL);
    }

    /**
     * Record user interaction to keep progress updates active
     * Call this when user interacts with music controls
     */
    recordUserInteraction() {
        this.lastUserInteraction = Date.now();

        // If updates were paused, they will resume on next interval
        if (this.progressUpdatePaused) {
            logger.debug('User interaction recorded, updates will resume', { guildId: this.guildId });
        }
    }

    /**
     * Stop progress updates
     */
    stopProgressUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Update now playing message
     * Optimized: Uses pre-imported modules instead of dynamic imports for better performance
     */
    async updateNowPlaying() {
        if (!this.nowPlayingMessage || !this.current || !this.player) {
            return;
        }

        try {
            // Use pre-imported modules (imported at top of file) for better performance
            // This avoids dynamic import overhead in this frequently-called method
            const currentPosition = this.player.position || 0;
            const embed = createNowPlayingEmbed(this.current, this, this.manager.config, currentPosition);
            const components = createNowPlayingButtons(this, false);

            await this.nowPlayingMessage.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            if (error.code === 10008 || error.code === 50001) {
                this.nowPlayingMessage = null;
                this.stopProgressUpdates();
            } else {
                logger.error('Failed to update now playing embed', error);
            }
        }
    }

    /**
     * Set now playing message
     * @param {Message} message - Discord message
     */
    setNowPlayingMessage(message) {
        this.nowPlayingMessage = message;
        this.recordUserInteraction(); // User interacted by playing a track
        if (message && this.current) {
            this.startProgressUpdates();
        } else {
            this.stopProgressUpdates();
        }
    }

    /**
     * Set autoplay state
     * @param {boolean} enabled - Enable/disable autoplay
     */
    setAutoplay(enabled) {
        this.autoplay = enabled;
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
     * @version 2.0.0 - Enhanced with RecommendationEngine
     */
    async addRelatedTrack() {
        if (!this.current || !this.current.info) {
            logger.warn('Cannot add related track: no current track', { guildId: this.guildId });
            return;
        }

        try {
            const track = this.current;
            const title = track.info.title;
            const author = track.info.author;

            // Configuration from constants
            const STRATEGY_TIMEOUT = AUTOPLAY?.STRATEGY_TIMEOUT || 2000;
            const RACE_COUNT = AUTOPLAY?.RACE_STRATEGIES_COUNT || 3;
            const MAX_CANDIDATES = AUTOPLAY?.MAX_CANDIDATES || 5;

            // Get the RecommendationEngine
            const recEngine = getRecommendationEngine();

            // Build recent history URLs to exclude
            const recentUrls = new Set(
                this.history
                    .slice(0, 10)
                    .map(h => h.track?.info?.uri)
                    .filter(Boolean)
            );
            recentUrls.add(track.info.uri); // Exclude current track

            logger.info('Autoplay: Starting enhanced recommendation', {
                guildId: this.guildId,
                currentTrack: title,
                currentAuthor: author,
                historyExcluded: recentUrls.size
            });

            let selectedTrack = null;
            let strategyUsed = 'none';

            // PHASE 1: Try collaborative filtering from guild history
            try {
                const collaborativeResults = recEngine.getCollaborativeRecommendations(
                    this.guildId,
                    track.info.uri,
                    title,
                    recentUrls,
                    5
                );

                if (collaborativeResults.length > 0) {
                    // Score and rank the results
                    const scoredResults = recEngine.scoreAndRank(collaborativeResults, {
                        referenceTrack: track,
                        guildProfile: recEngine.getGuildGenreProfile(this.guildId)
                    });

                    // Apply diversity
                    const diversified = recEngine.applyDiversity(scoredResults);

                    if (diversified.length > 0) {
                        // Pick from top candidates with some randomness
                        const pickIndex = Math.floor(Math.random() * Math.min(diversified.length, 3));
                        selectedTrack = diversified[pickIndex];
                        strategyUsed = 'collaborative';

                        logger.debug('Autoplay: Collaborative filtering succeeded', {
                            guildId: this.guildId,
                            track: selectedTrack.info.title,
                            score: selectedTrack.score,
                            resultsCount: collaborativeResults.length
                        });
                    }
                }
            } catch (collabError) {
                logger.debug('Autoplay: Collaborative filtering failed', {
                    guildId: this.guildId,
                    error: collabError.message
                });
            }

            // PHASE 2: If no collaborative results, use smart search strategies
            if (!selectedTrack) {
                // Build smart strategies using RecommendationEngine
                const searchStrategies = recEngine.buildAutoplayStrategies(track, this.guildId);

                /**
                 * Execute a single search strategy with timeout
                 */
                const executeStrategy = async strategy => {
                    const searchResult = await Promise.race([
                        this.manager.search(`ytsearch:${strategy.query}`, null),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Strategy timeout')), STRATEGY_TIMEOUT)
                        )
                    ]);

                    if (searchResult?.tracks?.length > 0) {
                        return { result: searchResult, strategy: strategy.name };
                    }
                    throw new Error('No results');
                };

                // Race the top strategies
                const raceStrategies = searchStrategies.slice(0, RACE_COUNT);
                let searchResult = null;

                try {
                    logger.debug(`Autoplay: Racing ${raceStrategies.length} smart strategies`, {
                        guildId: this.guildId,
                        strategies: raceStrategies.map(s => s.name)
                    });

                    const raceResult = await Promise.any(raceStrategies.map(strategy => executeStrategy(strategy)));

                    searchResult = raceResult.result;
                    strategyUsed = raceResult.strategy;
                } catch {
                    logger.debug('Autoplay: All racing strategies failed, trying sequential', {
                        guildId: this.guildId
                    });

                    // Sequential fallback
                    const remainingStrategies = searchStrategies.slice(RACE_COUNT);
                    for (const strategy of remainingStrategies) {
                        try {
                            const result = await executeStrategy(strategy);
                            searchResult = result.result;
                            strategyUsed = result.strategy;
                            break;
                        } catch {
                            // Continue to next strategy
                        }
                    }
                }

                if (searchResult?.tracks?.length > 0) {
                    // Filter out recent tracks and apply quality checks
                    const currentLower = title.toLowerCase();
                    const recentTitles = new Set(
                        this.history.slice(0, 5).map(h => h.track?.info?.title?.toLowerCase())
                    );

                    const candidates = searchResult.tracks.filter(t => {
                        // Skip if in recent or current
                        const tTitle = t.info?.title?.toLowerCase() || '';
                        if (tTitle === currentLower || recentTitles.has(tTitle)) return false;

                        // Use RecommendationEngine's quality check
                        if (recEngine.shouldSkipTrack(t)) return false;

                        return true;
                    });

                    if (candidates.length > 0) {
                        // Score candidates
                        const scoredCandidates = candidates.map(c => ({
                            ...c,
                            info: c.info,
                            score: 0
                        }));

                        const rankedCandidates = recEngine.scoreAndRank(scoredCandidates, {
                            referenceTrack: track
                        });

                        // Apply diversity and pick
                        const diversified = recEngine.applyDiversity(rankedCandidates);
                        const pickIndex = Math.floor(Math.random() * Math.min(diversified.length, MAX_CANDIDATES));
                        selectedTrack = diversified[pickIndex];
                    }
                }
            }

            // PHASE 3: Handle no results
            if (!selectedTrack) {
                logger.warn('Autoplay: No related tracks found after all strategies', {
                    guildId: this.guildId
                });
                this.current = null;
                this.scheduleLeave();
                return;
            }

            // Add the selected track
            selectedTrack.requester = 'autoplay';

            // Store detected metadata for future recommendations
            if (selectedTrack.detectedGenre) {
                selectedTrack._autoplayGenre = selectedTrack.detectedGenre;
            }
            if (selectedTrack.detectedMood) {
                selectedTrack._autoplayMood = selectedTrack.detectedMood;
            }

            logger.info('Autoplay: Added related track', {
                guildId: this.guildId,
                track: selectedTrack.info.title,
                author: selectedTrack.info.author,
                strategy: strategyUsed,
                score: selectedTrack.score || 0,
                genre: selectedTrack.detectedGenre || 'unknown',
                isSerendipity: selectedTrack.isSerendipity || false
            });

            this.tracks.push(selectedTrack);
            await this.play();

            // Send enhanced notification
            await this._sendAutoplayNotification(selectedTrack, strategyUsed);
        } catch (error) {
            logger.error('Autoplay error', { guildId: this.guildId, error: error.message, stack: error.stack });
            this.current = null;
            this.scheduleLeave();
        }
    }

    /**
     * Send autoplay notification to text channel
     * @param {Object} track - The track being played
     * @param {string} strategy - Strategy used to find the track
     * @private
     */
    async _sendAutoplayNotification(track, strategy = 'search') {
        if (!this.textChannel || !track) return;

        try {
            // Use pre-imported EmbedBuilder for better performance

            // Strategy icons for visual feedback
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

            // Build description based on strategy
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
                .setColor(isSerendipity ? '#E91E63' : '#9B59B6')
                .setDescription(
                    `${icon} **Autoplay${isSerendipity ? ' ✨' : ''}:** [${track.info.title}](${track.info.uri})\n` +
                    `└ 🎤 ${track.info.author}\n\n` +
                    `${reason}`
                )
                .setFooter({ text: '💡 Dùng /autoplay để tắt • /similar để xem thêm' });

            await this.textChannel.send({ embeds: [embed] });
        } catch (error) {
            logger.debug('Could not send autoplay notification', { guildId: this.guildId, error: error.message });
        }
    }

    /**
     * Destroy queue and disconnect
     */
    async destroy() {
        this.clearLeaveTimeout();
        this.stopProgressUpdates();

        if (this.player) {
            try {
                // CRITICAL FIX: Remove all event listeners to prevent memory leak
                // Each player has 6 event listeners (start, end, exception, stuck, closed, update)
                // Without this, listeners accumulate and cause memory leaks
                this.player.removeAllListeners('start');
                this.player.removeAllListeners('end');
                this.player.removeAllListeners('exception');
                this.player.removeAllListeners('stuck');
                this.player.removeAllListeners('closed');
                this.player.removeAllListeners('update');

                await this.manager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (err) {
                logger.warn('Error leaving voice channel', err);
            }
            this.player = null;
        }

        this.tracks = [];
        this.current = null;
        this.nowPlayingMessage = null;

        this.manager.queues.delete(this.guildId);
    }

    /**
     * Save track to database history (non-blocking)
     * @private
     */
    async _saveToDatabase(track) {
        try {
            // Dynamically import to avoid circular dependencies
            const { default: History } = await import('../database/models/History.js');

            // Get requester from track metadata
            const userId = track.requester || track.requesterId || 'unknown';

            // Save to database
            History.add(this.guildId, userId, track);

            logger.debug('Track saved to database history', {
                guildId: this.guildId,
                track: track.info?.title,
                userId
            });
        } catch (error) {
            // Don't throw - this is a non-critical operation
            logger.warn('Failed to save track to database history', {
                guildId: this.guildId,
                track: track?.info?.title,
                error: error.message
            });
        }
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue stats
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.tracks.length,
            historyLength: this.history.length,
            volume: this.volume,
            loop: this.loop,
            paused: this.paused,
            activeFilters: Object.keys(this.filters).filter(k => this.filters[k] !== null)
        };
    }
}

export default EnhancedQueue;
