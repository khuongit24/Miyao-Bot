import logger from '../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import GuildSettings from '../database/models/GuildSettings.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        // Check if bot left voice channel
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
                                await client.musicManager.createQueue(
                                    oldState.guild.id,
                                    voiceChannelId,
                                    textChannel
                                );
                                logger.info('24/7 mode: Reconnected successfully', { guildId: oldState.guild.id });
                            }
                        } catch (error) {
                            logger.error('24/7 mode: Failed to reconnect', { guildId: oldState.guild.id, error: error.message });
                        }
                    }, 3000); // Wait 3 seconds before reconnecting
                } else {
                    client.musicManager.destroyQueue(oldState.guild.id);
                }
            }
            return;
        }
        
        // Check if user left voice channel
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
                            
                            logger.info(`Voice channel empty, leaving in ${delay / 1000}s`, {
                                guildId: oldState.guild.id
                            });
                            
                            // Set timeout to leave
                            setTimeout(() => {
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
                                        
                                        // Send notification with embed
                                        const embed = new EmbedBuilder()
                                            .setColor('#FFA500')
                                            .setTitle('👋 Đã rời khỏi voice channel')
                                            .setDescription('Bot đã tự động rời khỏi voice channel vì không còn ai trong kênh.')
                                            .addFields([
                                                { name: '⏱️ Thời gian chờ', value: `${delay / 60000} phút`, inline: true },
                                                { name: '🔄 Quay lại', value: 'Sử dụng `/play` để phát nhạc lại', inline: true },
                                                { name: '🌙 Chế độ 24/7', value: 'Dùng `/settings 247 enabled:true` để bot không rời', inline: false }
                                            ])
                                            .setFooter({ text: client.config?.bot?.footer || 'Miyao Music Bot' })
                                            .setTimestamp();
                                        
                                        currentQueue.textChannel?.send({ embeds: [embed] })
                                            .catch(err => logger.error('Failed to send leave notification', err));
                                        
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
