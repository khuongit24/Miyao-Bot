/**
 * @file similar.js
 * @description Find similar tracks based on current playing or search query
 * @version 1.6.0
 */

import { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { ValidationError, NoSearchResultsError, NothingPlayingError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('similar')
        .setDescription('Tìm nhạc tương tự với bài hát hiện tại hoặc bài hát chỉ định')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Tên bài hát hoặc URL (để trống để dùng bài đang phát)')
                .setRequired(false)
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

            const query = interaction.options.getString('query');
            const count = interaction.options.getInteger('count') || 5;

            let referenceTrack = null;

            // If no query provided, use current playing track
            if (!query) {
                const queue = client.musicManager.getQueue(interaction.guildId);
                
                if (!queue || !queue.current) {
                    throw new NothingPlayingError();
                }

                referenceTrack = queue.current;
            } else {
                // Search for the specified track
                const result = await client.musicManager.search(query, interaction.user);

                if (!result || !result.tracks || result.tracks.length === 0) {
                    throw new NoSearchResultsError(query);
                }

                referenceTrack = result.tracks[0];
            }

            // Build search query for similar tracks
            // Strategy: Use artist name + keywords like "similar", "remix", "cover"
            const artist = referenceTrack.info.author;
            const title = referenceTrack.info.title;
            
            // Extract keywords from title (remove common words)
            const commonWords = ['official', 'music', 'video', 'mv', 'audio', 'lyrics', 'hd', 'ft', 'feat'];
            const titleKeywords = title
                .toLowerCase()
                .split(/[\s\-\(\)\[\]]+/)
                .filter(word => word.length > 2 && !commonWords.includes(word))
                .slice(0, 3)
                .join(' ');

            // Search for similar tracks
            const searchQueries = [
                `${artist} ${titleKeywords}`,
                `${artist} similar songs`,
                `songs like ${title}`
            ];

            let allTracks = [];

            for (const searchQuery of searchQueries) {
                try {
                    const result = await client.musicManager.search(`ytsearch:${searchQuery}`, interaction.user);
                    
                    if (result && result.tracks && result.tracks.length > 0) {
                        allTracks.push(...result.tracks);
                    }
                } catch (error) {
                    logger.warn('Failed to search for similar tracks', { searchQuery, error: error.message });
                }

                // Stop if we have enough tracks
                if (allTracks.length >= count * 3) break;
            }

            if (allTracks.length === 0) {
                throw new NoSearchResultsError('similar tracks');
            }

            // Filter out the reference track itself and duplicates
            const referenceId = referenceTrack.info.identifier;
            const uniqueTracks = [];
            const seenIds = new Set([referenceId]);

            for (const track of allTracks) {
                if (!seenIds.has(track.info.identifier)) {
                    uniqueTracks.push(track);
                    seenIds.add(track.info.identifier);
                }
                
                if (uniqueTracks.length >= count) break;
            }

            if (uniqueTracks.length === 0) {
                throw new ValidationError('Không tìm thấy bài hát tương tự', 'similar');
            }

            const recommendations = uniqueTracks.slice(0, count);

            // Create dropdown for selection
            const options = recommendations.map((track, index) => ({
                label: track.info.title.substring(0, 100),
                description: `${track.info.author.substring(0, 50)} • ${formatDuration(track.info.length)}`,
                value: `similar_${index}`,
                emoji: '🎵'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`similar_select_${interaction.user.id}`)
                .setPlaceholder('Chọn bài hát để phát')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🔎 Nhạc Tương Tự')
                .setDescription(
                    `**Dựa trên:** ${referenceTrack.info.title}\n` +
                    `**Nghệ sĩ:** ${referenceTrack.info.author}\n\n` +
                    `**Gợi ý:**\n\n` +
                    recommendations.map((track, i) => 
                        `**${i + 1}.** ${track.info.title}\n` +
                        `   └ ${track.info.author} • ${formatDuration(track.info.length)}`
                    ).join('\n\n')
                )
                .setFooter({ text: 'Chọn bài hát từ menu bên dưới để phát ngay!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], components: [row] });

            // Store tracks for selection
            client._similarCache = client._similarCache || new Map();
            const cacheKey = `${interaction.user.id}:${interaction.guildId}`;
            client._similarCache.set(cacheKey, {
                tracks: recommendations,
                timestamp: Date.now()
            });

            // Cleanup cache after 5 minutes
            setTimeout(() => {
                client._similarCache.delete(cacheKey);
            }, 5 * 60 * 1000);

            logger.command('similar', interaction.user.id, interaction.guildId, {
                referenceTrack: referenceTrack.info.title,
                count: recommendations.length
            });

        } catch (error) {
            logger.error('Similar command error', { error: error.message, stack: error.stack });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Format duration from milliseconds to MM:SS
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
