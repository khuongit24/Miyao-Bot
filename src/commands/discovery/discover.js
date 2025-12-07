/**
 * @file discover.js
 * @description Discover new music based on server's listening history and trends
 * @version 2.0.0 - Enhanced with RecommendationEngine for personalized discovery
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
import logger from '../../utils/logger.js';
import History from '../../database/models/History.js';
import { formatDuration } from '../../utils/helpers.js';
import { getRecommendationEngine } from '../../music/RecommendationEngine.js';

// Genre-specific search queries - more specific and music-focused
const GENRE_QUERIES = {
    pop: ['top pop songs 2024 official mv', 'best pop music 2024', 'pop hits official music video'],
    rock: ['rock songs official 2024', 'best rock music', 'rock anthems official'],
    'hip hop': ['hip hop official music video 2024', 'best rap songs official', 'hip hop hits 2024'],
    edm: ['edm songs official 2024', 'electronic dance music official', 'edm hits official mv'],
    classical: ['classical music famous', 'classical masterpieces', 'best classical pieces'],
    jazz: ['jazz music classic', 'smooth jazz songs', 'jazz standards'],
    country: ['country songs official 2024', 'best country music', 'country hits official'],
    'r&b': ['r&b songs official 2024', 'best r&b music', 'r&b soul official mv'],
    kpop: ['kpop official mv 2024', 'best kpop songs official', 'kpop new release official'],
    anime: ['anime opening official', 'best anime songs', 'anime ost official'],
    vpop: ['nhạc việt official mv 2024', 'vpop hay nhất official', 'nhạc trẻ official mv'],
    lofi: ['lofi hip hop chill', 'lofi beats relaxing', 'lofi music study']
};

// Mood-specific search queries - more targeted
const MOOD_QUERIES = {
    'energetic upbeat': ['upbeat songs official', 'energetic music 2024', 'feel good music official'],
    'chill relaxing': ['chill songs 2024', 'relaxing music acoustic', 'calm music official'],
    'happy cheerful': ['happy songs official 2024', 'cheerful music', 'feel good hits'],
    'sad emotional': ['sad songs official', 'emotional ballads', 'heartbreak songs official'],
    'focus study': ['study music instrumental', 'focus music concentration', 'instrumental study'],
    'workout gym motivation': ['workout music 2024', 'gym motivation songs', 'workout playlist hits'],
    'late night vibes': ['late night music chill', 'night vibes songs', 'midnight music relaxing']
};

// Minimum and maximum duration for quality filtering
const MIN_DURATION = 90000; // 1.5 minutes
const MAX_DURATION = 10 * 60 * 1000; // 10 minutes

// Patterns to skip (shorts, compilations, non-music content)
const SKIP_PATTERNS = [
    /#shorts?/i,
    /\bshorts?\b/i,
    /compilation/i,
    /mix\s*20\d{2}/i,
    /\d+\s*hour/i,
    /playlist/i,
    /best\s*of\s*20\d{2}/i,
    /top\s*\d+/i,
    /reaction/i,
    /behind\s*the\s*scenes/i,
    /interview/i,
    /making\s*of/i,
    /tutorial/i,
    /cover\s*by/i,
    /karaoke/i,
    /instrumental\s*version/i,
    /slowed\s*\+?\s*reverb/i,
    /sped\s*up/i,
    /8d\s*audio/i
];

export default {
    data: new SlashCommandBuilder()
        .setName('discover')
        .setDescription('Khám phá nhạc mới dựa trên lịch sử nghe của server')
        .addStringOption(option =>
            option
                .setName('genre')
                .setDescription('Thể loại nhạc')
                .setRequired(false)
                .addChoices(
                    { name: '🎵 Pop', value: 'pop' },
                    { name: '🎸 Rock', value: 'rock' },
                    { name: '🎤 Hip Hop', value: 'hip hop' },
                    { name: '🎧 EDM', value: 'edm' },
                    { name: '🎻 Classical', value: 'classical' },
                    { name: '🎷 Jazz', value: 'jazz' },
                    { name: '🤠 Country', value: 'country' },
                    { name: '💜 R&B', value: 'r&b' },
                    { name: '🇰🇷 K-Pop', value: 'kpop' },
                    { name: '🇯🇵 Anime/J-Pop', value: 'anime' },
                    { name: '🇻🇳 V-Pop', value: 'vpop' },
                    { name: '🎹 Lo-Fi', value: 'lofi' }
                )
        )
        .addStringOption(option =>
            option
                .setName('mood')
                .setDescription('Tâm trạng')
                .setRequired(false)
                .addChoices(
                    { name: '⚡ Sôi động (Energetic)', value: 'energetic upbeat' },
                    { name: '😌 Thư giãn (Chill)', value: 'chill relaxing' },
                    { name: '😊 Vui vẻ (Happy)', value: 'happy cheerful' },
                    { name: '💔 Buồn (Sad)', value: 'sad emotional' },
                    { name: '🎯 Tập trung (Focus)', value: 'focus study' },
                    { name: '💪 Workout', value: 'workout gym motivation' },
                    { name: '🌙 Đêm khuya (Late night)', value: 'late night vibes' }
                )
        )
        .addStringOption(option =>
            option
                .setName('source')
                .setDescription('Nguồn gợi ý')
                .setRequired(false)
                .addChoices(
                    { name: '📊 Từ lịch sử server', value: 'server' },
                    { name: '🌍 Trending toàn cầu', value: 'global' },
                    { name: '🎲 Ngẫu nhiên', value: 'random' }
                )
        )
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('Số lượng gợi ý (mặc định: 5)')
                .setRequired(false)
                .setMinValue(3)
                .setMaxValue(10)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const genre = interaction.options.getString('genre');
            const mood = interaction.options.getString('mood');
            const source = interaction.options.getString('source') || 'server';
            const count = interaction.options.getInteger('count') || 5;

            let searchQueries = [];
            let recommendationSource = '';
            let recommendations = [];

            // Strategy 1: Use server history to find top artists (only for 'server' source)
            if (source === 'server') {
                const serverTopTracks = History.getMostPlayed(interaction.guildId, 30, 'month');

                if (serverTopTracks && serverTopTracks.length > 0) {
                    // Extract unique artists from server history, cleaning names
                    const artistCounts = {};
                    serverTopTracks.forEach(track => {
                        if (track.track_author && track.track_author !== 'Unknown') {
                            // Clean artist name
                            const cleanArtist = track.track_author
                                .replace(/\s*-\s*Topic$/i, '')
                                .replace(/VEVO$/i, '')
                                .replace(/\s*(Official|Channel|Music)$/gi, '')
                                .trim();

                            if (cleanArtist.length > 1) {
                                artistCounts[cleanArtist] = (artistCounts[cleanArtist] || 0) + track.play_count;
                            }
                        }
                    });

                    const topArtists = Object.entries(artistCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([artist]) => artist);

                    if (topArtists.length > 0) {
                        // Search for each top artist's other songs with specific queries
                        for (const artist of topArtists.slice(0, 3)) {
                            searchQueries.push(`${artist} official music video`);
                            searchQueries.push(`${artist} best songs official`);
                            searchQueries.push(`${artist} new songs 2024`);
                        }
                        recommendationSource = `🎯 Dựa trên: ${topArtists.slice(0, 2).join(', ')}`;
                    }
                }
            }

            // Strategy 2: Apply genre filter with better queries
            if (genre && GENRE_QUERIES[genre]) {
                const genreQueries = GENRE_QUERIES[genre];
                searchQueries.push(...genreQueries);
                recommendationSource = recommendationSource || `🎵 Thể loại: ${genre}`;
            }

            // Strategy 3: Apply mood filter
            if (mood && MOOD_QUERIES[mood]) {
                const moodQueries = MOOD_QUERIES[mood];
                searchQueries.push(...moodQueries);
                if (!recommendationSource) {
                    recommendationSource = `🎭 Tâm trạng: ${mood.split(' ')[0]}`;
                }
            }

            // Strategy 4: Fallback to global trending with specific queries
            if (searchQueries.length === 0 || source === 'global') {
                const year = new Date().getFullYear();
                searchQueries = [
                    `top songs ${year} official music video`,
                    `best music ${year} official`,
                    `trending songs ${year} official mv`,
                    `popular music ${year} official`,
                    `viral songs ${year} official`
                ];
                recommendationSource = '🌟 Nhạc đang hot';
            }

            // For random source, shuffle the queries
            if (source === 'random') {
                searchQueries = searchQueries.sort(() => Math.random() - 0.5);
                recommendationSource = '🎲 Gợi ý ngẫu nhiên';
            }

            // Search using multiple queries and collect unique tracks with quality filtering
            const seenTitles = new Set();
            const seenAuthors = new Map(); // Track count per author for diversity

            // Get tracks from server history to exclude (to discover NEW music)
            const recentHistory = History.getGuildHistory(interaction.guildId, 100);
            const historyUrls = new Set(recentHistory.map(h => h.track_url));
            const historyTitles = new Set(
                recentHistory.map(h => h.track_title?.toLowerCase().substring(0, 25)).filter(Boolean)
            );

            for (const query of searchQueries.slice(0, 6)) {
                if (recommendations.length >= count * 2) break;

                try {
                    const result = await client.musicManager.search(`ytsearch:${query}`, interaction.user);

                    if (result?.tracks?.length > 0) {
                        for (const track of result.tracks) {
                            if (recommendations.length >= count * 2) break;

                            // Skip if no track info
                            if (!track.info) continue;

                            // Skip streams
                            if (track.info.isStream) continue;

                            // Filter by duration
                            const duration = track.info.length || 0;
                            if (duration < MIN_DURATION || duration > MAX_DURATION) continue;

                            // Skip unwanted patterns
                            const title = track.info.title || '';
                            if (SKIP_PATTERNS.some(pattern => pattern.test(title))) continue;

                            // Skip if already in recent history (by URL or similar title)
                            if (historyUrls.has(track.info.uri)) continue;
                            const titleKey = title.toLowerCase().substring(0, 25);
                            if (historyTitles.has(titleKey)) continue;

                            // Avoid duplicates by title
                            const fullTitleKey = title.toLowerCase().substring(0, 35);
                            if (seenTitles.has(fullTitleKey)) continue;

                            // Artist diversity: max 2 tracks per artist
                            const author = track.info.author || 'Unknown';
                            const authorKey = author.toLowerCase();
                            const authorCount = seenAuthors.get(authorKey) || 0;
                            if (authorCount >= 2) continue;

                            // Add track
                            seenTitles.add(fullTitleKey);
                            seenAuthors.set(authorKey, authorCount + 1);
                            recommendations.push(track);
                        }
                    }
                } catch (err) {
                    logger.warn('Search failed for discover query', { query, error: err.message });
                }
            }

            // Take requested count (don't shuffle to preserve relevance order)
            // Only shuffle if specifically in random mode
            if (source === 'random') {
                recommendations = recommendations.sort(() => Math.random() - 0.5);
            }

            // Use RecommendationEngine for personalization and scoring
            const recEngine = getRecommendationEngine();
            const userProfile = recEngine.getUserProfile(interaction.user.id, interaction.guildId);
            const guildProfile = recEngine.getGuildGenreProfile(interaction.guildId);

            // Add scoring metadata to tracks
            const enhancedRecommendations = recommendations.map(track => ({
                ...track,
                detectedGenre: recEngine.detectGenre(track.info.title, track.info.author),
                detectedMood: recEngine.detectMood(track.info.title)
            }));

            // Score based on user and guild preferences
            const scoredRecommendations = recEngine.scoreAndRank(enhancedRecommendations, {
                userProfile,
                guildProfile
            });

            // Apply diversity
            const diversifiedRecommendations = recEngine.applyDiversity(scoredRecommendations, {
                maxPerArtist: 2,
                serendipity: source === 'random' ? 0.2 : 0.1
            });

            // Take final count
            recommendations = diversifiedRecommendations.slice(0, count);

            if (recommendations.length === 0) {
                throw new NoSearchResultsError('gợi ý nhạc');
            }

            // Create dropdown for selection
            const options = recommendations.map((track, index) => ({
                label: track.info.title.substring(0, 100),
                description: `${track.info.author.substring(0, 50)} • ${formatDuration(track.info.length)}`,
                value: `discover_${index}`,
                emoji: ['🎵', '🎶', '🎧', '🎤', '🎹', '🎸', '🎷', '🎺', '🎻', '🥁'][index] || '🎵'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`discover_select_${interaction.user.id}`)
                .setPlaceholder('🎵 Chọn bài hát để phát')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // Add action buttons
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`discover_play_all_${interaction.user.id}`)
                    .setLabel('▶️ Phát tất cả')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`discover_shuffle_all_${interaction.user.id}`)
                    .setLabel('🔀 Phát ngẫu nhiên')
                    .setStyle(ButtonStyle.Primary)
            );

            // Build description with personalization context
            let description = '';
            if (recommendationSource) description += `${recommendationSource}\n`;
            if (genre) description += `**Thể loại:** ${genre}\n`;
            if (mood) description += `**Tâm trạng:** ${mood.split(' ')[0]}\n`;

            // Add user context if available
            if (userProfile && !userProfile.isNewUser && userProfile.topGenres.length > 0) {
                description += `**Sở thích của bạn:** ${userProfile.topGenres.slice(0, 2).join(', ')}\n`;
            }
            description += '\n';

            description += recommendations
                .map((track, i) => {
                    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i] || `${i + 1}.`;
                    const genreTag = track.detectedGenre ? ` 🎵 ${track.detectedGenre}` : '';
                    const serendipityMark = track.isSerendipity ? ' ✨' : '';
                    return `${emoji} **${track.info.title}**${serendipityMark}\n└ 🎤 ${track.info.author} • ⏱️ ${formatDuration(track.info.length)}${genreTag}`;
                })
                .join('\n\n');

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🔍 Khám Phá Nhạc Mới')
                .setDescription(description)
                .setFooter({
                    text:
                        '💡 Chọn từ menu hoặc nhấn nút để phát!' +
                        (userProfile?.isNewUser ? '\n🌱 Nghe thêm để nhận gợi ý cá nhân hóa!' : '')
                })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: [row, buttonRow]
            });

            // Store tracks for selection
            const cacheKey = `${interaction.user.id}:${interaction.guildId}`;
            if (client.cacheManager) {
                client.cacheManager.set('discovery', cacheKey, {
                    tracks: recommendations,
                    timestamp: Date.now()
                });
            } else {
                client._discoveryCache = client._discoveryCache || new Map();
                client._discoveryCache.set(cacheKey, {
                    tracks: recommendations,
                    timestamp: Date.now()
                });
                setTimeout(() => client._discoveryCache?.delete(cacheKey), 5 * 60 * 1000);
            }

            logger.command('discover', interaction.user.id, interaction.guildId, {
                genre,
                mood,
                source,
                count: recommendations.length
            });
        } catch (error) {
            logger.error('Discover command error', { error: error.message, stack: error.stack });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
