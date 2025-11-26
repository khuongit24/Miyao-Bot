/**
 * @file discover.js
 * @description Discover new music based on user's history and preferences
 * @version 1.8.0 - Updated to use CacheManager
 */

import { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { NoSearchResultsError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import History from '../../database/models/History.js';
import { formatDuration } from '../../utils/helpers.js';

export default {
    data: new SlashCommandBuilder()
        .setName('discover')
        .setDescription('Khám phá nhạc mới dựa trên lịch sử nghe của bạn')
        .addStringOption(option =>
            option.setName('genre')
                .setDescription('Thể loại nhạc')
                .setRequired(false)
                .addChoices(
                    { name: 'Pop', value: 'pop' },
                    { name: 'Rock', value: 'rock' },
                    { name: 'Hip Hop', value: 'hip hop' },
                    { name: 'EDM', value: 'edm' },
                    { name: 'Classical', value: 'classical' },
                    { name: 'Jazz', value: 'jazz' },
                    { name: 'Country', value: 'country' },
                    { name: 'R&B', value: 'r&b' },
                    { name: 'K-Pop', value: 'kpop' },
                    { name: 'Anime', value: 'anime' }
                )
        )
        .addStringOption(option =>
            option.setName('mood')
                .setDescription('Tâm trạng')
                .setRequired(false)
                .addChoices(
                    { name: 'Energetic / Sôi động', value: 'energetic' },
                    { name: 'Calm / Thư giãn', value: 'calm' },
                    { name: 'Happy / Vui vẻ', value: 'happy' },
                    { name: 'Sad / Buồn', value: 'sad' },
                    { name: 'Focus / Tập trung', value: 'focus' }
                )
        )
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Số lượng bài hát (mặc định: 5)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const genre = interaction.options.getString('genre');
            const mood = interaction.options.getString('mood');
            const count = interaction.options.getInteger('count') || 5;

            // Get user's listening history
            const history = History.getUserHistory(interaction.user.id, 50);

            let searchQuery = '';
            let recommendations = [];

            // Strategy 1: If user has history, find similar tracks
            if (history && history.length > 0) {
                logger.info('Discovering music based on user history', {
                    userId: interaction.user.id,
                    historyCount: history.length,
                    genre,
                    mood
                });

                // Get most played tracks
                const trackCounts = {};
                history.forEach(entry => {
                    const key = `${entry.track_title}||${entry.track_author}`;
                    trackCounts[key] = (trackCounts[key] || 0) + 1;
                });

                const sortedTracks = Object.entries(trackCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);

                // Build search query from favorite tracks
                const favoriteArtists = sortedTracks
                    .map(([key]) => key.split('||')[1])
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .slice(0, 3);

                searchQuery = favoriteArtists.join(' ');
            }

            // Strategy 2: Use genre + mood if no history or as filter
            if (genre || mood) {
                searchQuery = [genre, mood, searchQuery].filter(Boolean).join(' ');
            }

            // Strategy 3: Fallback to trending if no history and no filters
            if (!searchQuery) {
                const year = new Date().getFullYear();
                searchQuery = `trending hits ${year}`;
            }

            // Add keywords for better playlist results
            const playlistKeywords = ['official playlist', 'top songs', 'best music'];
            const randomKeyword = playlistKeywords[Math.floor(Math.random() * playlistKeywords.length)];
            searchQuery += ` ${randomKeyword}`;

            // Search for recommendations with better query
            const result = await client.musicManager.search(`ytsearch:${searchQuery}`, interaction.user);

            if (!result || !result.tracks || result.tracks.length === 0) {
                throw new NoSearchResultsError(searchQuery);
            }

            // Get random unique tracks
            const uniqueTracks = [];
            const seenTitles = new Set();

            for (const track of result.tracks) {
                const titleKey = track.info.title.toLowerCase();
                if (!seenTitles.has(titleKey)) {
                    uniqueTracks.push(track);
                    seenTitles.add(titleKey);
                }
                
                if (uniqueTracks.length >= count) break;
            }

            recommendations = uniqueTracks.slice(0, count);

            // Create dropdown for selection
            const options = recommendations.map((track, index) => ({
                label: track.info.title.substring(0, 100),
                description: `${track.info.author.substring(0, 50)} • ${formatDuration(track.info.length)}`,
                value: `discover_${index}`,
                emoji: '🎵'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`discover_select_${interaction.user.id}`)
                .setPlaceholder('Chọn bài hát để phát')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🔍 Khám Phá Nhạc Mới')
                .setDescription(
                    `Đây là những gợi ý dành cho bạn${genre ? ` (${genre})` : ''}${mood ? ` - ${mood}` : ''}:\n\n` +
                    recommendations.map((track, i) => 
                        `**${i + 1}.** ${track.info.title}\n` +
                        `   └ ${track.info.author} • ${formatDuration(track.info.length)}`
                    ).join('\n\n')
                )
                .setFooter({ text: 'Chọn bài hát từ menu bên dưới để phát ngay!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], components: [row] });

            // Store tracks for selection using CacheManager
            const cacheKey = `${interaction.user.id}:${interaction.guildId}`;
            if (client.cacheManager) {
                client.cacheManager.set('discovery', cacheKey, {
                    tracks: recommendations,
                    timestamp: Date.now()
                });
            } else {
                // Fallback to legacy cache if CacheManager not available
                client._discoveryCache = client._discoveryCache || new Map();
                client._discoveryCache.set(cacheKey, {
                    tracks: recommendations,
                    timestamp: Date.now()
                });
                
                // Cleanup cache after 5 minutes
                setTimeout(() => {
                    client._discoveryCache?.delete(cacheKey);
                }, 5 * 60 * 1000);
            }

            logger.command('discover', interaction.user.id, interaction.guildId, {
                genre,
                mood,
                count: recommendations.length
            });

        } catch (error) {
            logger.error('Discover command error', { error: error.message, stack: error.stack });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
