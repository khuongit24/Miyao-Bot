/**
 * Server Stats Command
 * Display server-wide listening statistics with enhanced analytics
 * @version 1.8.2 - Enhanced with peak hours, listening time, and charts
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import History from '../../database/models/History.js';
import { EnhancedStatisticsService, TrackStatistics } from '../../database/models/Statistics.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { COLORS } from '../../config/design-system.js';
import logger from '../../utils/logger.js';
import { formatDuration } from '../../utils/helpers.js';

export default {
    data: new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('Xem thống kê nghe nhạc của server')
        .addStringOption(option =>
            option
                .setName('period')
                .setDescription('Khoảng thời gian thống kê')
                .addChoices(
                    { name: 'Hôm nay', value: 'today' },
                    { name: 'Tuần này', value: 'week' },
                    { name: 'Tháng này', value: 'month' },
                    { name: 'Tất cả', value: 'all' }
                )
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('view')
                .setDescription('Loại thống kê muốn xem')
                .addChoices(
                    { name: '📊 Tổng quan', value: 'overview' },
                    { name: '🎵 Top bài hát', value: 'tracks' },
                    { name: '👥 Top người nghe', value: 'listeners' },
                    { name: '⏰ Giờ cao điểm', value: 'hours' },
                    { name: '🎤 Top nghệ sĩ', value: 'artists' }
                )
                .setRequired(false)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const period = interaction.options.getString('period') || 'all';
            const view = interaction.options.getString('view') || 'overview';
            const guildId = interaction.guildId;

            // Period names for display
            const periodNames = {
                today: 'Hôm nay',
                week: 'Tuần này',
                month: 'Tháng này',
                all: 'Tất cả thời gian'
            };

            // Get server statistics based on view type
            switch (view) {
                case 'tracks':
                    await showTopTracks(interaction, client, guildId, period, periodNames[period]);
                    break;
                case 'listeners':
                    await showTopListeners(interaction, client, guildId, period, periodNames[period]);
                    break;
                case 'hours':
                    await showPeakHours(interaction, client, guildId, period, periodNames[period]);
                    break;
                case 'artists':
                    await showTopArtists(interaction, client, guildId, period, periodNames[period]);
                    break;
                default:
                    await showOverview(interaction, client, guildId, period, periodNames[period]);
            }

            logger.command('serverstats', interaction.user.id, guildId);
        } catch (error) {
            logger.error('Error in serverstats command', { error });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Show overview statistics
 */
async function showOverview(interaction, client, guildId, period, periodName) {
    const stats = History.getServerStats(guildId, period);

    if (!stats) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('📊 Chưa Có Thống Kê')
            .setDescription('Chưa có ai nghe nhạc trong server này. Hãy bắt đầu phát nhạc!')
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    // Get additional data
    const [mostPlayed, mostActive, peakHours] = await Promise.all([
        History.getMostPlayed(guildId, 5, period),
        History.getMostActiveUsers(guildId, 5, period),
        History.getServerPeakHours(guildId)
    ]);

    // Build embed
    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`📊 Thống Kê ${interaction.guild.name}`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setDescription(`**${periodName}**`)
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    // Overall statistics
    const listeningTime = formatDuration(stats.totalDuration);
    embed.addFields({
        name: '📈 Tổng Quan',
        value: [
            `🎵 **Tổng lượt phát:** ${stats.totalPlays.toLocaleString()}`,
            `👥 **Người dùng hoạt động:** ${stats.uniqueUsers}`,
            `🎼 **Bài hát khác nhau:** ${stats.uniqueTracks}`,
            `⏱️ **Tổng thời gian nghe:** ${listeningTime}`
        ].join('\n'),
        inline: false
    });

    // Most played tracks
    if (mostPlayed && mostPlayed.length > 0) {
        const tracksText = mostPlayed
            .slice(0, 3)
            .map((track, index) => {
                const emoji = ['🥇', '🥈', '🥉'][index];
                const title =
                    track.track_title.length > 30 ? track.track_title.substring(0, 27) + '...' : track.track_title;
                return `${emoji} ${title} (${track.play_count} lần)`;
            })
            .join('\n');

        embed.addFields({
            name: '🎵 Top Bài Hát',
            value: tracksText + '\n*Dùng `/serverstats view:tracks` để xem thêm*',
            inline: true
        });
    }

    // Most active users
    if (mostActive && mostActive.length > 0) {
        const usersText = await Promise.all(
            mostActive.slice(0, 3).map(async (user, index) => {
                const emoji = ['🥇', '🥈', '🥉'][index];
                try {
                    const discordUser = await client.users.fetch(user.user_id);
                    return `${emoji} ${discordUser.username} (${user.play_count})`;
                } catch (error) {
                    return `${emoji} User (${user.play_count})`;
                }
            })
        );

        embed.addFields({
            name: '👑 Top Người Nghe',
            value: usersText.join('\n') + '\n*Dùng `/serverstats view:listeners` để xem thêm*',
            inline: true
        });
    }

    // Peak hours
    if (peakHours && peakHours.length > 0) {
        const peakText = peakHours
            .slice(0, 3)
            .map((h, i) => `${['🔥', '📈', '📊'][i]} ${h.hour_of_day}:00 (${h.play_count})`)
            .join('\n');

        embed.addFields({
            name: '⏰ Giờ Cao Điểm',
            value: peakText + '\n*Dùng `/serverstats view:hours` để xem thêm*',
            inline: true
        });
    }

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Show top tracks detailed view
 */
async function showTopTracks(interaction, client, guildId, period, periodName) {
    const tracks = TrackStatistics.getTopTracksByPeriod(guildId, 10, period);

    if (!tracks || tracks.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('🎵 Top Bài Hát')
            .setDescription(`Chưa có dữ liệu cho **${periodName}**`)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`🎵 Top 10 Bài Hát - ${periodName}`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    const tracksList = tracks
        .map((track, index) => {
            const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
            const title =
                track.track_title.length > 35 ? track.track_title.substring(0, 32) + '...' : track.track_title;
            const listeners = track.unique_listeners || 1;
            return `${medal} **${title}**\n   └ ${track.track_author} • ${track.play_count} lần • ${listeners} người nghe`;
        })
        .join('\n\n');

    embed.setDescription(tracksList);

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Show top listeners with listening time
 */
async function showTopListeners(interaction, client, guildId, period, periodName) {
    const listeners = EnhancedStatisticsService.getListeningTimePerUser(guildId, period, 10);

    if (!listeners || listeners.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('👥 Top Người Nghe')
            .setDescription(`Chưa có dữ liệu cho **${periodName}**`)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`👥 Top 10 Người Nghe - ${periodName}`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    const listenersList = await Promise.all(
        listeners.map(async (listener, index) => {
            const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
            const minutes = Math.round(listener.minutes_listened || 0);
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

            try {
                const discordUser = await client.users.fetch(listener.user_id);
                return `${medal} **${discordUser.username}**\n   └ ${listener.tracks_played} bài • ${timeStr} • ${listener.unique_tracks} bài khác nhau`;
            } catch (error) {
                return `${medal} **User**\n   └ ${listener.tracks_played} bài • ${timeStr}`;
            }
        })
    );

    embed.setDescription(listenersList.join('\n\n'));

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Show peak usage hours with chart
 */
async function showPeakHours(interaction, client, guildId, period, periodName) {
    const hourlyData = EnhancedStatisticsService.getPeakUsageHours(guildId, period);

    if (!hourlyData || hourlyData.every(h => h.play_count === 0)) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('⏰ Giờ Cao Điểm')
            .setDescription(`Chưa có dữ liệu cho **${periodName}**`)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }

    const chart = EnhancedStatisticsService.generateActivityChart(hourlyData);
    const totalPlays = hourlyData.reduce((sum, h) => sum + h.play_count, 0);

    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`⏰ Hoạt Động Theo Giờ - ${periodName}`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setDescription(`\`\`\`\n${chart}\n\`\`\``)
        .addFields({
            name: '📊 Tổng kết',
            value: `Tổng lượt phát: **${totalPlays}**\nDữ liệu từ: **${periodName}**`,
            inline: false
        })
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Show top artists breakdown
 */
async function showTopArtists(interaction, client, guildId, period, periodName) {
    const artists = EnhancedStatisticsService.getArtistBreakdown(guildId, period, 10);

    if (!artists || artists.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('🎤 Top Nghệ Sĩ')
            .setDescription(`Chưa có dữ liệu cho **${periodName}**`)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`🎤 Top 10 Nghệ Sĩ - ${periodName}`)
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    const artistsList = artists
        .map((artist, index) => {
            const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
            const name = artist.artist.length > 30 ? artist.artist.substring(0, 27) + '...' : artist.artist;
            return `${medal} **${name}**\n   └ ${artist.play_count} lần • ${artist.unique_tracks} bài • ${artist.listeners} người nghe`;
        })
        .join('\n\n');

    embed.setDescription(artistsList);

    await interaction.editReply({ embeds: [embed] });
}
