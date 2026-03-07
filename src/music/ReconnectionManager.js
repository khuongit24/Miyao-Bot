/**
 * @file ReconnectionManager.js
 * @description Manages voice channel reconnection with exponential backoff
 * Extracted from EnhancedQueue.js for single-responsibility principle.
 * @version 1.9.0
 */

import logger from '../utils/logger.js';
import { RECONNECTION } from '../utils/constants.js';
import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../config/design-system.js';

/**
 * Manages reconnection logic with exponential backoff for voice channel failures
 */
export class ReconnectionManager {
    /**
     * @param {string} guildId - Guild ID for logging context
     * @param {Object} [options] - Configuration options
     * @param {number} [options.maxRetries] - Maximum reconnection attempts (overrides constants default)
     */
    constructor(guildId, options = {}) {
        this.guildId = guildId;

        // BUG-053: Make max retries configurable via constructor parameter
        this.maxRetries = options.maxRetries || null;

        /** @type {Object} Reconnection state for exponential backoff */
        this.state = {
            attempts: 0,
            lastAttempt: 0,
            isReconnecting: false
        };
    }

    /**
     * Reconnect after node failure with exponential backoff
     * Implements: 1s → 2s → 4s → 8s → 16s → 30s max
     * Max 5 retries before giving up
     *
     * @param {Object} queue - EnhancedQueue instance (provides player, connect, destroy, textChannel)
     * @returns {Promise<void>}
     * @throws {Error} If reconnection fails after all retries
     */
    async reconnect(queue) {
        // Prevent concurrent reconnection attempts
        if (this.state.isReconnecting) {
            logger.warn('Reconnection already in progress, ignoring duplicate request', { guildId: this.guildId });
            return;
        }

        // Configuration from constants (with defaults for backward compatibility)
        const INITIAL_DELAY = RECONNECTION?.INITIAL_DELAY_MS || 1000;
        const MAX_DELAY = RECONNECTION?.MAX_DELAY_MS || 30000;
        const MULTIPLIER = RECONNECTION?.MULTIPLIER || 2;
        // BUG-053: Use instance-level maxRetries if configured, else fall back to constants
        const MAX_RETRIES = this.maxRetries || RECONNECTION?.MAX_RETRIES || 5;
        const JITTER_FACTOR = RECONNECTION?.JITTER_FACTOR || 0.1;

        this.state.isReconnecting = true;

        try {
            const currentTrack = queue.current;
            const currentPosition = queue.player?.position || 0;

            logger.info(`Starting reconnection for guild ${this.guildId}`, {
                currentTrack: currentTrack?.info?.title,
                position: currentPosition,
                previousAttempts: this.state.attempts
            });

            // Notify user about reconnection
            await this._sendNotification(queue.textChannel, 'starting');

            // Always clean up Shoukaku connection state before reconnecting.
            // This is defensive: onClosed may have already cleaned up, but if not
            // (e.g., older code path or race condition), the stale entry in Shoukaku's
            // connections map would cause joinVoiceChannel to throw
            // "This guild already have an existing connection".
            try {
                await queue.manager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (err) {
                logger.debug('leaveVoiceChannel during reconnect (may already be clean)', {
                    guildId: this.guildId,
                    error: err?.message
                });
            }

            // Exponential backoff retry loop
            let attempt = 0;
            let lastError = null;

            while (attempt < MAX_RETRIES) {
                attempt++;
                this.state.attempts++;
                this.state.lastAttempt = Date.now();

                // Calculate backoff delay: 1s, 2s, 4s, 8s, 16s, capped at 30s
                let delay = Math.min(INITIAL_DELAY * Math.pow(MULTIPLIER, attempt - 1), MAX_DELAY);

                // Add jitter to prevent thundering herd
                const jitter = delay * JITTER_FACTOR * Math.random();
                delay = Math.round(delay + jitter);

                logger.info(`Reconnection attempt ${attempt}/${MAX_RETRIES}`, {
                    guildId: this.guildId,
                    delay: delay,
                    totalAttempts: this.state.attempts
                });

                // Wait before attempting
                if (attempt > 1) {
                    await this._sendNotification(queue.textChannel, 'retrying', attempt, MAX_RETRIES, delay);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                try {
                    // Attempt to reconnect
                    await queue.connect();

                    // Reconnection successful!
                    logger.info(`Reconnection successful after ${attempt} attempts`, {
                        guildId: this.guildId,
                        totalAttempts: this.state.attempts
                    });

                    // Resume playback if there was a track playing
                    if (currentTrack) {
                        try {
                            await queue.player.playTrack({ track: { encoded: currentTrack.encoded } });
                        } catch (playError) {
                            logger.error('Failed to resume playback after reconnection', {
                                guildId: this.guildId,
                                error: playError.message
                            });
                            lastError = playError;
                            continue;
                        }

                        // RM-H02: Seek failure handling — retry seek up to 2 times,
                        // then fallback to playing from the start instead of
                        // triggering a full reconnection loop.
                        if (currentPosition > 0) {
                            let seekSuccess = false;
                            const MAX_SEEK_RETRIES = 2;
                            for (let seekAttempt = 1; seekAttempt <= MAX_SEEK_RETRIES; seekAttempt++) {
                                try {
                                    await queue.player.seekTo(currentPosition);
                                    seekSuccess = true;
                                    break;
                                } catch (seekError) {
                                    logger.warn(`Seek attempt ${seekAttempt}/${MAX_SEEK_RETRIES} failed`, {
                                        guildId: this.guildId,
                                        position: currentPosition,
                                        error: seekError.message
                                    });
                                }
                            }
                            if (!seekSuccess) {
                                logger.warn('All seek attempts failed, continuing playback from start', {
                                    guildId: this.guildId,
                                    intendedPosition: currentPosition
                                });
                            }
                        }

                        // BUG-H14: Reset attempts only after playback resume actually succeeds.
                        this.state.attempts = 0;

                        await this._sendNotification(queue.textChannel, 'success', attempt);

                        logger.info(`Playback resumed at position ${currentPosition}ms`, {
                            guildId: this.guildId,
                            track: currentTrack.info?.title
                        });
                    } else {
                        // No active track to resume; reconnection considered complete.
                        this.state.attempts = 0;
                    }

                    return; // Success
                } catch (error) {
                    lastError = error;
                    logger.warn(`Reconnection attempt ${attempt} failed`, {
                        guildId: this.guildId,
                        error: error.message
                    });

                    if (queue.manager.nodeMonitor) {
                        // BUG-016: Pass actual node name instead of literal 'reconnect'
                        const nodeName =
                            queue.player?.node?.name || [...queue.manager.shoukaku.nodes.keys()][0] || 'unknown';
                        queue.manager.nodeMonitor.recordFailure(nodeName, error.message);
                    }
                }
            }

            // All retries exhausted
            logger.error(`Reconnection failed after ${MAX_RETRIES} attempts`, {
                guildId: this.guildId,
                lastError: lastError?.message,
                totalAttempts: this.state.attempts
            });

            await this._sendNotification(queue.textChannel, 'failed', MAX_RETRIES, MAX_RETRIES);

            await queue.destroy();
            throw new Error(`Reconnection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
        } finally {
            this.state.isReconnecting = false;
        }
    }

    /**
     * Send reconnection status notification to text channel
     * @param {TextChannel|null} textChannel - Discord text channel
     * @param {'starting'|'retrying'|'success'|'failed'} status - Reconnection status
     * @param {number} [attempt=0] - Current attempt number
     * @param {number} [maxAttempts=0] - Maximum attempts
     * @param {number} [delay=0] - Delay before next attempt in ms
     * @private
     */
    async _sendNotification(textChannel, status, attempt = 0, maxAttempts = 0, delay = 0) {
        if (!textChannel) return;

        try {
            let embed;

            switch (status) {
                case 'starting':
                    embed = new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setTitle('🔄 Đang kết nối lại...')
                        .setDescription('Phát hiện lỗi kết nối. Đang cố gắng kết nối lại với server nhạc...')
                        .setTimestamp();
                    break;

                case 'retrying':
                    embed = new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setTitle('🔄 Đang thử lại...')
                        .setDescription(
                            `Lần thử ${attempt}/${maxAttempts}\n` +
                                `⏳ Đợi ${Math.round(delay / 1000)} giây trước khi thử lại...`
                        )
                        .setTimestamp();
                    break;

                case 'success':
                    embed = new EmbedBuilder()
                        .setColor(COLORS.SUCCESS)
                        .setTitle('✅ Đã kết nối lại!')
                        .setDescription(`Kết nối thành công sau ${attempt} lần thử.\n` + 'Đang tiếp tục phát nhạc...')
                        .setTimestamp();
                    break;

                case 'failed':
                    embed = new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle('❌ Không thể kết nối lại')
                        .setDescription(
                            `Đã thử ${maxAttempts} lần nhưng không thành công.\n` +
                                'Vui lòng thử lại sau hoặc dùng lệnh /play để bắt đầu lại.'
                        )
                        .setTimestamp();
                    break;
            }

            if (embed) {
                await textChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            logger.debug('Could not send reconnection notification', {
                guildId: this.guildId,
                status,
                error: error.message
            });
        }
    }
}

export default ReconnectionManager;
