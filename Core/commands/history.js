import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Hiển thị lịch sử các bài hát đã phát gần đây'),
    
    async execute(interaction, client) {
        try {
            const queue = client.musicManager.queues.get(interaction.guildId);
            
            if (!queue) {
                return await interaction.reply({
                    content: '❌ Không có lịch sử phát nhạc cho server này!',
                    ephemeral: true
                });
            }
            
            const history = queue.history || [];
            
            if (history.length === 0) {
                return await interaction.reply({
                    content: '📜 Chưa có bài hát nào được phát trong session này!',
                    ephemeral: true
                });
            }
            
            // Show last 10 tracks
            const recentTracks = history.slice(-10).reverse();
            
            let description = recentTracks.map((track, index) => {
                // Defensive programming - check if track.info exists
                if (!track || !track.info) {
                    return `**${index + 1}.** Unknown track`;
                }
                
                const duration = track.info.length && !track.info.isStream ? 
                    `${Math.floor(track.info.length/1000/60)}:${String(Math.floor((track.info.length/1000)%60)).padStart(2, '0')}` : 
                    'Live';
                
                const title = track.info.title || 'Unknown';
                const uri = track.info.uri || '#';
                const requester = track.requester || 'Unknown';
                
                return `**${index + 1}.** [${title}](${uri})\n` +
                       `└ Người yêu cầu: <@${requester}> • Thời lượng: \`${duration}\``;
            }).join('\n\n');
            
            const stats = queue.getStats ? queue.getStats() : null;
            
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('📜 Lịch Sử Phát Nhạc')
                .setDescription(description)
                .setFooter({ text: `${client.config.bot.footer} • Hiển thị ${recentTracks.length} bài gần nhất` })
                .setTimestamp();
            
            if (stats) {
                embed.addFields([{
                    name: '📊 Thống Kê Session',
                    value: `**Tổng số bài đã phát**: ${stats.totalPlayed}\n` +
                           `**Thời gian phát**: ${Math.floor(stats.totalPlaytime / 60000)} phút\n` +
                           `**Số lần skip**: ${stats.skips}`,
                    inline: false
                }]);
            }
            
            await interaction.reply({
                embeds: [embed]
            });
            
            logger.command('history', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('History command error', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị lịch sử!',
                ephemeral: true
            });
        }
    }
};
