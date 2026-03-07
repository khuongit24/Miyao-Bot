/**
 * Queue Save Command
 * Save current queue to a playlist
 * @version 1.9.0 - Standardized error handling
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Playlist from '../../database/models/Playlist.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import { ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { COLORS } from '../../config/design-system.js';

export default {
    data: new SlashCommandBuilder()
        .setName('save')
        .setDescription('Lưu hàng đợi hiện tại vào playlist')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Tên playlist (sẽ tạo mới nếu chưa có)')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addBooleanOption(option =>
            option.setName('include_current').setDescription('Bao gồm bài đang phát? (mặc định: có)').setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('create_new')
                .setDescription('Tạo playlist mới thay vì thêm vào playlist có sẵn?')
                .setRequired(false)
        ),

    async autocomplete(interaction, client) {
        const focusedValue = interaction.options.getFocused();

        try {
            // Get user's playlists for autocomplete
            const playlists = Playlist.getByOwner(interaction.user.id, interaction.guildId);

            const choices = playlists
                .filter(pl => pl.name.toLowerCase().includes(focusedValue.toLowerCase()))
                .slice(0, 25)
                .map(pl => ({
                    name: `${pl.name} (${pl.track_count || 0} bài)`,
                    value: pl.name
                }));

            // Add option to create new if not matching any
            if (focusedValue && !choices.some(c => c.value.toLowerCase() === focusedValue.toLowerCase())) {
                choices.unshift({
                    name: `📝 Tạo mới: "${focusedValue}"`,
                    value: focusedValue
                });
            }

            await interaction.respond(choices);
        } catch (error) {
            logger.error('Queue save autocomplete error', error);
            await interaction.respond([]);
        }
    },

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check resilience
            if (!isMusicSystemAvailable(client.musicManager)) {
                return sendErrorResponse(
                    interaction,
                    new Error(getDegradedModeMessage('nhạc').description),
                    client.config
                );
            }

            const playlistName = interaction.options.getString('name');
            const includeCurrent = interaction.options.getBoolean('include_current') ?? true;
            const createNew = interaction.options.getBoolean('create_new') ?? false;

            // Validate playlist name
            if (!playlistName || playlistName.length > 50) {
                throw new ValidationError('Tên playlist không hợp lệ! Tên phải có 1-50 ký tự.');
            }

            // Use middleware
            const queue = requireQueue(client.musicManager, interaction.guildId);

            // Collect tracks to save
            const tracksToSave = [];

            if (includeCurrent && queue.current) {
                tracksToSave.push(queue.current);
            }

            if (queue.tracks.length > 0) {
                tracksToSave.push(...queue.tracks);
            }

            if (tracksToSave.length === 0) {
                throw new ValidationError('Hàng đợi trống! Không có bài nào để lưu.');
            }

            // Check if playlist exists
            let playlist = Playlist.getByName(playlistName, interaction.user.id, interaction.guildId);
            let isNewPlaylist = false;

            if (playlist && createNew) {
                throw new ValidationError(
                    `Playlist "${playlistName}" đã tồn tại. Bỏ chọn "create_new" để thêm vào playlist này.`
                );
            }

            if (!playlist) {
                // Create new playlist
                playlist = Playlist.create(
                    playlistName,
                    interaction.user.id,
                    interaction.user.username,
                    interaction.guildId,
                    `Tạo từ hàng đợi ngày ${new Date().toLocaleDateString('vi-VN')}`,
                    false // Private by default
                );
                isNewPlaylist = true;

                logger.info('Created new playlist from queue save', {
                    playlistId: playlist.id,
                    name: playlistName,
                    userId: interaction.user.id
                });
            }

            // Save tracks to playlist
            let savedCount = 0;
            let skippedCount = 0;
            const existingUrls = new Set();

            // Get existing tracks to check for duplicates
            const existingTracks = Playlist.getTracks(playlist.id);
            existingTracks.forEach(t => existingUrls.add(t.track_url));

            for (const track of tracksToSave) {
                try {
                    // Skip duplicates
                    if (existingUrls.has(track.info.uri)) {
                        skippedCount++;
                        continue;
                    }

                    // FIX-LB05: Sanitize track data before saving to database
                    const sanitizeString = (str, maxLen = 500) => {
                        if (!str || typeof str !== 'string') return 'Unknown';
                        // Remove control characters (except newline/tab) and null bytes
                        return (
                            str
                                // eslint-disable-next-line no-control-regex
                                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                                .trim()
                                .substring(0, maxLen) || 'Unknown'
                        );
                    };

                    const trackUrl = track.info.uri;
                    // Basic URL validation — must start with http:// or https://
                    if (!trackUrl || !/^https?:\/\//i.test(trackUrl)) {
                        logger.warn('Skipping track with invalid URL in queue save', { url: trackUrl });
                        skippedCount++;
                        continue;
                    }

                    const simpleTrack = {
                        url: trackUrl.substring(0, 2048), // URLs should never exceed 2048 chars
                        title: sanitizeString(track.info.title, 500),
                        author: sanitizeString(track.info.author, 200),
                        duration:
                            typeof track.info.length === 'number' && track.info.length >= 0 ? track.info.length : 0
                    };

                    const added = Playlist.addTrack(playlist.id, simpleTrack, interaction.user.id);

                    if (added) {
                        savedCount++;
                        existingUrls.add(track.info.uri); // Track to avoid duplicates within this batch
                    } else {
                        skippedCount++;
                    }
                } catch (error) {
                    logger.warn('Failed to save track to playlist', {
                        track: track.info?.title,
                        error: error.message
                    });
                    skippedCount++;
                }
            }

            // Get updated track count
            const finalTracks = Playlist.getTracks(playlist.id);

            // Build response
            let description = isNewPlaylist
                ? `✨ Đã tạo playlist mới **${playlistName}**!\n\n`
                : `📋 Đã thêm vào playlist **${playlistName}**\n\n`;

            description += `✅ **Đã lưu:** ${savedCount}/${tracksToSave.length} bài\n`;

            if (skippedCount > 0) {
                description += `⏭️ **Bỏ qua:** ${skippedCount} bài (đã có trong playlist)\n`;
            }

            description += `\n📊 **Tổng:** ${finalTracks.length} bài trong playlist`;

            if (savedCount > 0) {
                description += '\n\n💡 Dùng `/playlist play name:' + playlistName + '` để phát playlist này!';
            }

            const embed = new EmbedBuilder()
                .setColor(savedCount > 0 ? client.config.bot.color : COLORS.WARNING)
                .setTitle(savedCount > 0 ? '✅ Đã Lưu Hàng Đợi' : '⚠️ Không Có Bài Nào Được Lưu')
                .setDescription(description)
                .setFooter({ text: `${client.config.bot.footer} | Playlist ID: ${playlist.id}` })
                .setTimestamp();

            // Add track preview (first 5 saved tracks)
            if (savedCount > 0 && savedCount <= 10) {
                const previewTracks = tracksToSave
                    .filter(t => !existingUrls.has(t.info.uri) || savedCount === tracksToSave.length)
                    .slice(0, 5)
                    .map((t, i) => {
                        const title = t.info.title.length > 40 ? t.info.title.substring(0, 37) + '...' : t.info.title;
                        return `${i + 1}. ${title}`;
                    })
                    .join('\n');

                if (previewTracks) {
                    embed.addFields({
                        name: '🎵 Bài hát đã lưu',
                        value: previewTracks + (savedCount > 5 ? `\n*...và ${savedCount - 5} bài khác*` : ''),
                        inline: false
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });

            logger.command('queue-save', interaction.user.id, interaction.guildId, {
                playlist: playlistName,
                saved: savedCount,
                skipped: skippedCount,
                isNew: isNewPlaylist
            });
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
