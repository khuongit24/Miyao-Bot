/**
 * @file EnhancedQueue.js
 * @description Enhanced Queue with advanced features for music playback
 * @version 2.0.0 - Refactored: extracted FilterManager, ReconnectionManager, ProgressTracker, AutoplayManager
 */

import logger from '../utils/logger.js';
import { TIME, PLAYBACK, QUEUE } from '../utils/constants.js';
import { EmbedBuilder } from 'discord.js';
import { COLORS, ICONS } from '../config/design-system.js';
import { createOAuthErrorEmbed } from '../UI/embeds/ErrorEmbeds.js';

// Extracted managers
import { FilterManager } from './FilterManager.js';
import { ReconnectionManager } from './ReconnectionManager.js';
import { ProgressTracker } from './ProgressTracker.js';
import { AutoplayManager } from './AutoplayManager.js';
import { recordTrackEndFullListen } from '../events/autoPlaySuggestionHandler.js';
import History from '../database/models/History.js';

/**
 * Enhanced Queue with advanced features
 * Delegates specialized concerns to dedicated managers:
 * - FilterManager: audio filter state, presets, compatibility
 * - ReconnectionManager: exponential backoff reconnection
 * - ProgressTracker: adaptive now-playing message updates
 * - AutoplayManager: automatic track recommendation and queuing
 */
export class EnhancedQueue {
    /**
     * Create a new EnhancedQueue
     * @param {MusicManager} manager - Music manager instance
     * @param {string} guildId - Guild ID
     * @param {string} voiceChannelId - Voice channel ID
     * @param {TextChannel} textChannel - Text channel for notifications
     */
    constructor(manager, guildId, voiceChannelId, textChannel, options = {}) {
        this.manager = manager;
        this.guildId = guildId;
        this.voiceChannelId = voiceChannelId;
        this.textChannel = textChannel;

        this.tracks = [];
        this.current = null;
        this.player = null;
        this.loop = 'off';
        this.volume = options.volume ?? manager.config?.music?.defaultVolume ?? 50;
        this.paused = false;
        this.removeDuplicates = false;

        this.leaveTimeout = null;
        this._isLeavingGracefully = false;
        this._skippingToPrevious = false;

        // Track last activity time for stale queue detection
        this.lastActivityTime = Date.now();

        // YouTube OAuth failure detection
        this._oauthFailureDetected = false;
        this._consecutiveOAuthErrors = 0;

        // Dead-letter list for permanently failed tracks (EQ-H01)
        this.failedTracks = [];
        this.maxFailedTracks = 50;

        // Track history for analytics
        this.history = [];
        this.maxHistory = options.maxHistory ?? manager.config?.music?.maxHistorySize ?? QUEUE.MAX_HISTORY_SIZE;
        this._existingUris = new Set();
        this._uriIndexDirty = true;

        // Playback statistics
        this.stats = {
            tracksPlayed: 0,
            totalDuration: 0,
            skips: 0,
            errors: 0
        };

        // --- Extracted Managers ---
        /** @type {FilterManager} Audio filter management */
        this.filterManager = new FilterManager(guildId);

        /** @type {ReconnectionManager} Voice reconnection with backoff */
        this.reconnectionManager = new ReconnectionManager(guildId);

        /** @type {ProgressTracker} Now-playing progress updates */
        this.progressTracker = new ProgressTracker(guildId);

        /** @type {AutoplayManager} Automatic track recommendation */
        this.autoplayManager = new AutoplayManager(guildId);

        this._playerEventHandlers = null;

        // Playback watchdog — detects silent playback failures
        this._playbackWatchdogTimer = null;
        this._watchdogTrack = null;
        this._lastKnownPosition = 0;
        this._positionStallCount = 0;

        // Connection state flag — prevents voiceStateUpdate from destroying
        // the queue during connect() retry attempts
        this._isConnecting = false;
    }

    _markUriIndexDirty() {
        this._uriIndexDirty = true;
    }

    _getExistingUris() {
        if (!this._uriIndexDirty) {
            return this._existingUris;
        }

        this._existingUris = new Set();

        if (this.current?.info?.uri) {
            this._existingUris.add(this.current.info.uri);
        }

        for (const track of this.tracks) {
            if (track?.info?.uri) {
                this._existingUris.add(track.info.uri);
            }
        }

        this._uriIndexDirty = false;
        return this._existingUris;
    }

    /**
     * Check if an error message indicates a YouTube OAuth/authentication failure
     * @param {string} message - Error message to check
     * @returns {boolean}
     * @private
     */
    _isOAuthError(message) {
        if (!message) return false;
        const lower = message.toLowerCase();
        const oauthPatterns = [
            'login',
            'oauth',
            'all clients failed',
            'allclientsfailedexception',
            'requires authentication',
            'sign in to confirm',
            'status code 403',
            'embedder_identity_denied',
            'video requires login',
            'video player configuration error'
        ];
        return oauthPatterns.some(pattern => lower.includes(pattern));
    }

    /**
     * Try to find and play the failed track from an alternative source.
     * Searches SoundCloud first, then Deezer (if enabled).
     * If all sources fail, calls _handleAllSourcesFailed().
     * @param {Object} failedTrack - The track that failed to play
     * @private
     */
    async _tryAlternativeSource(failedTrack) {
        if (!failedTrack?.info?.title) {
            logger.warn('[EnhancedQueue] Cannot try alternative source: no track info', {
                guildId: this.guildId
            });
            this._handleAllSourcesFailed();
            return;
        }

        const searchTerms = `${failedTrack.info.title} ${failedTrack.info.author || ''}`.trim();

        const altSources = [{ prefix: 'scsearch', name: 'SoundCloud' }];
        if (process.env.DEEZER_ENABLED === 'true' && process.env.DEEZER_ARL) {
            altSources.push({ prefix: 'dzsearch', name: 'Deezer' });
        }

        for (const source of altSources) {
            try {
                const altQuery = `${source.prefix}:${searchTerms}`;
                const result = await this.manager.searchDirect(altQuery);

                if (result?.tracks?.length > 0) {
                    const altTrack = result.tracks[0];
                    logger.info(
                        `[EnhancedQueue] Found alternative on ${source.name}: ` +
                            `"${altTrack.info.title}" (original: "${failedTrack.info.title}")`,
                        { guildId: this.guildId }
                    );
                    this.tracks.unshift(altTrack);
                    this._sendSourceSwitchNotification(failedTrack, altTrack, source.name);
                    this._consecutiveOAuthErrors = 0;
                    await this.play();
                    return;
                }
            } catch (error) {
                logger.warn(`[EnhancedQueue] Alternative source ${source.name} failed: ${error.message}`, {
                    guildId: this.guildId
                });
            }
        }

        logger.error('[EnhancedQueue] All alternative sources failed', {
            guildId: this.guildId,
            originalTrack: failedTrack.info.title
        });
        this._handleAllSourcesFailed();
    }

    /**
     * Send a notification embed when the bot switches to an alternative source.
     * @param {Object} originalTrack - The track that failed
     * @param {Object} altTrack - The alternative track found
     * @param {string} sourceName - Name of the alternative source
     * @private
     */
    _sendSourceSwitchNotification(originalTrack, altTrack, sourceName) {
        if (!this.textChannel) return;

        const embed = {
            color: 0xffa500,
            title: '\uD83D\uDD04 Tự động chuyển nguồn nhạc',
            description: [
                `\u26A0\uFE0F YouTube không khả dụng cho bài **${originalTrack.info.title}**`,
                `\uD83D\uDD04 Đã tự động tìm trên **${sourceName}**`,
                `\uD83C\uDFB5 Đang phát: **${altTrack.info.title}** — ${altTrack.info.author || 'Unknown'}`
            ].join('\n'),
            footer: { text: 'Chất lượng âm thanh có thể khác biệt do nguồn nhạc khác nhau' }
        };

        this.textChannel.send({ embeds: [embed] }).catch(err => {
            logger.warn(`[EnhancedQueue] Failed to send source switch notification: ${err.message}`, {
                guildId: this.guildId
            });
        });
    }

    /**
     * Handle the case when all alternative sources have failed.
     * Sends an error embed, clears the queue, and schedules leave.
     * @private
     */
    _handleAllSourcesFailed() {
        if (this.textChannel) {
            const embed = {
                color: 0xff0000,
                title: '\u274C Không thể phát nhạc',
                description: [
                    'Tất cả nguồn nhạc đều không khả dụng.',
                    '',
                    '**Nguyên nhân có thể:**',
                    '\u2022 YouTube yêu cầu xác thực OAuth',
                    '\u2022 SoundCloud không tìm thấy bài tương tự',
                    '\u2022 Kết nối mạng không ổn định',
                    '',
                    '**Giải pháp:**',
                    '\u2022 Thử lại sau vài phút',
                    '\u2022 Sử dụng URL trực tiếp từ SoundCloud hoặc Bandcamp',
                    '\u2022 Liên hệ admin để kiểm tra cấu hình OAuth'
                ].join('\n')
            };
            this.textChannel.send({ embeds: [embed] }).catch(() => {});
        }
        this.tracks = [];
        this.current = null;
        this.scheduleLeave();
    }

    /**
     * Start a playback watchdog timer after playTrack() succeeds.
     * If the 'start' event doesn't fire within the timeout, treat as silent playback failure.
     * Also resets position stall tracking for the new track.
     * @param {Object} track - The track that was sent to Lavalink
     * @private
     */
    _startPlaybackWatchdog(track) {
        this._clearPlaybackWatchdog();
        this._watchdogTrack = track;
        this._lastKnownPosition = 0;
        this._positionStallCount = 0;

        // DISABLED (v1.11.3): The 15s watchdog produces false positives
        // with Shoukaku 4.3.0 + Lavalink 4.2.1, causing infinite
        // source-switching loops (YouTube → SoundCloud → repeat).
        // The position stall detection (onUpdate handler, ~30s) serves
        // as a more reliable fallback for genuinely stuck tracks.
        // const WATCHDOG_TIMEOUT_MS = 15000;
        // this._playbackWatchdogTimer = setTimeout(() => { ... }, WATCHDOG_TIMEOUT_MS);
    }

    /**
     * Clear the playback watchdog timer.
     * Called when: start event fires, exception fires, stuck fires, stop/destroy, or closed fires.
     * @private
     */
    _clearPlaybackWatchdog() {
        if (this._playbackWatchdogTimer) {
            clearTimeout(this._playbackWatchdogTimer);
            this._playbackWatchdogTimer = null;
        }
        this._watchdogTrack = null;
    }

    /**
     * Handle silent playback failure — track was sent to Lavalink but no audio started.
     * Notifies the user, then tries alternative sources (SoundCloud, Deezer).
     * If alternatives fail, skips to the next queued track or schedules leave.
     * @param {Object} failedTrack - The track that failed to play
     * @private
     */
    async _handleSilentPlaybackFailure(failedTrack) {
        // Notify user about the silent failure
        if (this.textChannel) {
            const trackTitle = failedTrack?.info?.title || 'Unknown';
            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setDescription(
                    `${ICONS.WARNING} **Phát hiện lỗi phát nhạc im lặng**\n\n` +
                        `Bài hát **${trackTitle}** không phát được âm thanh.\n` +
                        `Đang thử tìm từ nguồn nhạc khác...`
                );
            this.textChannel.send({ embeds: [embed] }).catch(() => {});
        }

        // Try alternative sources
        try {
            await this._tryAlternativeSource(failedTrack);
        } catch (error) {
            logger.error('Alternative source fallback failed after silent playback failure', {
                guildId: this.guildId,
                error: error.message
            });
            // Try next track in queue
            if (this.tracks.length > 0) {
                this.play().catch(err => {
                    logger.error('Next track play failed after silent failure recovery', {
                        guildId: this.guildId,
                        error: err.message
                    });
                    this.scheduleLeave();
                });
            } else {
                this.current = null;
                this.scheduleLeave();
            }
        }
    }

    /**
     * Handle position stall — track "started" but audio position hasn't advanced.
     * This catches cases where Lavalink reports playing but no audio reaches Discord.
     * @param {Object} stalledTrack - The track that appears stalled
     * @private
     */
    async _handlePositionStall(stalledTrack) {
        logger.warn('Position stall detected — track playing but audio not advancing', {
            guildId: this.guildId,
            track: stalledTrack?.info?.title,
            position: this._lastKnownPosition,
            stallCount: this._positionStallCount
        });

        // Notify user
        if (this.textChannel) {
            const trackTitle = stalledTrack?.info?.title || 'Unknown';
            this.textChannel
                .send(`⚠️ Phát hiện bài **${trackTitle}** bị kẹt (không có âm thanh). Đang thử nguồn nhạc khác...`)
                .catch(() => {});
        }

        // Stop current playback before retrying
        try {
            if (this.player) {
                await this.player.stopTrack();
            }
        } catch {
            /* ignore */
        }

        // Reset stall counter
        this._positionStallCount = 0;

        // Try alternative sources
        try {
            await this._tryAlternativeSource(stalledTrack);
        } catch (error) {
            logger.error('Alternative source fallback failed after position stall', {
                guildId: this.guildId,
                error: error.message
            });
            if (this.tracks.length > 0) {
                this.play().catch(err => {
                    logger.error('Next track play failed after stall recovery', {
                        guildId: this.guildId,
                        error: err.message
                    });
                    this.scheduleLeave();
                });
            } else {
                this.current = null;
                this.scheduleLeave();
            }
        }
    }

    // ==========================================
    // Backward-compatible property accessors
    // ==========================================

    /**
     * Get/set filters (delegates to FilterManager)
     * @type {Object}
     */
    get filters() {
        return this.filterManager.filters;
    }

    set filters(value) {
        this.filterManager.filters = value;
    }

    /**
     * Get/set autoplay state (delegates to AutoplayManager)
     * @type {boolean}
     */
    get autoplay() {
        return this.autoplayManager.enabled;
    }

    set autoplay(value) {
        this.autoplayManager.enabled = value;
    }

    /**
     * Get/set now playing message (delegates to ProgressTracker)
     * @type {import('discord.js').Message|null}
     */
    get nowPlayingMessage() {
        return this.progressTracker.nowPlayingMessage;
    }

    set nowPlayingMessage(value) {
        this.progressTracker.nowPlayingMessage = value;
    }

    /**
     * Get/set last user interaction timestamp (delegates to ProgressTracker)
     * @type {number}
     */
    get lastUserInteraction() {
        return this.progressTracker.lastUserInteraction;
    }

    set lastUserInteraction(value) {
        this.progressTracker.lastUserInteraction = value;
    }

    /**
     * Get reconnection state (delegates to ReconnectionManager)
     * @type {Object}
     */
    get reconnectionState() {
        return this.reconnectionManager.state;
    }

    // ==========================================
    // Connection & Player Setup
    // ==========================================

    /**
     * Connect with retry logic
     * @param {number} retries - Number of retry attempts
     * @returns {Promise<Player>}
     */
    async connect(retries = 3) {
        this._isConnecting = true;
        try {
            for (let i = 0; i < retries; i++) {
                try {
                    // Check if queue was destroyed between retries
                    if (!this.manager.queues.has(this.guildId)) {
                        throw new Error('Queue was destroyed during connection retry');
                    }

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
                    // Exponential backoff: 1s, 2s, 4s
                    const backoffMs = 1000 * Math.pow(2, i);
                    logger.debug(`Retrying connection in ${backoffMs}ms`, { guildId: this.guildId });
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                }
            }
        } finally {
            this._isConnecting = false;
        }
    }

    /**
     * Reconnect after node failure with exponential backoff
     * Delegates to ReconnectionManager
     */
    async reconnect() {
        return this.reconnectionManager.reconnect(this);
    }

    _detachPlayerEventHandlers(player = this.player) {
        if (!player || !this._playerEventHandlers) {
            return;
        }

        for (const [eventName, handler] of Object.entries(this._playerEventHandlers)) {
            if (typeof player.off === 'function') {
                player.off(eventName, handler);
            } else if (typeof player.removeListener === 'function') {
                player.removeListener(eventName, handler);
            }
        }

        this._playerEventHandlers = null;
    }

    /**
     * Setup enhanced player events
     */
    setupPlayerEvents() {
        if (!this.player) return;

        this._detachPlayerEventHandlers(this.player);

        const onStart = async data => {
            // Clear playback watchdog — track has started on Lavalink
            this._clearPlaybackWatchdog();

            logger.music('Track started', {
                guildId: this.guildId,
                track: data.track?.info?.title
            });
            this.clearLeaveTimeout();
            this.stats.tracksPlayed++;

            // Add to in-memory history (compact track shape to reduce memory)
            if (this.current && this.loop !== 'track') {
                // EQ-M01: Store user ID string instead of full User object to reduce memory
                const rawRequester = this.current.requester || this.current.requesterId || null;
                const requesterId = typeof rawRequester === 'string' ? rawRequester : rawRequester?.id || rawRequester;
                this.history.unshift({
                    track: {
                        info: {
                            title: this.current.info?.title || 'Unknown Track',
                            uri: this.current.info?.uri || null,
                            length: this.current.info?.length || 0
                        },
                        requester: requesterId
                    },
                    playedAt: Date.now()
                });
                if (this.history.length > this.maxHistory) {
                    this.history.pop();
                }

                // Add to database history (non-blocking)
                // EQ-H02: Capture reference before async call to avoid stale this.current in catch
                const trackForDb = this.current;
                this._saveToDatabase(trackForDb).catch(error => {
                    logger.error('Failed to save track to database history', {
                        guildId: this.guildId,
                        track: trackForDb?.info?.title,
                        error
                    });
                });
            }

            if (this.nowPlayingMessage) {
                this.startProgressUpdates();
            }
        };

        const onEnd = data => {
            logger.music('Track ended', { guildId: this.guildId, reason: data.reason });
            this.stopProgressUpdates();

            if (this.current) {
                this.stats.totalDuration += this.current?.info?.length || 0;
            }

            // Auto-play feedback: record full listen when track finishes naturally
            if (data.reason === 'finished' && this.current?.requester && this.current?.info?.uri) {
                try {
                    recordTrackEndFullListen(this.current.requester, this.current.info.uri);
                } catch {
                    /* non-critical */
                }
            }

            if (data.reason === 'replaced') return;

            // Guard: previous() is handling playback, skip queue advancement
            if (this._skippingToPrevious) return;

            // BUG-018: stop() already called scheduleLeave(), don't double-schedule
            if (this._isStopping) {
                this._isStopping = false;
                return;
            }

            if (this.loop === 'track' && this.current) {
                // BUG-014: catch unhandled promise rejection from async play()
                this.play(this.current).catch(error => {
                    logger.error('Loop track play failed', { guildId: this.guildId, error: error.message });
                    this.scheduleLeave();
                });
                return;
            }

            if (this.loop === 'queue' && this.current) {
                this.tracks.push(this.current);
            }

            if (this.tracks.length > 0) {
                // BUG-014: catch unhandled promise rejection from async play()
                this.play().catch(error => {
                    logger.error('Next track play failed', { guildId: this.guildId, error: error.message });
                    this.scheduleLeave();
                });
            } else if (this.autoplay && this.current) {
                logger.info('Autoplay enabled, searching for related track', { guildId: this.guildId });
                this.addRelatedTrack().catch(error => {
                    logger.error('Autoplay failed', { guildId: this.guildId, error: error.message });
                    this.stopProgressUpdates();
                    this.current = null;
                    this.paused = false;
                    this.scheduleLeave();
                });
            } else {
                this.current = null;
                this.scheduleLeave();
            }

            this._markUriIndexDirty();
        };

        const onException = data => {
            this._clearPlaybackWatchdog();

            const exceptionMsg = data.exception?.message || data.exception?.cause || '';
            const isOAuth = this._isOAuthError(exceptionMsg);

            if (isOAuth) {
                this._consecutiveOAuthErrors++;
                logger.warn(
                    'YouTube OAuth failure detected — YouTube requires authentication. Check Lavalink OAuth configuration (YT_OAUTH_REFRESH_TOKEN).',
                    {
                        guildId: this.guildId,
                        exception: data.exception,
                        consecutiveOAuthErrors: this._consecutiveOAuthErrors
                    }
                );
            } else {
                this._consecutiveOAuthErrors = 0;
                logger.error('Player exception', { guildId: this.guildId, exception: data.exception });
            }
            this.stats.errors++;

            // Notify user about the exception
            if (this.textChannel && this.current) {
                const trackTitle = this.current?.info?.title || 'Unknown';
                if (isOAuth && !this._oauthFailureDetected) {
                    // Send OAuth error message ONCE per queue session
                    this._oauthFailureDetected = true;
                    const embed = createOAuthErrorEmbed(trackTitle);
                    this.textChannel.send({ embeds: [embed] }).catch(() => {});
                } else if (!isOAuth) {
                    this.textChannel.send(`⏭️ Bỏ qua bài hát do lỗi phát: **${trackTitle}**`).catch(() => {});
                }
                // If isOAuth and already detected: silently skip
            }

            // v1.11.0: If consecutive OAuth failures, try alternative sources instead of clearing queue
            if (isOAuth && this._consecutiveOAuthErrors >= 3) {
                logger.warn('Consecutive OAuth failures detected, attempting alternative source fallback', {
                    guildId: this.guildId,
                    skippedTracks: this.tracks.length,
                    failedTrack: this.current?.info?.title
                });
                this._tryAlternativeSource(this.current).catch(error => {
                    logger.error('Alternative source fallback failed', {
                        guildId: this.guildId,
                        error: error.message
                    });
                    this._handleAllSourcesFailed();
                });
                return;
            }

            if (this.tracks.length > 0) {
                // BUG-014: catch unhandled promise rejection from async play()
                this.play().catch(error => {
                    logger.error('Exception recovery play failed', { guildId: this.guildId, error: error.message });
                    this.scheduleLeave();
                });
            } else {
                this.scheduleLeave();
            }
        };

        const onStuck = data => {
            this._clearPlaybackWatchdog();

            logger.warn('Player stuck', { guildId: this.guildId, threshold: data.thresholdMs });
            this.stats.errors++;

            // Stuck events with OAuth failures often manifest as timeouts
            // If we already know OAuth is broken, don't burn through the queue
            if (this._oauthFailureDetected) {
                logger.warn('Player stuck while OAuth failure active — likely same root cause, clearing queue', {
                    guildId: this.guildId
                });
                this.tracks = [];
                this.scheduleLeave();
                return;
            }

            // Notify user about the stuck track
            if (this.textChannel && this.current) {
                const trackTitle = this.current?.info?.title || 'Unknown';
                this.textChannel.send(`⏭️ Bài hát bị kẹt, đang bỏ qua: **${trackTitle}**`).catch(() => {});
            }

            if (this.tracks.length > 0) {
                // BUG-014: catch unhandled promise rejection from async play()
                this.play().catch(error => {
                    logger.error('Stuck recovery play failed', { guildId: this.guildId, error: error.message });
                    this.scheduleLeave();
                });
            } else {
                this.scheduleLeave();
            }
        };

        const onClosed = data => {
            logger.warn('WebSocket closed', { guildId: this.guildId, code: data.code, reason: data.reason });
            this._clearPlaybackWatchdog();

            // DAVE protocol (E2EE) enforcement — code 4017
            // Requires Lavalink v4.2.1+ and Shoukaku v4.2.0+ to handle properly
            if (data.code === 4017) {
                logger.warn('DAVE protocol (E2EE) required by Discord — ensure Lavalink v4.2.1+ and Shoukaku v4.2.0+', {
                    guildId: this.guildId,
                    reason: data.reason
                });
            }

            // FIX: Clean up Shoukaku's internal connection BEFORE nulling player.
            // Without this, Shoukaku's connections map retains a stale entry for this guild,
            // causing all subsequent joinVoiceChannel() calls to throw
            // "This guild already have an existing connection".
            try {
                this.manager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (err) {
                logger.debug('Error cleaning Shoukaku connection on WebSocket close', {
                    guildId: this.guildId,
                    error: err?.message
                });
            }

            // Null out player so next play() triggers fresh connection
            this.player = null;

            // If we were actively playing, attempt reconnection
            if (this.current && !this._isStopping && !this._isLeavingGracefully) {
                logger.info('Attempting reconnection after unexpected WebSocket close', {
                    guildId: this.guildId,
                    currentTrack: this.current?.info?.title
                });
                this.reconnectionManager.reconnect(this).catch(error => {
                    logger.error('Reconnection after WebSocket close failed', {
                        guildId: this.guildId,
                        error: error.message
                    });
                    this.current = null;
                    this.scheduleLeave();
                });
            }
        };

        const onUpdate = data => {
            // Position stall detection — catches cases where Lavalink reports "playing"
            // but audio position never advances (e.g., broken stream, voice connection issue)
            const position = data?.state?.position ?? 0;

            if (this.current && !this.paused && position > 0) {
                // Track is advancing — reset stall counter
                if (position !== this._lastKnownPosition) {
                    this._positionStallCount = 0;
                    this._lastKnownPosition = position;
                } else {
                    this._positionStallCount++;
                    if (this._positionStallCount >= 6 && this.current) {
                        this._positionStallCount = 0;
                        this._handlePositionStall(this.current);
                    }
                }
            } else if (position > 0) {
                this._lastKnownPosition = position;
                this._positionStallCount = 0;
            }
        };

        this._playerEventHandlers = {
            start: onStart,
            end: onEnd,
            exception: onException,
            stuck: onStuck,
            closed: onClosed,
            update: onUpdate
        };

        this.player.on('start', onStart);
        this.player.on('end', onEnd);
        this.player.on('exception', onException);
        this.player.on('stuck', onStuck);
        this.player.on('closed', onClosed);
        this.player.on('update', onUpdate);
    }

    // ==========================================
    // Filter Methods (delegate to FilterManager)
    // ==========================================

    /**
     * Apply filters to player
     * @returns {Promise<boolean>} Success status
     */
    async applyFilters() {
        return this.filterManager.applyFilters(this.player);
    }

    /**
     * Clear only conflicting filters when applying a new filter type
     * @param {string} newFilterType - The type of filter being applied
     * @returns {string[]} Array of filter types that were cleared
     * @private
     */
    _clearConflictingFilters(newFilterType) {
        return this.filterManager._clearConflictingFilters(newFilterType);
    }

    /**
     * Get filters that would conflict with a new filter type
     * @param {string} filterType - The type of filter to check
     * @returns {string[]} Array of currently active conflicting filter names
     */
    getConflictingActiveFilters(filterType) {
        return this.filterManager.getConflictingActiveFilters(filterType);
    }

    /**
     * Clear all filters and reset to default state
     * @returns {Promise<boolean>} Success status
     */
    async clearFilters() {
        return this.filterManager.clearFilters(this.player);
    }

    /**
     * Get active filter names
     * @returns {string[]} Array of active filter names
     */
    getActiveFilters() {
        return this.filterManager.getActiveFilters();
    }

    /**
     * Set equalizer preset
     * @param {string} preset - Preset name (flat, bass, rock, jazz, pop)
     * @returns {Promise<boolean>} Success status
     */
    async setEqualizer(preset) {
        return this.filterManager.setEqualizer(preset, this.player);
    }

    /**
     * Set nightcore filter
     * @param {boolean} enabled - Enable/disable nightcore
     * @returns {Promise<boolean>} Success status
     */
    async setNightcore(enabled) {
        return this.filterManager.setNightcore(enabled, this.player);
    }

    /**
     * Set vaporwave filter
     * @param {boolean} enabled - Enable/disable vaporwave
     * @returns {Promise<boolean>} Success status
     */
    async setVaporwave(enabled) {
        return this.filterManager.setVaporwave(enabled, this.player);
    }

    /**
     * Set 8D audio filter
     * @param {boolean} enabled - Enable/disable 8D
     * @returns {Promise<boolean>} Success status
     */
    async set8D(enabled) {
        return this.filterManager.set8D(enabled, this.player);
    }

    /**
     * Set karaoke filter
     * @param {boolean} enabled - Enable/disable karaoke
     * @returns {Promise<boolean>} Success status
     */
    async setKaraoke(enabled) {
        return this.filterManager.setKaraoke(enabled, this.player);
    }

    /**
     * Set timescale (speed/pitch/rate)
     * @param {Object} options - { speed?, pitch?, rate? }
     * @returns {Promise<boolean>} Success status
     */
    async setTimescale(options) {
        return this.filterManager.setTimescale(options, this.player);
    }

    // ==========================================
    // Queue Management
    // ==========================================

    /**
     * Add track(s) to queue
     * @param {Object|Object[]} track - Track or array of tracks
     * @param {Object} options - Options for adding tracks
     * @param {boolean} options.skipDuplicateCheck - Skip duplicate check
     * @returns {Object} Result with added count and skipped duplicates
     */
    add(track, options = {}) {
        let tracks = Array.isArray(track) ? track : [track];
        const skipDuplicateCheck = options.skipDuplicateCheck || false;

        // Enforce max queue size (configurable via config.music.maxQueueSize)
        const maxQueueSize = this.manager.config?.music?.maxQueueSize || QUEUE.MAX_SIZE;
        if (this.tracks.length >= maxQueueSize) {
            logger.warn('Queue full, rejecting tracks', {
                guildId: this.guildId,
                currentSize: this.tracks.length,
                maxSize: maxQueueSize,
                rejected: tracks.length
            });
            return {
                added: 0,
                skipped: tracks.length,
                skippedTracks: [],
                total: this.tracks.length,
                error: 'QUEUE_FULL',
                maxSize: maxQueueSize
            };
        }

        // Trim incoming tracks to fit within limit
        const availableSlots = maxQueueSize - this.tracks.length;
        let trimmed = 0;
        if (tracks.length > availableSlots) {
            trimmed = tracks.length - availableSlots;
            tracks = tracks.slice(0, availableSlots);
            logger.info('Trimmed tracks to fit queue limit', {
                guildId: this.guildId,
                requested: tracks.length + trimmed,
                accepted: tracks.length,
                trimmed
            });
        }

        let addedCount = 0;
        const skippedDuplicates = [];

        if (this.removeDuplicates && !skipDuplicateCheck) {
            const existingUris = this._getExistingUris();

            for (const t of tracks) {
                const uri = t.info?.uri;

                if (uri && existingUris.has(uri)) {
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
                    this.tracks.push(t);
                    addedCount++;

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
            this.tracks.push(...tracks);
            addedCount = tracks.length;

            for (const addedTrack of tracks) {
                const uri = addedTrack?.info?.uri;
                if (uri) {
                    this._getExistingUris().add(uri);
                }
            }
        }

        // Update activity timestamp
        if (addedCount > 0) {
            this.lastActivityTime = Date.now();
        }

        return {
            added: addedCount,
            skipped: skippedDuplicates.length + trimmed,
            skippedTracks: skippedDuplicates,
            total: this.tracks.length,
            ...(trimmed > 0 && { trimmed, maxSize: maxQueueSize })
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

        if (this.current?.info?.uri === uri) {
            return true;
        }

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
        this._markUriIndexDirty();

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

    // ==========================================
    // Playback Control
    // ==========================================

    /**
     * Play a track or next in queue
     * @param {Object} [track] - Specific track to play
     * @returns {Promise<boolean>} Success status
     */
    async play(track) {
        // Update activity timestamp
        this.lastActivityTime = Date.now();

        const maxRetries = this.manager.config?.music?.playMaxRetries || PLAYBACK.TRACK_PLAY_MAX_RETRIES;
        let currentTrack = track;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (!this.player) {
                await this.connect();
            }

            if (!currentTrack) {
                currentTrack = this.tracks.shift();
                this._markUriIndexDirty();
            }

            const toPlay = currentTrack;

            if (!toPlay) {
                this.current = null;
                this.scheduleLeave();
                return false;
            }

            this.current = toPlay;
            this.paused = false;

            try {
                // FIX-CMD-C02: Guard against lazy tracks with encoded: null
                // These tracks (from trending/discovery) must be resolved before playback
                if (!toPlay.encoded && toPlay._requiresResolve && toPlay.info?.uri) {
                    logger.debug('Resolving lazy track before playback', {
                        guildId: this.guildId,
                        uri: toPlay.info.uri
                    });
                    try {
                        const result = await this.manager.search(toPlay.info.uri);
                        if (result?.tracks?.length > 0) {
                            const resolved = result.tracks[0];
                            toPlay.encoded = resolved.encoded;
                            toPlay.info = resolved.info || toPlay.info;
                            delete toPlay._requiresResolve;
                        } else {
                            logger.warn('Failed to resolve lazy track — skipping', {
                                guildId: this.guildId,
                                uri: toPlay.info.uri
                            });
                            this.current = null;
                            // Move to next track if available
                            if (this.tracks.length > 0) {
                                currentTrack = this.tracks.shift();
                                this._markUriIndexDirty();
                                continue;
                            }
                            this.scheduleLeave();
                            return false;
                        }
                    } catch (resolveErr) {
                        logger.error('Error resolving lazy track', {
                            guildId: this.guildId,
                            error: resolveErr.message
                        });
                        this.current = null;
                        if (this.tracks.length > 0) {
                            currentTrack = this.tracks.shift();
                            this._markUriIndexDirty();
                            continue;
                        }
                        this.scheduleLeave();
                        return false;
                    }
                }

                await this.player.playTrack({ track: { encoded: toPlay.encoded } });
                // Start playback watchdog — detects if track never starts
                this._startPlaybackWatchdog(toPlay);

                // Reset consecutive OAuth errors on success
                this._consecutiveOAuthErrors = 0;
                return true;
            } catch (error) {
                const isOAuth = this._isOAuthError(error.message);

                if (isOAuth) {
                    this._consecutiveOAuthErrors++;
                }

                logger.error('Failed to play track', {
                    error: error.message,
                    attempt: attempt + 1,
                    maxRetries,
                    remainingTracks: this.tracks.length,
                    isOAuthError: isOAuth,
                    consecutiveOAuthErrors: this._consecutiveOAuthErrors
                });
                this.stats.errors++;

                // Notify user that this track is being skipped due to error
                if (this.textChannel) {
                    const trackTitle = toPlay?.info?.title || 'Unknown';
                    if (isOAuth && !this._oauthFailureDetected) {
                        this._oauthFailureDetected = true;
                        const embed = createOAuthErrorEmbed(trackTitle);
                        this.textChannel.send({ embeds: [embed] }).catch(() => {});
                    } else if (!isOAuth) {
                        this.textChannel.send(`⏭️ Bỏ qua bài hát do lỗi phát: **${trackTitle}**`).catch(() => {});
                    }
                }

                // Break retry loop early on consecutive OAuth failures
                if (isOAuth && this._consecutiveOAuthErrors >= 2) {
                    logger.warn('Consecutive OAuth errors in play() retry loop — aborting retries', {
                        guildId: this.guildId,
                        consecutiveOAuthErrors: this._consecutiveOAuthErrors,
                        remainingTracks: this.tracks.length
                    });
                    this.tracks = [];
                    this.current = null;
                    this.paused = false;
                    return false;
                }

                if (!currentTrack) {
                    this.current = null;
                    this.paused = false;
                    return false;
                }

                // P1-02: Dead-letter the failed track and advance to next track
                // instead of retrying the same broken track repeatedly
                const failedEntry = {
                    track: currentTrack,
                    failedAt: Date.now(),
                    reason: 'play_error',
                    error: error.message,
                    attempt: attempt + 1
                };
                this.failedTracks.push(failedEntry);
                if (this.failedTracks.length > this.maxFailedTracks) {
                    this.failedTracks.shift();
                }
                logger.warn('Track moved to dead-letter after play failure — advancing to next', {
                    guildId: this.guildId,
                    track: currentTrack.info?.title,
                    error: error.message,
                    failedTracksCount: this.failedTracks.length
                });

                // Emit trackFailed event
                try {
                    this.manager?.client?.emit('trackFailed', {
                        guildId: this.guildId,
                        track: currentTrack,
                        reason: 'play_error',
                        error: error.message,
                        textChannel: this.textChannel
                    });
                } catch {
                    /* non-critical */
                }

                // Clear currentTrack so next iteration advances to next queued track
                currentTrack = null;

                // If no more tracks in queue, schedule leave
                if (this.tracks.length === 0) {
                    this.current = null;
                    this.paused = false;
                    this.scheduleLeave();
                    return false;
                }

                const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                // Continue loop — next iteration will shift next track from queue
            }
        }

        // P1-02: All consecutive tracks failed — each was already dead-lettered in the catch block
        logger.warn('play() exhausted retry limit across multiple tracks', {
            guildId: this.guildId,
            maxRetries,
            failedTracksCount: this.failedTracks.length
        });
        this.current = null;
        this.paused = false;
        this.scheduleLeave();
        return false;
    }

    /**
     * Pause playback
     * @returns {Promise<boolean>} Success status
     */
    async pause() {
        if (!this.player || this.paused) return false;
        try {
            await this.player.setPaused(true);
            this.paused = true;
            this.recordUserInteraction();
            await this.updateNowPlaying();
            return true;
        } catch (error) {
            logger.error('Failed to pause playback', { guildId: this.guildId, error: error.message });
            return false;
        }
    }

    /**
     * Resume playback
     * @returns {Promise<boolean>} Success status
     */
    async resume() {
        if (!this.player || !this.paused) return false;
        try {
            await this.player.setPaused(false);
            this.paused = false;
            this.recordUserInteraction();
            await this.updateNowPlaying();
            return true;
        } catch (error) {
            logger.error('Failed to resume playback', { guildId: this.guildId, error: error.message });
            return false;
        }
    }

    /**
     * Skip current track
     * @returns {Promise<boolean>} Success status
     */
    async skip() {
        if (!this.player) return false;
        try {
            this.stats.skips++;
            this.recordUserInteraction();
            await this.player.stopTrack();
            return true;
        } catch (error) {
            logger.error('Failed to skip track', { guildId: this.guildId, error: error.message });
            return false;
        }
    }

    /**
     * Stop playback and clear queue
     * @returns {Promise<boolean>} Success status
     */
    async stop() {
        this.tracks = [];
        this.current = null;
        this.paused = false;
        this._oauthFailureDetected = false;
        this._consecutiveOAuthErrors = 0;
        this._clearPlaybackWatchdog();
        this._markUriIndexDirty();
        // BUG-018: set flag so end handler doesn't double-scheduleLeave
        // FIX-EQ-C01: Wrap in try-catch to prevent _isStopping from getting stuck
        this._isStopping = true;
        try {
            if (this.player) {
                await this.player.stopTrack();
            }
        } catch (err) {
            // Reset flag so queue is not permanently frozen
            this._isStopping = false;
            logger.error('stopTrack() failed during stop()', { guildId: this.guildId, error: err.message });
            // Still schedule leave even if stop failed
        }
        this.scheduleLeave();
        return true;
    }

    /**
     * Set volume
     * @param {number} volume - Volume level (0-200)
     * @returns {Promise<number>} Actual volume set
     */
    async setVolume(volume) {
        // EQ-M03: Validate volume is a number and not NaN
        if (typeof volume !== 'number' || isNaN(volume)) {
            throw new Error('Volume must be a number');
        }
        volume = Math.max(0, Math.min(200, volume));
        this.volume = volume;
        this.recordUserInteraction();
        if (!this.player) {
            return volume;
        }

        try {
            await this.player.setGlobalVolume(volume);
        } catch (error) {
            logger.error('Failed to set volume', { guildId: this.guildId, volume, error: error.message });
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
        try {
            this.recordUserInteraction();
            await this.player.seekTo(position);
            return true;
        } catch (error) {
            logger.error('Failed to seek playback', { guildId: this.guildId, position, error: error.message });
            return false;
        }
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
     * BUG-048: Excludes current track from shuffle when it appears in queue (from queue loop)
     */
    shuffle() {
        this.recordUserInteraction();

        // BUG-048: If current track is in queue (from queue loop), exclude it from shuffle
        const currentEncoded = this.current?.encoded;
        let currentTrackInQueue = null;
        if (currentEncoded && this.loop === 'queue') {
            const idx = this.tracks.findIndex(t => t.encoded === currentEncoded);
            if (idx !== -1) {
                currentTrackInQueue = this.tracks.splice(idx, 1)[0];
            }
        }

        // Fisher-Yates shuffle
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }

        // Re-add current track at the end if it was removed
        if (currentTrackInQueue) {
            this.tracks.push(currentTrackInQueue);
        }

        this._markUriIndexDirty();
    }

    /**
     * Clear queue
     */
    clear() {
        this.tracks = [];
        this._markUriIndexDirty();
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
        const removed = this.tracks.splice(index, 1)[0];
        this._markUriIndexDirty();
        return removed;
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
        this._markUriIndexDirty();
        return true;
    }

    /**
     * Go back to the previous track from history
     * @returns {Promise<{success: boolean, track?: Object, message?: string}>} Result
     */
    async previous() {
        try {
            this.clearLeaveTimeout();

            if (!this.history || this.history.length === 0) {
                logger.debug('No history available for previous track', { guildId: this.guildId });
                return {
                    success: false,
                    message: 'Không có bài hát nào trong lịch sử để quay lại!'
                };
            }

            const previousEntry = this.history.shift();

            if (!previousEntry || !previousEntry.track) {
                logger.debug('Invalid history entry for previous track', { guildId: this.guildId });
                return {
                    success: false,
                    message: 'Dữ liệu lịch sử không hợp lệ!'
                };
            }

            let previousTrack = previousEntry.track;

            if (!previousTrack.encoded) {
                const previousUri = previousTrack?.info?.uri;
                if (previousUri && typeof this.manager?.search === 'function') {
                    try {
                        const fallbackRequester = previousTrack.requester || { id: 'system' };
                        const searchResult = await this.manager.search(previousUri, fallbackRequester);
                        if (searchResult?.tracks?.length > 0) {
                            previousTrack = searchResult.tracks[0];
                        }
                    } catch (error) {
                        logger.warn('Failed to resolve previous track from URI', {
                            guildId: this.guildId,
                            uri: previousUri,
                            error: error.message
                        });
                    }
                }

                if (!previousTrack.encoded) {
                    logger.warn('Cannot play previous track: missing encoded payload', {
                        guildId: this.guildId,
                        title: previousTrack.info?.title
                    });
                    return {
                        success: false,
                        message: 'Không thể quay lại bài này vì dữ liệu phát nhạc không đầy đủ!'
                    };
                }
            }

            // EQ-H03: Save current track's playback position before switching
            if (this.current) {
                const position = this.player?.position || 0;
                this.current._savedPosition = position;
                this.tracks.unshift(this.current);
                this._markUriIndexDirty();
                logger.debug('Pushed current track to front of queue with saved position', {
                    guildId: this.guildId,
                    track: this.current.info?.title,
                    savedPosition: position
                });
            }

            this.recordUserInteraction();

            logger.info('Playing previous track from history', {
                guildId: this.guildId,
                track: previousTrack.info?.title,
                historyRemaining: this.history.length
            });

            const wasPlaying = this.current !== null;

            this._skippingToPrevious = true;
            try {
                if (this.player && wasPlaying) {
                    await this.player.stopTrack();
                }

                this.current = previousTrack;
                this.paused = false;

                if (!this.player) {
                    await this.connect();
                }

                await this.player.playTrack({ track: { encoded: previousTrack.encoded } });
            } finally {
                this._skippingToPrevious = false;
            }

            await this.updateNowPlaying();

            return {
                success: true,
                track: previousTrack,
                message: `Đang phát: ${previousTrack.info?.title}`
            };
        } catch (error) {
            this._skippingToPrevious = false;
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
        if (this.tracks.length === 0) return false;
        if (position < 1 || position > this.tracks.length) return false;
        const index = position - 1;
        const [track] = this.tracks.splice(index, 1);
        if (!track) return false;

        // EQ-M04: Validate track has a valid encoded field before playing
        if (!track.encoded) {
            // Attempt to resolve the track if it has a URI
            if (track.info?.uri) {
                try {
                    const result = await this.manager.search(track.info.uri);
                    if (result?.tracks?.length > 0) {
                        track.encoded = result.tracks[0].encoded;
                        track.info = result.tracks[0].info || track.info;
                    } else {
                        throw new Error(`Cannot resolve track: ${track.info?.title || 'Unknown'} — no results found`);
                    }
                } catch (resolveErr) {
                    logger.warn('Jump failed: could not resolve encoded data for track', {
                        guildId: this.guildId,
                        title: track.info?.title,
                        uri: track.info?.uri,
                        error: resolveErr.message
                    });
                    this._markUriIndexDirty();
                    throw new Error(
                        `Cannot jump to track "${track.info?.title || 'Unknown'}": failed to resolve encoded data — ${resolveErr.message}`
                    );
                }
            } else {
                logger.warn('Jump failed: track has no encoded data and no URI to resolve', {
                    guildId: this.guildId,
                    position,
                    title: track.info?.title
                });
                this._markUriIndexDirty();
                throw new Error(
                    `Cannot jump to track at position ${position}: track has no encoded data and no URI to resolve`
                );
            }
        }

        this._markUriIndexDirty();
        await this.play(track);
        return true;
    }

    // ==========================================
    // Leave & Goodbye
    // ==========================================

    /**
     * Schedule leave after playback ends
     */
    scheduleLeave() {
        this.clearLeaveTimeout();
        const delay = this.manager.config.music.leaveOnEndDelay || PLAYBACK.AUTO_LEAVE_DELAY;
        if (this.manager.config.music.leaveOnEnd) {
            const textChannelRef = this.textChannel;
            const guildId = this.guildId;
            const sessionStats = { ...this.stats };
            const delayMinutes = Math.round(delay / 60000);
            const footerText = this.manager.config?.bot?.footer || 'Miyao Music Bot';

            this.leaveTimeout = setTimeout(async () => {
                try {
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

                this._isLeavingGracefully = true;
                await this.destroy();
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
                .setColor(COLORS.PRIMARY)
                .setTitle('👋 Hẹn gặp lại!')
                .setDescription('Cảm ơn bạn đã nghe nhạc cùng mình')
                .setTimestamp();

            if (tracksPlayed > 0 || totalDuration > 0) {
                embed.addFields({
                    name: 'Phiên nghe nhạc',
                    value: `🎵 **${tracksPlayed}** bài • ⏱️ **${formatDuration(totalDuration)}**`,
                    inline: false
                });
            }

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

    // ==========================================
    // Progress & Autoplay (delegate to managers)
    // ==========================================

    /**
     * Start progress updates with adaptive frequency
     * Delegates to ProgressTracker
     */
    startProgressUpdates() {
        this.progressTracker.startProgressUpdates(this);
    }

    /**
     * Record user interaction to keep progress updates active
     * Delegates to ProgressTracker
     */
    recordUserInteraction() {
        this.progressTracker.recordUserInteraction();
    }

    /**
     * Stop progress updates
     * Delegates to ProgressTracker
     */
    stopProgressUpdates() {
        this.progressTracker.stopProgressUpdates();
    }

    /**
     * Update now playing message
     * Delegates to ProgressTracker
     */
    async updateNowPlaying() {
        return this.progressTracker.updateNowPlaying(this);
    }

    /**
     * Set now playing message
     * @param {Message} message - Discord message
     */
    setNowPlayingMessage(message) {
        this.progressTracker.setNowPlayingMessage(message, this);
    }

    /**
     * Set autoplay state
     * @param {boolean} enabled - Enable/disable autoplay
     */
    setAutoplay(enabled) {
        this.autoplayManager.setAutoplay(enabled);
    }

    /**
     * Add a related track when queue is empty (autoplay feature)
     * Delegates to AutoplayManager
     */
    async addRelatedTrack() {
        return this.autoplayManager.addRelatedTrack(this);
    }

    // ==========================================
    // Destroy & Stats
    // ==========================================

    /**
     * Destroy queue and disconnect.
     *
     * **Ownership**: Prefer calling {@link MusicManager#destroyQueue MusicManager.destroyQueue(guildId)}
     * rather than invoking this method directly. `MusicManager.destroyQueue()` performs
     * additional external cleanup (e.g. auto-play suggestion maps, logging) before
     * delegating here.
     *
     * Direct calls are acceptable only from *within* the queue itself (e.g. scheduled
     * leave timeout) or from managers that operate on behalf of the queue
     * (e.g. {@link ReconnectionManager} after exhausting reconnection retries).
     *
     * **What happens during destroy**:
     * 1. Clears the scheduled leave timeout.
     * 2. Stops progress-tracker updates.
     * 3. Removes all Shoukaku player event listeners and leaves the voice channel.
     * 4. Nullifies player, track list, current track, and now-playing message.
     * 5. Removes this queue from `MusicManager.queues` (idempotent with
     *    `MusicManager.destroyQueue()` which also calls `queues.delete()`).
     *
     * @warning Calling `destroy()` directly bypasses MusicManager-level cleanup.
     *          Use `MusicManager.destroyQueue(guildId)` unless you have a specific reason not to.
     */
    async destroy(options = {}) {
        const { skipManagerDelete = false } = options;

        this.clearLeaveTimeout();
        this.stopProgressUpdates();
        this._clearPlaybackWatchdog();

        if (this.player) {
            try {
                this._detachPlayerEventHandlers(this.player);

                await this.manager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (err) {
                logger.warn('Error leaving voice channel', err);
            }
            this.player = null;
        }

        this.tracks = [];
        this.current = null;
        this._oauthFailureDetected = false;
        this._consecutiveOAuthErrors = 0;
        this._markUriIndexDirty();
        this.nowPlayingMessage = null;

        if (skipManagerDelete) {
            return;
        }

        if (typeof this.manager?.destroyQueue === 'function') {
            await this.manager.destroyQueue(this.guildId, { skipDestroy: true });
            return;
        }

        this.manager?.queues?.delete(this.guildId);
    }

    /**
     * Save track to database history (non-blocking)
     * @private
     */
    async _saveToDatabase(track) {
        try {
            const userId = track.requester || track.requesterId || 'unknown';

            if (userId === '__cache_warm__') {
                logger.debug('Skipping history save for cache warming track', {
                    guildId: this.guildId,
                    track: track.info?.title
                });
                return;
            }

            History.add(this.guildId, userId, track);

            logger.debug('Track saved to database history', {
                guildId: this.guildId,
                track: track.info?.title,
                userId
            });
        } catch (error) {
            logger.warn('Failed to save track to database history', {
                guildId: this.guildId,
                track: track?.info?.title,
                error: error.message
            });
        }
    }

    /**
     * Get failed tracks from the dead-letter list (EQ-H01)
     * @returns {Array<{track: Object, failedAt: number, reason: string, retries: number}>}
     */
    getFailedTracks() {
        return [...this.failedTracks];
    }

    /**
     * Clear the dead-letter list of failed tracks
     */
    clearFailedTracks() {
        this.failedTracks = [];
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
            failedTracksCount: this.failedTracks.length,
            volume: this.volume,
            loop: this.loop,
            paused: this.paused,
            activeFilters: this.getActiveFilters()
        };
    }
}

export default EnhancedQueue;
