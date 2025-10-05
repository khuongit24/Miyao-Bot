/**
 * @file trending.js
 * @description Show trending music from various regions and genres
 * @version 1.6.0
 */

import { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { NoSearchResultsError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// Cache trending results for 24 hours
const trendingCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export default {
    data: new SlashCommandBuilder()
        .setName('trending')
        .setDescription('Xem nhạc đang thịnh hành')
        .addStringOption(option =>
            option.setName('region')
                .setDescription('Khu vực')
                .setRequired(false)
                .addChoices(
                    { name: 'Toàn cầu', value: 'global' },
                    { name: 'Việt Nam', value: 'vn' },
                    { name: 'Hàn Quốc (K-Pop)', value: 'kr' },
                    { name: 'Nhật Bản (J-Pop)', value: 'jp' },
                    { name: 'Hoa Kỳ', value: 'us' },
                    { name: 'Anh', value: 'uk' }
                )
        )
        .addStringOption(option =>
            option.setName('genre')
                .setDescription('Thể loại')
                .setRequired(false)
                .addChoices(
                    { name: 'Tất cả', value: 'all' },
                    { name: 'Pop', value: 'pop' },
                    { name: 'Rock', value: 'rock' },
                    { name: 'Hip Hop', value: 'hiphop' },
                    { name: 'EDM', value: 'edm' },
                    { name: 'R&B', value: 'rnb' }
                )
        )
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Số lượng bài hát (mặc định: 10)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(15)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const region = interaction.options.getString('region') || 'global';
            const genre = interaction.options.getString('genre') || 'all';
            const count = interaction.options.getInteger('count') || 10;

            const cacheKey = `${region}:${genre}`;
            
            // Check cache
            const cached = trendingCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                logger.debug('Using cached trending data', { cacheKey });
                await sendTrendingResponse(interaction, client, cached.tracks, region, genre, count);
                return;
            }

            // Build search query
            const searchQuery = buildTrendingQuery(region, genre);

            logger.info('Searching for trending music', { region, genre, searchQuery });

            // Search for trending tracks
            const result = await client.musicManager.search(`ytsearch:${searchQuery}`, interaction.user);

            if (!result || !result.tracks || result.tracks.length === 0) {
                throw new NoSearchResultsError(searchQuery);
            }

            // Filter unique tracks
            const uniqueTracks = [];
            const seenTitles = new Set();

            for (const track of result.tracks) {
                const titleKey = track.info.title.toLowerCase();
                if (!seenTitles.has(titleKey)) {
                    uniqueTracks.push(track);
                    seenTitles.add(titleKey);
                }
                
                if (uniqueTracks.length >= 15) break;
            }

            // Cache the results
            trendingCache.set(cacheKey, {
                tracks: uniqueTracks,
                timestamp: Date.now()
            });

            await sendTrendingResponse(interaction, client, uniqueTracks, region, genre, count);

            logger.command('trending', interaction.user.id, interaction.guildId, {
                region,
                genre,
                count: uniqueTracks.length
            });

        } catch (error) {
            logger.error('Trending command error', { error: error.message, stack: error.stack });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Build trending search query based on region and genre
 */
function buildTrendingQuery(region, genre) {
    const year = new Date().getFullYear();
    const queries = [];

    // Region-specific queries
    const regionQueries = {
        'global': `top hits ${year}`,
        'vn': `nhạc việt hay nhất ${year}`,
        'kr': `kpop trending ${year}`,
        'jp': `jpop hits ${year}`,
        'us': `billboard hot 100 ${year}`,
        'uk': `uk top 40 ${year}`
    };

    queries.push(regionQueries[region] || regionQueries['global']);

    // Genre filter
    if (genre !== 'all') {
        queries.push(genre);
    }

    queries.push('official playlist');

    return queries.join(' ');
}

/**
 * Send trending response with dropdown
 */
async function sendTrendingResponse(interaction, client, tracks, region, genre, count) {
    const displayTracks = tracks.slice(0, count);

    // Create dropdown for selection
    const options = displayTracks.map((track, index) => ({
        label: track.info.title.substring(0, 100),
        description: `${track.info.author.substring(0, 50)} • ${formatDuration(track.info.length)}`,
        value: `trending_${index}`,
        emoji: '🔥'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`trending_select_${interaction.user.id}`)
        .setPlaceholder('Chọn bài hát để phát')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Region labels
    const regionLabels = {
        'global': 'Toàn Cầu',
        'vn': 'Việt Nam 🇻🇳',
        'kr': 'Hàn Quốc (K-Pop) 🇰🇷',
        'jp': 'Nhật Bản (J-Pop) 🇯🇵',
        'us': 'Hoa Kỳ 🇺🇸',
        'uk': 'Anh 🇬🇧'
    };

    const genreLabels = {
        'all': 'Tất cả',
        'pop': 'Pop',
        'rock': 'Rock',
        'hiphop': 'Hip Hop',
        'edm': 'EDM',
        'rnb': 'R&B'
    };

    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🔥 Nhạc Đang Thịnh Hành')
        .setDescription(
            `**Khu vực:** ${regionLabels[region]}\n` +
            `**Thể loại:** ${genreLabels[genre]}\n\n` +
            `**Top ${displayTracks.length} bài hát:**\n\n` +
            displayTracks.map((track, i) => 
                `**${i + 1}.** ${track.info.title}\n` +
                `   └ ${track.info.author} • ${formatDuration(track.info.length)}`
            ).join('\n\n')
        )
        .setFooter({ text: 'Chọn bài hát từ menu bên dưới để phát ngay!' })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [row] });

    // Store tracks for selection
    client._trendingCache = client._trendingCache || new Map();
    const cacheKey = `${interaction.user.id}:${interaction.guildId}`;
    client._trendingCache.set(cacheKey, {
        tracks: displayTracks,
        timestamp: Date.now()
    });

    // Cleanup cache after 5 minutes
    setTimeout(() => {
        client._trendingCache.delete(cacheKey);
    }, 5 * 60 * 1000);
}

/**
 * Format duration from milliseconds to MM:SS
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Cleanup old cache entries (run periodically)
 */
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of trendingCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            trendingCache.delete(key);
        }
    }
}, 60 * 60 * 1000); // Run every hour
