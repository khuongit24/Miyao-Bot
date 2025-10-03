import logger from '../utils/logger.js';
import { EmbedBuilder } from 'discord.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        // Check if bot left voice channel
        if (oldState.member.id === client.user.id && oldState.channelId && !newState.channelId) {
            const queue = client.musicManager.getQueue(oldState.guild.id);
            if (queue) {
                logger.music('Bot disconnected from voice', { guildId: oldState.guild.id });
                client.musicManager.destroyQueue(oldState.guild.id);
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
                    if (members.size === 0 && client.musicManager.config.music.leaveOnEmpty) {
                        const delay = client.musicManager.config.music.leaveOnEmptyDelay || 300000;
                        
                        logger.info(`Voice channel empty, leaving in ${delay / 1000}s`, {
                            guildId: oldState.guild.id
                        });
                        
                        // Set timeout to leave
                        setTimeout(() => {
                            const currentQueue = client.musicManager.getQueue(oldState.guild.id);
                            
                            if (currentQueue && currentQueue.voiceChannelId === oldState.channelId) {
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
                                            { name: '🔄 Quay lại', value: 'Sử dụng `/play` để phát nhạc lại', inline: true }
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
};
