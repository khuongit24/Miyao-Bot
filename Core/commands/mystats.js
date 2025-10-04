/**
 * MyStats Command
 * Display personal listening statistics
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import History from '../database/models/History.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { formatDuration } from '../utils/helpers.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mystats')
        .setDescription('Xem thống kê nghe nhạc cá nhân'),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // Get user stats from database
            const stats = History.getUserStats(userId, guildId);

            if (!stats || stats.totalPlays === 0) {
                const embed = new EmbedBuilder()
                    .setColor(client.config.bot.color)
                    .setTitle('📊 Thống Kê Của Bạn')
                    .setDescription('Bạn chưa nghe nhạc nào qua bot!\n\nSử dụng `/play` để bắt đầu nghe nhạc.')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Format stats
            const totalHours = Math.floor(stats.totalListeningTime / 3600000);
            const totalMinutes = Math.floor((stats.totalListeningTime % 3600000) / 60000);

            let description = '**Tổng quan hoạt động của bạn**\n\n';
            
            description += `**📈 Tổng số bài hát:** ${stats.totalPlays.toLocaleString()}\n`;
            description += `**⏱️ Thời gian nghe:** ${totalHours}h ${totalMinutes}m\n`;
            description += `**🎵 Lần đầu nghe:** ${new Date(stats.firstPlayedAt).toLocaleDateString('vi-VN')}\n`;
            description += `**🕐 Lần cuối nghe:** ${new Date(stats.lastPlayedAt).toLocaleDateString('vi-VN')}\n\n`;

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setAuthor({
                    name: `${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTitle('📊 Thống Kê Cá Nhân')
                .setDescription(description);

            // Get top tracks
            const topTracks = History.getTopTracks(userId, guildId, 5);
            if (topTracks && topTracks.length > 0) {
                const topTracksText = topTracks.map((track, index) => {
                    const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
                    const title = track.track_name.length > 40 
                        ? track.track_name.substring(0, 37) + '...' 
                        : track.track_name;
                    return `${emoji} **${title}**\n   └ ${track.play_count} lần nghe`;
                }).join('\n');

                embed.addFields([{
                    name: '🎵 Top 5 Bài Hát',
                    value: topTracksText,
                    inline: false
                }]);
            }

            // Get listening patterns
            const hourlyStats = History.getListeningPatterns(userId, guildId);
            if (hourlyStats && hourlyStats.length > 0) {
                // Find peak hour
                const peakHour = hourlyStats.reduce((max, current) => 
                    current.play_count > max.play_count ? current : max
                );
                
                const timeRanges = {
                    'Sáng sớm (0-6h)': [0, 1, 2, 3, 4, 5],
                    'Buổi sáng (6-12h)': [6, 7, 8, 9, 10, 11],
                    'Buổi chiều (12-18h)': [12, 13, 14, 15, 16, 17],
                    'Buổi tối (18-24h)': [18, 19, 20, 21, 22, 23]
                };

                // Calculate plays by time range
                const rangeStats = Object.entries(timeRanges).map(([name, hours]) => {
                    const count = hourlyStats
                        .filter(h => hours.includes(h.hour_of_day))
                        .reduce((sum, h) => sum + h.play_count, 0);
                    return { name, count };
                });

                const maxRange = rangeStats.reduce((max, current) =>
                    current.count > max.count ? current : max
                );

                let patternText = `**⏰ Giờ nghe nhiều nhất:** ${peakHour.hour_of_day}h (${peakHour.play_count} bài)\n`;
                patternText += `**🌟 Thời gian yêu thích:** ${maxRange.name}`;

                embed.addFields([{
                    name: '📈 Thói Quen Nghe Nhạc',
                    value: patternText,
                    inline: false
                }]);
            }

            embed.setFooter({ text: `${client.config.bot.footer} | Cập nhật realtime` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            logger.command('mystats', interaction.user.id, interaction.guildId);

        } catch (error) {
            logger.error('MyStats command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
