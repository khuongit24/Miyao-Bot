/**
 * @file trending.js
 * @description Show trending music from server history or curated playlists
 * @version 1.8.4 - Improved regional trending with better search queries
 */

import {
    SlashCommandBuilder,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { NoSearchResultsError } from '../../utils/errors.js';
import { COLORS } from '../../config/design-system.js';
import logger from '../../utils/logger.js';
import History from '../../database/models/History.js';
import { formatDuration } from '../../utils/helpers.js';
import { TRENDING, DISCOVERY } from '../../utils/constants.js';

// Better curated search queries for different regions - more specific and music-focused
function getCuratedQueries(year) {
    return {
        global: [
            `top hits ${year} official music video`,
            `billboard hot 100 songs ${year}`,
            `most popular songs ${year}`,
            `viral songs ${year}`,
            `trending music ${year} playlist`
        ],
        vn: [
            `nhạc việt hot nhất ${year}`,
            `top vpop ${year} official mv`,
            `bảng xếp hạng nhạc việt ${year}`,
            `nhạc trẻ hay nhất ${year}`,
            `ca khúc hot tiktok việt nam ${year}`
        ],
        kr: [
            `kpop hot ${year} official mv`,
            `melon chart top songs ${year}`,
            `best kpop songs ${year}`,
            `trending kpop ${year}`,
            `kpop new release ${year}`
        ],
        jp: [
            `jpop ${year} official music video`,
            `japanese music trending ${year}`,
            `oricon chart ${year}`,
            `anime songs ${year}`,
            `best jpop ${year}`
        ],
        us: [
            `billboard hot 100 ${year}`,
            `top 40 usa ${year} official`,
            `american pop songs ${year}`,
            `us music charts ${year}`,
            `trending songs america ${year}`
        ],
        uk: [
            `uk official charts ${year}`,
            `uk top 40 ${year}`,
            `british music hits ${year}`,
            `trending uk songs ${year}`,
            `best uk songs ${year}`
        ]
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('trending')
        .setDescription('Xem nhạc đang hot trong server hoặc theo khu vực')
        .addStringOption(option =>
            option
                .setName('source')
                .setDescription('Nguồn trending')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 Hot trong server này', value: 'server' },
                    { name: '🌍 Toàn cầu', value: 'global' },
                    { name: '🇻🇳 Việt Nam', value: 'vn' },
                    { name: '🇰🇷 Hàn Quốc (K-Pop)', value: 'kr' },
                    { name: '🇯🇵 Nhật Bản (J-Pop)', value: 'jp' },
                    { name: '🇺🇸 Hoa Kỳ', value: 'us' },
                    { name: '🇬🇧 Anh', value: 'uk' }
                )
        )
        .addStringOption(option =>
            option
                .setName('period')
                .setDescription('Khoảng thời gian (cho server)')
                .setRequired(false)
                .addChoices(
                    { name: '📅 Hôm nay', value: 'day' },
                    { name: '📆 Tuần này', value: 'week' },
                    { name: '🗓️ Tháng này', value: 'month' },
                    { name: '📊 Tất cả', value: 'all' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('Số lượng (mặc định: 10)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(15)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const source = interaction.options.getString('source') || 'server';
            const period = interaction.options.getString('period') || 'week';
            const count = interaction.options.getInteger('count') || 10;

            let tracks = [];
            let title = '';
            let subtitle = '';

            if (source === 'server') {
                // Use server's actual listening history
                const result = await getServerTrending(interaction, client, period, count);
                tracks = result.tracks;
                title = '🔥 Hot Trong Server';
                subtitle = result.subtitle;
            } else {
                // Fetch from curated queries for regions
                const result = await getRegionalTrending(interaction, client, source, count);
                tracks = result.tracks;
                title = '🔥 Nhạc Đang Hot';
                subtitle = result.subtitle;
            }

            if (tracks.length === 0) {
                if (source === 'server') {
                    const embed = new EmbedBuilder()
                        .setColor(client.config.bot.color)
                        .setTitle('🔥 Trending')
                        .setDescription(
                            'Server chưa có đủ dữ liệu nghe nhạc để hiển thị trending.\n\n' +
                                '💡 Hãy thử:\n' +
                                '• `/trending source:Toàn cầu` - Xem trending toàn cầu\n' +
                                '• `/discover` - Khám phá nhạc mới\n' +
                                '• `/play` - Bắt đầu nghe nhạc!'
                        )
                        .setFooter({ text: client.config.bot.footer })
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }
                throw new NoSearchResultsError('trending music');
            }

            await sendTrendingResponse(interaction, client, tracks, title, subtitle, source);

            logger.command('trending', interaction.user.id, interaction.guildId, {
                source,
                period,
                count: tracks.length
            });
        } catch (error) {
            logger.error('Trending command error', { error: error.message, stack: error.stack });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Get trending tracks from server's listening history
 */
async function getServerTrending(interaction, client, period, count) {
    const mostPlayed = History.getMostPlayed(interaction.guildId, count * TRENDING.SERVER_FETCH_MULTIPLIER, period);

    if (!mostPlayed || mostPlayed.length === 0) {
        return { tracks: [], subtitle: '' };
    }

    // PERF-02: Build lightweight tracks directly from DB metadata (no N+1 Lavalink searches here).
    // Full resolution is deferred until user actually selects/plays a track.
    const tracks = [];
    const seenTitles = new Set();

    for (const entry of mostPlayed) {
        if (tracks.length >= count) break;
        if (!entry.track_url) continue;

        const titleKey = entry.track_title.toLowerCase().substring(0, 30);
        if (seenTitles.has(titleKey)) continue;

        const track = {
            encoded: null,
            _requiresResolve: true,
            _playCount: entry.play_count,
            info: {
                title: entry.track_title || 'Unknown',
                author: entry.track_author || 'Unknown',
                uri: entry.track_url,
                length: entry.track_duration || null,
                isStream: false
            }
        };

        tracks.push(track);
        seenTitles.add(titleKey);
    }

    const periodLabels = {
        day: 'hôm nay',
        week: 'tuần này',
        month: 'tháng này',
        all: 'mọi lúc'
    };

    return {
        tracks,
        subtitle: `📊 Được nghe nhiều nhất ${periodLabels[period]} trong server`
    };
}

/**
 * Get trending tracks from regional curated queries
 * Filters out shorts, very short videos, and non-music content
 */
async function getRegionalTrending(interaction, client, region, count) {
    const CURATED_QUERIES = getCuratedQueries(new Date().getFullYear());
    const queries = CURATED_QUERIES[region] || CURATED_QUERIES['global'];
    const tracks = [];
    const seenTitles = new Set();

    // Minimum duration: 1 minute (60000ms) to filter out shorts
    const MIN_DURATION = TRENDING.MIN_TRACK_DURATION_MS;
    // Maximum duration: 15 minutes to avoid long mixes
    const MAX_DURATION = TRENDING.MAX_TRACK_DURATION_MS;

    // Skip patterns imported from shared constants
    const skipPatterns = DISCOVERY.SKIP_PATTERNS;

    // Try each query until we have enough tracks
    for (const query of queries) {
        if (tracks.length >= count) break;

        try {
            // Search for more results to have better filtering
            const result = await client.musicManager.search(`ytsearch:${query}`, interaction.user);

            if (result?.tracks?.length > 0) {
                for (const track of result.tracks) {
                    if (tracks.length >= count) break;

                    // Skip if no track info
                    if (!track.info) continue;

                    // Skip streams
                    if (track.info.isStream) continue;

                    // Filter by duration
                    const duration = track.info.length || 0;
                    if (duration < MIN_DURATION || duration > MAX_DURATION) continue;

                    // Skip patterns
                    const title = track.info.title || '';
                    if (skipPatterns.some(pattern => pattern.test(title))) continue;

                    // Check for duplicates
                    const titleKey = title.toLowerCase().substring(0, 30);
                    if (seenTitles.has(titleKey)) continue;

                    // Limit tracks per artist to 2 for diversity
                    const author = track.info.author || 'Unknown';
                    const authorKey = author.toLowerCase();
                    const authorCount = [...tracks].filter(
                        t => (t.info.author || '').toLowerCase() === authorKey
                    ).length;
                    if (authorCount >= TRENDING.MAX_TRACKS_PER_ARTIST) continue;

                    seenTitles.add(titleKey);
                    tracks.push(track);
                }
            }
        } catch (err) {
            logger.warn('Failed to fetch trending for query', { query, error: err.message });
        }
    }

    const regionLabels = {
        global: '🌍 Toàn Cầu',
        vn: '🇻🇳 Việt Nam',
        kr: '🇰🇷 Hàn Quốc',
        jp: '🇯🇵 Nhật Bản',
        us: '🇺🇸 Hoa Kỳ',
        uk: '🇬🇧 Anh'
    };

    return {
        tracks,
        subtitle: `📍 Khu vực: ${regionLabels[region] || regionLabels['global']}`
    };
}

/**
 * Send trending response with interactive components
 */
async function sendTrendingResponse(interaction, client, tracks, title, subtitle, _source) {
    const displayTracks = tracks.slice(0, Math.min(tracks.length, TRENDING.MAX_DISPLAY_TRACKS));

    // Create dropdown
    const options = displayTracks.map((track, index) => ({
        label: track.info.title.substring(0, 100),
        description: `${track.info.author.substring(0, 50)}${track.info.length ? ` • ${formatDuration(track.info.length)}` : ''}`,
        value: `trending_${index}`,
        emoji: '🔥'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`trending_select_${interaction.user.id}`)
        .setPlaceholder('🔥 Chọn bài hát để phát')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`trending_play_all_${interaction.user.id}`)
            .setLabel('▶️ Phát tất cả')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`trending_shuffle_${interaction.user.id}`)
            .setLabel('🔀 Phát ngẫu nhiên')
            .setStyle(ButtonStyle.Primary)
    );

    // Build description
    let description = subtitle ? `${subtitle}\n\n` : '';

    description += displayTracks
        .map((track, i) => {
            const rank = i + 1;
            const emoji = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `**#${rank}**`;
            const playCount = track._playCount ? ` • 🎧 ${track._playCount}x` : '';
            return `${emoji} **${track.info.title}**\n└ 🎤 ${track.info.author}${track.info.length ? ` • ⏱️ ${formatDuration(track.info.length)}` : ''}${playCount}`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: `💡 Chọn từ menu hoặc nhấn nút để phát! • ${displayTracks.length} bài hát` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [row, buttonRow] });

    // Store for selection
    const userCacheKey = `${interaction.user.id}:${interaction.guildId}`;
    if (client.cacheManager) {
        client.cacheManager.set('trending', userCacheKey, {
            tracks: displayTracks,
            timestamp: Date.now()
        });
    } else {
        client._trendingCache = client._trendingCache || new Map();
        // FIX-PB03: Cap fallback cache size (entries also auto-delete after 5 min via setTimeout)
        if (client._trendingCache.size >= TRENDING.FALLBACK_CACHE_MAX_SIZE) {
            const oldestKey = client._trendingCache.keys().next().value;
            client._trendingCache.delete(oldestKey);
        }
        client._trendingCache.set(userCacheKey, {
            tracks: displayTracks,
            timestamp: Date.now()
        });
        setTimeout(() => client._trendingCache?.delete(userCacheKey), TRENDING.FALLBACK_CACHE_TTL_MS);
    }
}
