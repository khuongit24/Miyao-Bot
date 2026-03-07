/**
 * @file ProgressTracker.js
 * @description Manages now-playing progress updates with adaptive frequency
 * Extracted from EnhancedQueue.js for single-responsibility principle.
 * @version 1.9.0
 */

import logger from '../utils/logger.js';
import { TIME } from '../utils/constants.js';
import { createNowPlayingEmbed } from '../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons } from '../UI/components/MusicControls.js';

/**
 * Manages now-playing message progress updates with adaptive frequency
 * Reduces API calls when no user interaction is detected
 */
export class ProgressTracker {
    /**
     * @param {string} guildId - Guild ID for logging context
     */
    constructor(guildId) {
        this.guildId = guildId;

        /** @type {number} Timestamp of last user interaction */
        this.lastUserInteraction = Date.now();
        /** @type {number} Timestamp of last progress update */
        this.lastProgressUpdate = 0;
        /** @type {boolean} Whether updates are in reduced-frequency mode */
        this.progressUpdatePaused = false;
        /** @type {number} Count of updates since tracking started */
        this.updateCount = 0;
        /** @type {NodeJS.Timeout|null} Progress update interval */
        this.updateInterval = null;
        /** @type {boolean} Whether progress updates are actively running */
        this._isRunning = false;
        /** @type {import('discord.js').Message|null} Now playing message */
        this.nowPlayingMessage = null;
    }

    /**
     * Start progress updates with adaptive frequency
     * Updates continue as long as music is playing, with reduced frequency when idle
     *
     * @param {Object} queue - EnhancedQueue instance (provides current, player, paused, manager.config)
     */
    startProgressUpdates(queue) {
        this.stopProgressUpdates();

        // Reset interaction tracking
        this.lastUserInteraction = Date.now();
        this.lastProgressUpdate = 0;
        this.progressUpdatePaused = false;
        this.updateCount = 0;
        this._isRunning = true;

        const scheduleNext = () => {
            if (!this._isRunning) return; // stopped

            // Compute effective interval based on user interaction
            const timeSinceInteraction = Date.now() - this.lastUserInteraction;
            const idleTimeout = TIME.PROGRESS_IDLE_TIMEOUT || 30000;

            let effectiveInterval;
            if (timeSinceInteraction <= idleTimeout) {
                effectiveInterval = Math.max(TIME.PROGRESS_UPDATE_INTERVAL || 3000, 3000);
                if (this.progressUpdatePaused) {
                    this.progressUpdatePaused = false;
                    logger.debug('Progress updates at full frequency (user active)', { guildId: this.guildId });
                }
            } else if (timeSinceInteraction <= idleTimeout * 2) {
                effectiveInterval = 5000;

                if (!this.progressUpdatePaused) {
                    this.progressUpdatePaused = true;
                    logger.debug('Progress updates at reduced frequency (user idle)', { guildId: this.guildId });
                }
            } else {
                effectiveInterval = 10000;
            }

            this.updateInterval = setTimeout(async () => {
                try {
                    if (!this.nowPlayingMessage || !queue.current || !queue.player) {
                        scheduleNext();
                        return;
                    }

                    // When paused, update less frequently (every 10s) just to keep embed alive
                    if (queue.paused) {
                        const timeSinceLastUpdate = Date.now() - this.lastProgressUpdate;
                        if (timeSinceLastUpdate < 10000) {
                            scheduleNext();
                            return;
                        }
                    }

                    await this.updateNowPlaying(queue);
                    this.lastProgressUpdate = Date.now();
                    this.updateCount++;
                } catch (error) {
                    logger.error('Failed to update now playing message', error);
                }
                scheduleNext();
            }, effectiveInterval);
        };

        scheduleNext();
    }

    /**
     * Record user interaction to keep progress updates active
     */
    recordUserInteraction() {
        this.lastUserInteraction = Date.now();

        if (this.progressUpdatePaused) {
            logger.debug('User interaction recorded, updates will resume', { guildId: this.guildId });
        }
    }

    /**
     * Stop progress updates
     */
    stopProgressUpdates() {
        this._isRunning = false;
        if (this.updateInterval) {
            clearTimeout(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Update now playing message with current progress
     * Uses pre-imported modules for better performance
     *
     * @param {Object} queue - EnhancedQueue instance (provides current, player, manager.config)
     */
    async updateNowPlaying(queue) {
        if (!this.nowPlayingMessage || !queue.current || !queue.player) {
            return;
        }

        try {
            // PT-M02: Throttle message.edit() to at most once per 5 seconds
            // PT-L01: This check is redundant when called from scheduleNext() (which already
            // guarantees ≥5s intervals), but serves as defense-in-depth for any direct calls
            // to updateNowPlaying() and for rate-limit backoff (where lastProgressUpdate is
            // pushed forward to enforce a longer cooldown).
            const now = Date.now();
            if (now - this.lastProgressUpdate < 5000) {
                return;
            }

            const currentPosition = queue.player.position || 0;
            const embed = createNowPlayingEmbed(queue.current, queue, queue.manager.config, currentPosition);
            const components = createNowPlayingButtons(queue, false);

            await this.nowPlayingMessage.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            // PT-M01: Handle 429 rate limit errors with backoff
            if (
                error.httpStatus === 429 ||
                error.code === 429 ||
                (error.message && error.message.toLowerCase().includes('rate limit'))
            ) {
                const retryAfter = error.retryAfter || 10;
                logger.warn('Rate limited on now-playing edit, backing off', {
                    guildId: this.guildId,
                    retryAfterSeconds: retryAfter
                });
                // Push lastProgressUpdate forward to enforce backoff
                this.lastProgressUpdate = Date.now() + retryAfter * 1000;
                return;
            } else if (error.code === 10008 || error.code === 50001 || error.code === 10062) {
                // Known recoverable Discord API errors - silently clean up
                this.nowPlayingMessage = null;
                this.stopProgressUpdates();
            } else {
                // BUG-049: Log unknown errors at warn level instead of swallowing at error level
                logger.warn('Failed to update now playing embed', { error: error.message, code: error.code });
            }
        }
    }

    /**
     * Set now playing message and start/stop updates accordingly
     * @param {import('discord.js').Message|null} message - Discord message
     * @param {Object} queue - EnhancedQueue instance
     */
    setNowPlayingMessage(message, queue) {
        this.nowPlayingMessage = message;
        this.recordUserInteraction();
        if (message && queue.current) {
            this.startProgressUpdates(queue);
        } else {
            this.stopProgressUpdates();
        }
    }
}

export default ProgressTracker;
