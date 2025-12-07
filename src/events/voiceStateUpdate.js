import logger from '../utils/logger.js';
import GuildSettings from '../database/models/GuildSettings.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        // Check if bot left voice channel (kicked, disconnected, or moved)
        if (oldState.member.id === client.user.id && oldState.channelId && !newState.channelId) {
            const queue = client.musicManager.getQueue(oldState.guild.id);
            if (queue) {
                logger.music('Bot disconnected from voice', { guildId: oldState.guild.id });

                // Check if 24/7 mode is enabled - try to reconnect
                const guildSettings = GuildSettings.get(oldState.guild.id);
                if (guildSettings.twentyFourSeven) {
                    logger.info('24/7 mode enabled, attempting to reconnect...', { guildId: oldState.guild.id });

                    // Store the voice channel ID before destroying
                    const voiceChannelId = queue.voiceChannelId;
                    const textChannel = queue.textChannel;

                    // Delay reconnection to avoid rapid reconnect loops
                    setTimeout(async () => {
                        try {
                            const voiceChannel = oldState.guild.channels.cache.get(voiceChannelId);
                            if (voiceChannel) {
                                // Create a new queue and connect
                                await client.musicManager.createQueue(oldState.guild.id, voiceChannelId, textChannel);
                                logger.info('24/7 mode: Reconnected successfully', { guildId: oldState.guild.id });
                            }
                        } catch (error) {
                            logger.error('24/7 mode: Failed to reconnect', {
                                guildId: oldState.guild.id,
                                error: error.message
                            });
                        }
                    }, 3000); // Wait 3 seconds before reconnecting
                } else {
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

                    client.musicManager.destroyQueue(oldState.guild.id);
                }
            }
            return;
        }

        // Check if user left voice channel (leaveOnEmpty logic)
        if (oldState.channelId && !newState.channelId) {
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
                            const delay = client.musicManager.config.music.leaveOnEmptyDelay || 300000;
                            const delayMinutes = Math.round(delay / 60000);

                            // Store references NOW before timeout (they may be gone after delay)
                            const textChannelRef = queue.textChannel;
                            const queueStats = { ...queue.stats };
                            const footerText = client.config?.bot?.footer || 'Miyao Music Bot';

                            logger.info(`Voice channel empty, leaving in ${delayMinutes} min`, {
                                guildId: oldState.guild.id,
                                textChannelId: textChannelRef?.id
                            });

                            // Set timeout to leave
                            setTimeout(async () => {
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
                                            await currentQueue._sendGoodbyeMessage({
                                                textChannel: textChannelRef,
                                                guildId: oldState.guild.id,
                                                reason: 'empty',
                                                delayMinutes: delayMinutes,
                                                tracksPlayed: queueStats.tracksPlayed || 0,
                                                totalDuration: queueStats.totalDuration || 0,
                                                footer: footerText
                                            });
                                        } catch (err) {
                                            logger.warn('Failed to send goodbye on empty', { error: err.message });
                                        }

                                        // Destroy queue after sending message
                                        client.musicManager.destroyQueue(oldState.guild.id);
                                    }
                                }
                            }, delay);
                        }
                    }
                }
            }
        }
    }
};
