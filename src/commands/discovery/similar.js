/**
 * @file similar.js
 * @description Find similar tracks using intelligent algorithms based on user listening patterns
 * @version 2.0.0 - Enhanced with RecommendationEngine for smarter recommendations
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
import { ValidationError, NoSearchResultsError, NothingPlayingError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { formatDuration } from '../../utils/helpers.js';
import { getDatabaseManager } from '../../database/DatabaseManager.js';
import { escapeLikePattern } from '../../database/helpers.js';
import { getRecommendationEngine } from '../../music/RecommendationEngine.js';

export default {
    data: new SlashCommandBuilder()
        .setName('similar')
        .setDescription('Tìm nhạc tương tự với bài hát hiện tại hoặc bài hát chỉ định')
        .addStringOption(option =>
            option.setName('query').setDescription('Tên bài hát hoặc URL (để trống = bài đang phát)').setRequired(false)
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

            const query = interaction.options.getString('query');
            const count = interaction.options.getInteger('count') || 5;

            let referenceTrack = null;

            // Get reference track
            if (!query) {
                const queue = client.musicManager.getQueue(interaction.guildId);

                if (!queue || !queue.current) {
                    throw new NothingPlayingError();
                }

                referenceTrack = queue.current;
            } else {
                const result = await client.musicManager.search(query, interaction.user);

                if (!result || !result.tracks || result.tracks.length === 0) {
                    throw new NoSearchResultsError(query);
                }

                referenceTrack = result.tracks[0];
            }

            // Extract reference track info
            const refArtist = referenceTrack.info.author || '';
            const refTitle = referenceTrack.info.title || '';
            const refUrl = referenceTrack.info.uri || '';

            const recommendations = [];
            const seenUrls = new Set([refUrl]);
            const seenTitles = new Set([refTitle.toLowerCase().substring(0, 30)]);
            let recommendationSource = '';

            // Strategy 1: Find tracks from users who also played this track (collaborative filtering)
            const collaborativeResults = await findCollaborativeRecommendations(
                interaction.guildId,
                refUrl,
                refTitle,
                seenUrls,
                seenTitles,
                count * 2
            );

            if (collaborativeResults.length > 0) {
                recommendations.push(...collaborativeResults);
                recommendationSource = '🎯 Dựa trên người nghe tương tự';
            }

            // Strategy 2: Find other popular tracks from same artist
            if (recommendations.length < count) {
                const artistResults = await findArtistTracks(
                    client,
                    refArtist,
                    seenUrls,
                    seenTitles,
                    count - recommendations.length,
                    interaction.user
                );

                if (artistResults.length > 0) {
                    recommendations.push(...artistResults);
                    if (!recommendationSource) {
                        recommendationSource = `🎤 Các bài khác của ${refArtist}`;
                    }
                }
            }

            // Strategy 3: Find tracks with similar metadata patterns
            if (recommendations.length < count) {
                const metadataResults = await findMetadataSimilar(
                    client,
                    refTitle,
                    refArtist,
                    seenUrls,
                    seenTitles,
                    count - recommendations.length,
                    interaction.user
                );

                if (metadataResults.length > 0) {
                    recommendations.push(...metadataResults);
                    if (!recommendationSource) {
                        recommendationSource = '🔍 Tìm kiếm thông minh';
                    }
                }
            }

            // Strategy 4: Fallback to curated search queries
            if (recommendations.length < count) {
                const curatedResults = await findCuratedSimilar(
                    client,
                    refTitle,
                    refArtist,
                    seenUrls,
                    seenTitles,
                    count - recommendations.length,
                    interaction.user
                );

                if (curatedResults.length > 0) {
                    recommendations.push(...curatedResults);
                    if (!recommendationSource) {
                        recommendationSource = '🌟 Gợi ý theo phong cách';
                    }
                }
            }

            if (recommendations.length === 0) {
                throw new ValidationError(
                    `Không tìm thấy bài hát tương tự cho:\n**${refTitle}**\n\n` +
                        '💡 Thử nghe thêm một vài bài trên server để hệ thống học được sở thích của bạn!',
                    'similar'
                );
            }

            // Use RecommendationEngine for scoring and diversity
            const recEngine = getRecommendationEngine();

            if (!recEngine) {
                logger.warn('RecommendationEngine not available for /similar command');
                return sendBasicSimilarResponse(
                    interaction,
                    client,
                    referenceTrack,
                    recommendations.slice(0, count),
                    recommendationSource
                );
            }

            // Get user profile for personalization
            const userProfile = recEngine.getUserProfile(interaction.user.id, interaction.guildId);
            const guildProfile = recEngine.getGuildGenreProfile(interaction.guildId);

            // Score and rank recommendations
            const scoredRecommendations = recEngine.scoreAndRank(recommendations, {
                referenceTrack,
                userProfile,
                guildProfile
            });

            // Apply diversity (max 2 tracks per artist, add some serendipity)
            const diversifiedRecommendations = recEngine.applyDiversity(scoredRecommendations, {
                maxPerArtist: 2,
                serendipity: 0.1 // 10% chance for unexpected picks
            });

            // Limit to requested count
            const finalRecommendations = diversifiedRecommendations.slice(0, count);

            // Create response
            await sendSimilarResponse(interaction, client, referenceTrack, finalRecommendations, recommendationSource, {
                userProfile,
                guildProfile
            });

            logger.command('similar', interaction.user.id, interaction.guildId, {
                referenceTrack: refTitle,
                count: finalRecommendations.length,
                source: recommendationSource,
                topScore: finalRecommendations[0]?.score || 0,
                userIsNew: userProfile.isNewUser
            });
        } catch (error) {
            logger.error('Similar command error', { error: error.message, stack: error.stack });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Find recommendations based on collaborative filtering
 * "Users who listened to X also listened to Y"
 */
async function findCollaborativeRecommendations(guildId, trackUrl, trackTitle, seenUrls, seenTitles, limit) {
    try {
        const db = getDatabaseManager();

        // Find users who played this track (or similar title)
        const usersWhoPlayedThis = db.query(
            `SELECT DISTINCT user_id FROM history
             WHERE guild_id = ?
             AND (track_url = ? OR track_title LIKE ? ESCAPE '\\')
             AND played_at > datetime('now', '-30 days')
             LIMIT 50`,
            [guildId, trackUrl, `%${escapeLikePattern(trackTitle.substring(0, 20))}%`]
        );

        if (usersWhoPlayedThis.length === 0) {
            return [];
        }

        const userIds = usersWhoPlayedThis.map(u => u.user_id);
        const placeholders = userIds.map(() => '?').join(',');

        // Find other tracks these users played, ranked by popularity
        const similarTracks = db.query(
            `SELECT track_title, track_author, track_url, track_duration,
                    COUNT(DISTINCT user_id) as listener_overlap,
                    COUNT(*) as play_count
             FROM history
             WHERE guild_id = ?
             AND user_id IN (${placeholders})
             AND track_url != ?
             AND played_at > datetime('now', '-30 days')
             GROUP BY track_url
             HAVING listener_overlap >= 1
             ORDER BY listener_overlap DESC, play_count DESC
             LIMIT ?`,
            [guildId, ...userIds, trackUrl, limit * 2]
        );

        const results = [];
        for (const track of similarTracks) {
            if (seenUrls.has(track.track_url)) continue;

            const titleKey = track.track_title.toLowerCase().substring(0, 30);
            if (seenTitles.has(titleKey)) continue;

            seenUrls.add(track.track_url);
            seenTitles.add(titleKey);

            results.push({
                info: {
                    title: track.track_title,
                    author: track.track_author,
                    uri: track.track_url,
                    length: track.track_duration || 0
                },
                source: 'collaborative',
                score: track.listener_overlap * 10 + track.play_count
            });

            if (results.length >= limit) break;
        }

        return results;
    } catch (error) {
        logger.warn('Collaborative filtering failed', { error: error.message });
        return [];
    }
}

/**
 * Find other tracks from the same artist
 */
async function findArtistTracks(client, artist, seenUrls, seenTitles, limit, requester) {
    if (!artist || artist === 'Unknown') return [];

    try {
        // Clean artist name
        const cleanArtist = artist
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .replace(/\s*(Official|Channel|Music)$/gi, '')
            .trim();

        const searchQueries = [`${cleanArtist} popular songs`, `${cleanArtist} best hits`, `${cleanArtist} top tracks`];

        const results = [];

        for (const query of searchQueries) {
            if (results.length >= limit) break;

            try {
                const searchResult = await client.musicManager.search(`ytsearch:${query}`, requester);

                if (searchResult?.tracks?.length > 0) {
                    for (const track of searchResult.tracks) {
                        if (seenUrls.has(track.info.uri)) continue;

                        const titleKey = track.info.title.toLowerCase().substring(0, 30);
                        if (seenTitles.has(titleKey)) continue;

                        // Verify it's from same/similar artist
                        const trackArtist = track.info.author?.toLowerCase() || '';
                        if (!trackArtist.includes(cleanArtist.toLowerCase().split(' ')[0])) continue;

                        seenUrls.add(track.info.uri);
                        seenTitles.add(titleKey);

                        results.push({
                            ...track,
                            source: 'artist'
                        });

                        if (results.length >= limit) break;
                    }
                }
            } catch (err) {
                logger.debug('Artist search failed', { query, error: err.message });
            }
        }

        return results;
    } catch (error) {
        logger.warn('Artist tracks search failed', { error: error.message });
        return [];
    }
}

/**
 * Find tracks with similar metadata patterns
 */
async function findMetadataSimilar(client, title, artist, seenUrls, seenTitles, limit, requester) {
    try {
        // Extract key words from title (excluding common words)
        const stopWords = new Set([
            'official',
            'video',
            'audio',
            'lyrics',
            'mv',
            'hd',
            '4k',
            'ft',
            'feat',
            'the',
            'a',
            'an',
            'and',
            'or',
            'but',
            'in',
            'on',
            'at',
            'to',
            'for',
            'of',
            'with',
            'by',
            'is',
            'it',
            'this',
            'that',
            'từ',
            'và',
            'của'
        ]);

        const keywords = title
            .toLowerCase()
            .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word))
            .slice(0, 3);

        if (keywords.length === 0) return [];

        // Build smart search queries
        const queries = [];

        // If title contains genre hints, use them
        const genreHints = detectGenreFromTitle(title);
        if (genreHints) {
            queries.push(`${genreHints} music ${new Date().getFullYear()}`);
        }

        // Use keywords + artist first name
        const artistFirstName = artist.split(' ')[0]?.replace(/[^\w]/g, '');
        if (artistFirstName && artistFirstName.length > 2) {
            queries.push(`${keywords.join(' ')} ${artistFirstName} type beat`);
            queries.push(`songs like ${artistFirstName}`);
        }

        queries.push(`${keywords.slice(0, 2).join(' ')} music`);

        const results = [];

        for (const query of queries) {
            if (results.length >= limit) break;

            try {
                const searchResult = await client.musicManager.search(`ytsearch:${query}`, requester);

                if (searchResult?.tracks?.length > 0) {
                    for (const track of searchResult.tracks) {
                        if (seenUrls.has(track.info.uri)) continue;

                        const titleKey = track.info.title.toLowerCase().substring(0, 30);
                        if (seenTitles.has(titleKey)) continue;

                        // Skip very short tracks (likely ads/intros)
                        if (track.info.length < 60000) continue;

                        seenUrls.add(track.info.uri);
                        seenTitles.add(titleKey);

                        results.push({
                            ...track,
                            source: 'metadata'
                        });

                        if (results.length >= limit) break;
                    }
                }
            } catch (err) {
                logger.debug('Metadata search failed', { query, error: err.message });
            }
        }

        return results;
    } catch (error) {
        logger.warn('Metadata similar search failed', { error: error.message });
        return [];
    }
}

/**
 * Detect genre hints from track title
 */
function detectGenreFromTitle(title) {
    const titleLower = title.toLowerCase();

    const genrePatterns = {
        'k-pop kpop korean': ['kpop', 'k-pop', 'korean', 'bts', 'blackpink', 'twice', 'exo', 'nct', '아이돌'],
        'v-pop vpop vietnamese': ['vpop', 'v-pop', 'việt', 'vietnamese', 'nhạc việt'],
        'hip hop rap': ['rap', 'hip hop', 'hiphop', 'trap', 'drill'],
        'edm electronic dance': ['edm', 'electronic', 'house', 'techno', 'dubstep', 'bass'],
        'ballad slow romantic': ['ballad', 'slow', 'romantic', 'love song', 'tình yêu'],
        'rock alternative': ['rock', 'metal', 'punk', 'alternative', 'indie rock'],
        'r&b soul': ['r&b', 'rnb', 'soul', 'neo soul'],
        'lofi chill': ['lofi', 'lo-fi', 'chill', 'relaxing', 'study'],
        'anime japanese': ['anime', 'japanese', 'jpop', 'j-pop', 'アニメ'],
        'acoustic guitar': ['acoustic', 'guitar', 'unplugged']
    };

    for (const [genres, patterns] of Object.entries(genrePatterns)) {
        if (patterns.some(p => titleLower.includes(p))) {
            return genres.split(' ')[0]; // Return first genre keyword
        }
    }

    return null;
}

/**
 * Fallback: Find similar using curated search queries
 */
async function findCuratedSimilar(client, title, artist, seenUrls, seenTitles, limit, requester) {
    try {
        const year = new Date().getFullYear();
        const queries = [
            `${artist} similar artists music`,
            `songs like ${title.split(' ').slice(0, 3).join(' ')}`,
            `best ${detectGenreFromTitle(title) || 'music'} songs ${year}`,
            `trending music ${year}`
        ];

        const results = [];

        for (const query of queries) {
            if (results.length >= limit) break;

            try {
                const searchResult = await client.musicManager.search(`ytsearch:${query}`, requester);

                if (searchResult?.tracks?.length > 0) {
                    for (const track of searchResult.tracks.slice(0, 5)) {
                        if (seenUrls.has(track.info.uri)) continue;

                        const titleKey = track.info.title.toLowerCase().substring(0, 30);
                        if (seenTitles.has(titleKey)) continue;

                        if (track.info.length < 60000) continue;

                        seenUrls.add(track.info.uri);
                        seenTitles.add(titleKey);

                        results.push({
                            ...track,
                            source: 'curated'
                        });

                        if (results.length >= limit) break;
                    }
                }
            } catch (err) {
                logger.debug('Curated search failed', { query, error: err.message });
            }
        }

        return results;
    } catch (error) {
        logger.warn('Curated similar search failed', { error: error.message });
        return [];
    }
}

/**
 * Send similar tracks response with interactive components
 * @param {Object} interaction - Discord interaction
 * @param {Object} client - Discord client
 * @param {Object} referenceTrack - Reference track
 * @param {Array} recommendations - Recommended tracks
 * @param {string} source - Recommendation source description
 * @param {Object} profiles - User and guild profiles for context
 */
async function sendSimilarResponse(interaction, client, referenceTrack, recommendations, source, profiles = {}) {
    const { userProfile } = profiles;
    const recEngine = getRecommendationEngine();

    if (!recEngine) {
        return sendBasicSimilarResponse(interaction, client, referenceTrack, recommendations, source);
    }

    // Create dropdown
    const options = recommendations.map((track, index) => ({
        label: track.info.title.substring(0, 100),
        description: `${track.info.author?.substring(0, 50) || 'Unknown'} • ${formatDuration(track.info.length || 0)}`,
        value: `similar_${index}`,
        emoji: ['🎵', '🎶', '🎧', '🎤', '🎹', '🎸', '🎷', '🎺', '🎻', '🥁'][index] || '🎵'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`similar_select_${interaction.user.id}`)
        .setPlaceholder('🎵 Chọn bài hát để phát')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`similar_play_all_${interaction.user.id}`)
            .setLabel('▶️ Thêm tất cả vào queue')
            .setStyle(ButtonStyle.Success)
    );

    // Detect genre of reference track for context
    const refGenre = recEngine.detectGenre(referenceTrack.info.title, referenceTrack.info.author);
    const refMood = recEngine.detectMood(referenceTrack.info.title);

    // Build genre/mood info string
    let contextInfo = '';
    if (refGenre) contextInfo += `🎵 ${refGenre.toUpperCase()}`;
    if (refMood) contextInfo += contextInfo ? ` • 🎭 ${refMood}` : `🎭 ${refMood}`;

    // Create embed with enhanced info
    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🔎 Nhạc Tương Tự')
        .setDescription(
            '**🎯 Dựa trên:**\n' +
                `${referenceTrack.info.title}\n` +
                `└ 🎤 ${referenceTrack.info.author}` +
                (contextInfo ? `\n└ ${contextInfo}` : '') +
                `\n\n**${source}:**\n\n` +
                recommendations
                    .map((track, i) => {
                        const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i];
                        const sourceEmoji =
                            track.source === 'collaborative'
                                ? '👥'
                                : track.source === 'artist'
                                  ? '🎤'
                                  : track.source === 'metadata'
                                    ? '🔍'
                                    : '🌟';
                        const serendipityMark = track.isSerendipity ? ' ✨' : '';
                        const scoreInfo = track.score ? ` (${Math.round(track.score)}⭐)` : '';
                        return `${emoji} **${track.info.title}**${serendipityMark}\n└ ${sourceEmoji} ${track.info.author || 'Unknown'} • ⏱️ ${formatDuration(track.info.length || 0)}${scoreInfo}`;
                    })
                    .join('\n\n')
        )
        .setFooter({
            text:
                `${client.config.bot.footer} • 💡 Chọn từ menu để phát ngay!` +
                (userProfile?.isNewUser ? '\n🌱 Nghe thêm để hệ thống học sở thích của bạn!' : '')
        })
        .setTimestamp();

    if (referenceTrack.info.artworkUrl) {
        embed.setThumbnail(referenceTrack.info.artworkUrl);
    }

    await interaction.editReply({ embeds: [embed], components: [row, buttonRow] });

    // Store tracks for selection
    const cacheKey = `${interaction.user.id}:${interaction.guildId}`;
    if (client.cacheManager) {
        client.cacheManager.set('similar', cacheKey, {
            tracks: recommendations,
            timestamp: Date.now()
        });
    } else {
        client._similarCache = client._similarCache || new Map();
        // FIX-PB03: Cap fallback cache size (entries also auto-delete after 5 min via setTimeout)
        if (client._similarCache.size >= 50) {
            const oldestKey = client._similarCache.keys().next().value;
            client._similarCache.delete(oldestKey);
        }
        client._similarCache.set(cacheKey, {
            tracks: recommendations,
            timestamp: Date.now()
        });
        setTimeout(() => client._similarCache?.delete(cacheKey), 5 * 60 * 1000);
    }
}

/**
 * Fallback response when RecommendationEngine is unavailable.
 * Sends recommendations without scoring/diversity enhancements.
 */
async function sendBasicSimilarResponse(interaction, client, referenceTrack, recommendations, source) {
    const options = recommendations.map((track, index) => ({
        label: track.info.title.substring(0, 100),
        description: `${track.info.author?.substring(0, 50) || 'Unknown'} • ${formatDuration(track.info.length || 0)}`,
        value: `similar_${index}`,
        emoji: ['🎵', '🎶', '🎧', '🎤', '🎹', '🎸', '🎷', '🎺', '🎻', '🥁'][index] || '🎵'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`similar_select_${interaction.user.id}`)
        .setPlaceholder('🎵 Chọn bài hát để phát')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`similar_play_all_${interaction.user.id}`)
            .setLabel('▶️ Thêm tất cả vào queue')
            .setStyle(ButtonStyle.Success)
    );

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🎵 Bài Hát Tương Tự')
        .setDescription(
            `**Dựa trên:**\n` +
                `${referenceTrack.info.title}\n` +
                `└ 🎤 ${referenceTrack.info.author}` +
                `\n\n**${source}:**\n\n` +
                recommendations
                    .map((track, i) => {
                        const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i];
                        return `${emoji} **${track.info.title}**\n└ 🎤 ${track.info.author || 'Unknown'} • ⏱️ ${formatDuration(track.info.length || 0)}`;
                    })
                    .join('\n\n')
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    if (referenceTrack.info.artworkUrl) {
        embed.setThumbnail(referenceTrack.info.artworkUrl);
    }

    await interaction.editReply({ embeds: [embed], components: [row, buttonRow] });

    const cacheKey = `${interaction.user.id}:${interaction.guildId}`;
    client._similarCache = client._similarCache || new Map();
    if (client._similarCache.size >= 50) {
        const oldestKey = client._similarCache.keys().next().value;
        client._similarCache.delete(oldestKey);
    }
    client._similarCache.set(cacheKey, { tracks: recommendations, timestamp: Date.now() });
    setTimeout(() => client._similarCache?.delete(cacheKey), 5 * 60 * 1000);
}
