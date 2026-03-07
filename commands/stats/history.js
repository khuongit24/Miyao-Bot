/**
 * History Command
 * Display user's listening history from database with session fallback
 * @version 1.8.4 - Now shows personal history from database
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';
import { formatDuration } from '../../utils/helpers.js';
import History from '../../database/models/History.js';

/** Discord embed field value limit */
const MAX_FIELD_VALUE = 1024;

/** Truncate a string to fit within Discord's embed field value limit */
function truncateFieldValue(value) {
    if (typeof value !== 'string') return 'N/A';
    if (value.length <= MAX_FIELD_VALUE) return value;
    return value.slice(0, MAX_FIELD_VALUE - 4) + '...';
}

export default {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Xem lịch sử nghe nhạc của bạn')
        .addStringOption(option =>
            option
                .setName('view')
                .setDescription('Loại lịch sử muốn xem')
                .setRequired(false)
                .addChoices(
                    { name: '👤 Lịch sử cá nhân (tất cả server)', value: 'personal' },
                    { name: '📋 Session hiện tại', value: 'session' },
                    { name: '🏠 Lịch sử server này', value: 'server' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Số lượng bài hát (mặc định: 10)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(25)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const view = interaction.options.getString('view') || 'personal';
            const limit = interaction.options.getInteger('limit') || 10;

            let embed;
            let components = [];

            switch (view) {
                case 'session':
                    ({ embed, components } = await buildSessionHistory(interaction, client, limit));
                    break;
                case 'server':
                    ({ embed, components } = await buildServerHistory(interaction, client, limit));
                    break;
                case 'personal':
                default:
                    ({ embed, components } = await buildPersonalHistory(interaction, client, limit));
                    break;
            }

            await interaction.editReply({ embeds: [embed], components });

            logger.command('history', interaction.user.id, interaction.guildId, { view, limit });
        } catch (error) {
            logger.error('History command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Build personal history from database (all servers)
 */
async function buildPersonalHistory(interaction, client, limit) {
    const history = History.getUserHistory(interaction.user.id, limit);
    const stats = History.getUserStats(interaction.user.id);
    const topTracks = History.getTopTracks(interaction.user.id, null, 5);

    if (!history || history.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('📜 Lịch Sử Nghe Nhạc Cá Nhân')
            .setDescription('Bạn chưa có lịch sử nghe nhạc nào.\n\n' + '💡 Sử dụng `/play` để bắt đầu nghe nhạc!')
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return { embed, components: [] };
    }

    // Build track list
    const description = history
        .map((entry, index) => {
            const title =
                entry.track_title?.length > 40
                    ? entry.track_title.substring(0, 37) + '...'
                    : entry.track_title || 'Unknown';
            const author = entry.track_author || 'Unknown';
            const duration = entry.track_duration ? formatDuration(entry.track_duration) : '?:??';
            const playedAt = new Date(entry.played_at).toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `**${index + 1}.** ${title}\n└ 🎤 ${author} • ⏱️ ${duration} • 📅 ${playedAt}`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📜 Lịch Sử Nghe Nhạc Cá Nhân')
        .setDescription(description)
        .setFooter({ text: `${client.config.bot.footer} • ${history.length} bài gần nhất` })
        .setTimestamp();

    // Add stats if available
    if (stats) {
        const totalMinutes = Math.floor((stats.totalListeningTime || 0) / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        embed.addFields([
            {
                name: '📊 Thống Kê Tổng Quan',
                value: truncateFieldValue(
                    `🎵 **Tổng đã nghe:** ${stats.totalPlays} bài\n` +
                        `⏱️ **Thời gian:** ${timeStr}\n` +
                        `📅 **Lần đầu:** ${new Date(stats.firstPlayedAt).toLocaleDateString('vi-VN')}`
                ),
                inline: true
            }
        ]);

        // Add top tracks if available
        if (topTracks && topTracks.length > 0) {
            const topList = topTracks
                .slice(0, 3)
                .map((t, i) => {
                    const emoji = ['🥇', '🥈', '🥉'][i];
                    const title =
                        t.track_name?.length > 25 ? t.track_name.substring(0, 22) + '...' : t.track_name || 'Unknown';
                    return `${emoji} ${title} (${t.play_count}x)`;
                })
                .join('\n');

            embed.addFields([
                {
                    name: '🔥 Nghe Nhiều Nhất',
                    value: truncateFieldValue(topList),
                    inline: true
                }
            ]);
        }
    }

    // Create replay buttons if tracks available
    const components = [];
    if (history.length > 0 && history[0].track_url) {
        const options = history.slice(0, 10).map((entry, index) => ({
            label: (entry.track_title || 'Unknown').substring(0, 100),
            description: `${(entry.track_author || 'Unknown').substring(0, 50)} • ${entry.track_duration ? formatDuration(entry.track_duration) : '?:??'}`,
            value: `history_personal_${index}`,
            emoji: '🎵'
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`history_personal_select_${interaction.user.id}`)
            .setPlaceholder('🔄 Chọn bài hát để phát lại')
            .addOptions(options);

        components.push(new ActionRowBuilder().addComponents(selectMenu));

        // Store history for replay
        const cacheKey = `history_personal:${interaction.user.id}`;
        if (client.cacheManager) {
            client.cacheManager.set('history', cacheKey, {
                tracks: history,
                timestamp: Date.now()
            });
        } else {
            client._personalHistoryCache = client._personalHistoryCache || new Map();
            // FIX-PB03: Cap fallback cache size (entries also auto-delete after 5 min via setTimeout)
            if (client._personalHistoryCache.size >= 50) {
                const oldestKey = client._personalHistoryCache.keys().next().value;
                client._personalHistoryCache.delete(oldestKey);
            }
            client._personalHistoryCache.set(cacheKey, {
                tracks: history,
                timestamp: Date.now()
            });
            setTimeout(() => client._personalHistoryCache?.delete(cacheKey), 5 * 60 * 1000);
        }
    }

    return { embed, components };
}

/**
 * Build session history from current queue
 */
async function buildSessionHistory(interaction, client, limit) {
    const queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('📋 Lịch Sử Session')
            .setDescription(
                'Không có session phát nhạc nào đang hoạt động.\n\n' +
                    '💡 Sử dụng `/play` để bắt đầu nghe nhạc!\n' +
                    '💡 Hoặc dùng `/history view:Lịch sử cá nhân` để xem lịch sử đã lưu.'
            )
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return { embed, components: [] };
    }

    const history = queue.history || [];

    if (history.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('📋 Lịch Sử Session')
            .setDescription(
                'Chưa có bài hát nào được phát trong session này.\n\n' + '💡 Sử dụng `/play` để bắt đầu nghe nhạc!'
            )
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return { embed, components: [] };
    }

    // Show last N tracks (most recent first)
    const recentTracks = history.slice(-limit).reverse();

    const description = recentTracks
        .map((track, index) => {
            if (!track?.info) {
                return `**${index + 1}.** ❓ Unknown track`;
            }

            const title = track.info.title || 'Unknown';
            const author = track.info.author || 'Unknown';
            const duration = track.info.length && !track.info.isStream ? formatDuration(track.info.length) : '🔴 Live';
            const requester = track.requester || 'Unknown';

            return `**${index + 1}.** ${title}\n` + `└ 🎤 ${author} • ⏱️ ${duration} • <@${requester}>`;
        })
        .join('\n\n');

    const stats = queue.getStats ? queue.getStats() : null;

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Lịch Sử Session')
        .setDescription(description)
        .setFooter({ text: `${client.config.bot.footer} • ${recentTracks.length}/${history.length} bài gần nhất` })
        .setTimestamp();

    if (stats) {
        const playtimeMinutes = Math.floor(stats.totalPlaytime / 60000);
        const playtimeStr =
            playtimeMinutes >= 60
                ? `${Math.floor(playtimeMinutes / 60)}h ${playtimeMinutes % 60}m`
                : `${playtimeMinutes}m`;

        embed.addFields([
            {
                name: '📊 Thống Kê Session',
                value: truncateFieldValue(
                    `🎵 **Tổng đã phát:** ${stats.totalPlayed}\n` +
                        `⏱️ **Thời gian:** ${playtimeStr}\n` +
                        `⏭️ **Số lần skip:** ${stats.skips}`
                ),
                inline: false
            }
        ]);
    }

    return { embed, components: [] };
}

/**
 * Build server history from database
 */
async function buildServerHistory(interaction, client, limit) {
    const history = History.getGuildHistory(interaction.guildId, limit);
    const serverStats = History.getServerStats(interaction.guildId, 'week');
    const topTracks = History.getMostPlayed(interaction.guildId, 5, 'week');

    if (!history || history.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('🏠 Lịch Sử Server')
            .setDescription(
                'Server này chưa có lịch sử nghe nhạc nào.\n\n' + '💡 Sử dụng `/play` để bắt đầu nghe nhạc!'
            )
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return { embed, components: [] };
    }

    // Build track list
    const description = history
        .map((entry, index) => {
            const title =
                entry.track_title?.length > 40
                    ? entry.track_title.substring(0, 37) + '...'
                    : entry.track_title || 'Unknown';
            const author = entry.track_author || 'Unknown';
            const duration = entry.track_duration ? formatDuration(entry.track_duration) : '?:??';
            const playedAt = new Date(entry.played_at).toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `**${index + 1}.** ${title}\n└ 🎤 ${author} • ⏱️ ${duration} • 📅 ${playedAt}`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🏠 Lịch Sử Server')
        .setDescription(description)
        .setFooter({ text: `${client.config.bot.footer} • ${history.length} bài gần nhất` })
        .setTimestamp();

    // Add server stats
    if (serverStats) {
        const totalMinutes = Math.floor((serverStats.totalDuration || 0) / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        embed.addFields([
            {
                name: '📊 Thống Kê Tuần Này',
                value: truncateFieldValue(
                    `🎵 **Tổng đã phát:** ${serverStats.totalPlays} bài\n` +
                        `👥 **Thành viên:** ${serverStats.uniqueUsers} người\n` +
                        `⏱️ **Thời gian:** ${timeStr}`
                ),
                inline: true
            }
        ]);
    }

    // Add top tracks this week
    if (topTracks && topTracks.length > 0) {
        const topList = topTracks
            .slice(0, 3)
            .map((t, i) => {
                const emoji = ['🥇', '🥈', '🥉'][i];
                const title =
                    t.track_title?.length > 25 ? t.track_title.substring(0, 22) + '...' : t.track_title || 'Unknown';
                return `${emoji} ${title} (${t.play_count}x)`;
            })
            .join('\n');

        embed.addFields([
            {
                name: '🔥 Hot Tuần Này',
                value: truncateFieldValue(topList),
                inline: true
            }
        ]);
    }

    return { embed, components: [] };
}
