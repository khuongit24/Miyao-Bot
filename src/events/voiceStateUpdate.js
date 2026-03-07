import logger from '../utils/logger.js';
import GuildSettings from '../database/models/GuildSettings.js';
import { VOICE_STATE } from '../utils/constants.js';

// Store leave timers per guild to prevent stacking
const leaveTimers = new Map();
// Store 24/7 reconnection timers per guild to prevent stacking
const reconnectTimers = new Map();
const reconnectAttempts = new Map();

/**
 * Clear any pending leave timer for a guild
 * @param {string} guildId
 */
function clearLeaveTimer(guildId) {
    const existing = leaveTimers.get(guildId);
    if (existing) {
        clearTimeout(existing);
        leaveTimers.delete(guildId);
        logger.debug('Cleared pending leave timer', { guildId });
    }
}

/**
 * Clear all pending leave and reconnect timers across all guilds.
 * Useful during graceful shutdown to prevent leaked timers.
 */
export function clearAllVoiceTimers() {
    for (const [guildId, timer] of leaveTimers) {
        clearTimeout(timer);
        logger.debug('clearAllVoiceTimers: cleared leave timer', { guildId });
    }
    leaveTimers.clear();

    for (const [guildId, timer] of reconnectTimers) {
        clearTimeout(timer);
        logger.debug('clearAllVoiceTimers: cleared reconnect timer', { guildId });
    }
    reconnectTimers.clear();

    logger.debug('All voice timers cleared');
}

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        try {
            // Guard against null members (can happen with uncached partials)
            if (!oldState.member || !newState.member) {
                logger.debug('voiceStateUpdate: member is null, skipping', {
                    guildId: oldState.guild?.id || newState.guild?.id,
                    hasOldMember: !!oldState.member,
                    hasNewMember: !!newState.member
                });
                return;
            }

            // Check if bot left voice channel (kicked, disconnected, or moved)
            if (oldState.member.id === client.user.id && oldState.channelId && !newState.channelId) {
                const queue = client.musicManager.getQueue(oldState.guild.id);
                if (queue) {
                    // If queue is in the middle of connect() retries, don't destroy it.
                    // When joinVoiceChannel() fails, Shoukaku disconnects from Discord,
                    // which fires this handler. Destroying the queue here would break
                    // the retry loop.
                    if (queue._isConnecting) {
                        logger.debug('Bot disconnected during connect() retry, skipping queue cleanup', {
                            guildId: oldState.guild.id
                        });
                        return;
                    }

                    logger.music('Bot disconnected from voice', { guildId: oldState.guild.id });

                    // Check if 24/7 mode is enabled - try to reconnect
                    const guildSettings = GuildSettings.get(oldState.guild.id);
                    if (guildSettings.twentyFourSeven) {
                        logger.info('24/7 mode enabled, attempting to reconnect...', { guildId: oldState.guild.id });

                        // Store the voice channel ID before destroying
                        const voiceChannelId = queue.voiceChannelId;
                        const textChannel = queue.textChannel;

                        // Clear any existing reconnection timer to prevent stacking
                        const existingReconnect = reconnectTimers.get(oldState.guild.id);
                        if (existingReconnect) {
                            clearTimeout(existingReconnect);
                            reconnectTimers.delete(oldState.guild.id);
                            logger.debug('Cleared existing 24/7 reconnect timer', { guildId: oldState.guild.id });
                        }

                        // Track reconnect attempts per guild with max retry limit
                        const MAX_RECONNECT_ATTEMPTS = 5;
                        const guildId = oldState.guild.id;
                        const attempts = (reconnectAttempts.get(guildId) || 0) + 1;

                        if (attempts > MAX_RECONNECT_ATTEMPTS) {
                            logger.error('24/7 mode: Max reconnect attempts exceeded, giving up', {
                                guildId,
                                attempts: MAX_RECONNECT_ATTEMPTS
                            });
                            reconnectAttempts.delete(guildId);
                        } else {
                            reconnectAttempts.set(guildId, attempts);
                            const backoffDelay = Math.min(1000 * Math.pow(2, attempts - 1), 30000);

                            const reconnectTimer = setTimeout(async () => {
                                reconnectTimers.delete(guildId);
                                try {
                                    const voiceChannel = oldState.guild.channels.cache.get(voiceChannelId);
                                    if (voiceChannel) {
                                        await client.musicManager.createQueue(guildId, voiceChannelId, textChannel);
                                        logger.info('24/7 mode: Reconnected successfully', {
                                            guildId,
                                            attempt: attempts
                                        });
                                        reconnectAttempts.delete(guildId);
                                    }
                                } catch (error) {
                                    logger.error('24/7 mode: Failed to reconnect', {
                                        guildId,
                                        attempt: attempts,
                                        error: error.message
                                    });
                                }
                            }, backoffDelay);
                            reconnectTimers.set(guildId, reconnectTimer);
                        }
                    } else {
                        // Only send goodbye if NOT leaving gracefully (scheduleLeave already sent goodbye)
                        if (!queue._isLeavingGracefully) {
                            // Send goodbye message before destroying (bot was kicked/disconnected)
                            try {
                                await queue._sendGoodbyeMessage({
                                    textChannel: queue.textChannel,
                                    guildId: oldState.guild.id,
                                    reason: 'disconnect',
                                    delayMinutes: 0,
                                    tracksPlayed: queue.stats?.tracksPlayed || 0,
                                    totalDuration: queue.stats?.totalDuration || 0,
                                    footer: client.config?.bot?.footer || 'Miyao Music Bot'
                                });
                            } catch (err) {
                                logger.debug('Could not send goodbye on disconnect', { error: err.message });
                            }
                        } else {
                            logger.debug('Skipping goodbye in voiceStateUpdate - already sent by scheduleLeave', {
                                guildId: oldState.guild.id
                            });
                        }

                        await client.musicManager.destroyQueue(oldState.guild.id);
                    }
                }
                return;
            }

            // BUG-E24: Check if bot was moved between voice channels
            if (
                oldState.member.id === client.user.id &&
                oldState.channelId &&
                newState.channelId &&
                oldState.channelId !== newState.channelId
            ) {
                const queue = client.musicManager.getQueue(oldState.guild.id);
                if (queue) {
                    logger.music('Bot moved between voice channels', {
                        guildId: oldState.guild.id,
                        from: oldState.channelId,
                        to: newState.channelId
                    });
                    queue.voiceChannelId = newState.channelId;
                    clearLeaveTimer(oldState.guild.id);
                }
                return;
            }

            // Check if user joined/moved to bot's voice channel → cancel pending leave timer
            if (newState.channelId && !newState.member.user.bot) {
                const queue = client.musicManager.getQueue(newState.guild.id);
                if (queue && queue.voiceChannelId === newState.channelId) {
                    clearLeaveTimer(newState.guild.id);
                }
            }

            // Check if user left voice channel (leaveOnEmpty logic)
            if (oldState.channelId && (!newState.channelId || newState.channelId !== oldState.channelId)) {
                const queue = client.musicManager.getQueue(oldState.guild.id);

                if (queue && queue.voiceChannelId === oldState.channelId) {
                    const channel = oldState.guild.channels.cache.get(oldState.channelId);

                    if (channel) {
                        // Count non-bot members
                        const members = channel.members.filter(m => !m.user.bot);

                        // If no members left and bot is alone
                        if (members.size === 0) {
                            // Check if 24/7 mode is enabled
                            const guildSettings = GuildSettings.get(oldState.guild.id);

                            if (guildSettings.twentyFourSeven) {
                                // 24/7 mode is enabled - don't leave
                                logger.info('Voice channel empty but 24/7 mode is enabled, staying', {
                                    guildId: oldState.guild.id
                                });
                                return;
                            }

                            // Check config for leave on empty
                            if (client.musicManager.config.music.leaveOnEmpty) {
                                const delay =
                                    client.musicManager.config.music.leaveOnEmptyDelay ||
                                    VOICE_STATE.DEFAULT_LEAVE_EMPTY_DELAY_MS;
                                const delayMinutes = Math.round(delay / 60000);

                                // Store references NOW before timeout (they may be gone after delay)
                                const textChannelRef = queue.textChannel;
                                const queueStats = { ...queue.stats };
                                const footerText = client.config?.bot?.footer || 'Miyao Music Bot';

                                logger.info(`Voice channel empty, leaving in ${delayMinutes} min`, {
                                    guildId: oldState.guild.id,
                                    textChannelId: textChannelRef?.id
                                });

                                // Clear any existing leave timer before setting a new one
                                clearLeaveTimer(oldState.guild.id);

                                // Set timeout to leave and store reference
                                const timer = setTimeout(async () => {
                                    leaveTimers.delete(oldState.guild.id);
                                    const currentQueue = client.musicManager.getQueue(oldState.guild.id);

                                    if (currentQueue && currentQueue.voiceChannelId === oldState.channelId) {
                                        // Re-check 24/7 mode (might have been enabled during the delay)
                                        const currentSettings = GuildSettings.get(oldState.guild.id);
                                        if (currentSettings.twentyFourSeven) {
                                            logger.info('24/7 mode was enabled during delay, staying', {
                                                guildId: oldState.guild.id
                                            });
                                            return;
                                        }

                                        const currentChannel = oldState.guild.channels.cache.get(oldState.channelId);
                                        const currentMembers = currentChannel?.members.filter(m => !m.user.bot);

                                        // Double check if still alone
                                        if (!currentMembers || currentMembers.size === 0) {
                                            logger.info('Leaving empty voice channel', {
                                                guildId: oldState.guild.id
                                            });

                                            // Send goodbye message using queue's method
                                            try {
                                                // BUG-E11: Use fresh queue data instead of stale captured refs
                                                const freshTextChannel = currentQueue.textChannel || textChannelRef;
                                                const freshStats = currentQueue.stats || queueStats;
                                                await currentQueue._sendGoodbyeMessage({
                                                    textChannel: freshTextChannel,
                                                    guildId: oldState.guild.id,
                                                    reason: 'empty',
                                                    delayMinutes: delayMinutes,
                                                    tracksPlayed: freshStats.tracksPlayed || 0,
                                                    totalDuration: freshStats.totalDuration || 0,
                                                    footer: footerText
                                                });
                                            } catch (err) {
                                                logger.warn('Failed to send goodbye on empty', { error: err.message });
                                            }

                                            // Destroy queue after sending message
                                            await client.musicManager.destroyQueue(oldState.guild.id);
                                        }
                                    }
                                }, delay);
                                leaveTimers.set(oldState.guild.id, timer);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('voiceStateUpdate: unhandled error', {
                guildId: oldState.guild?.id || newState.guild?.id,
                error: error.message,
                stack: error.stack
            });
        }
    }
};
