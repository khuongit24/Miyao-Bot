/**
 * Queue Save Command
 * Save current queue to a playlist
 * @version 1.8.2 - Phase 4 feature
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Playlist from '../../database/models/Playlist.js';
import { createErrorEmbed, createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../../utils/logger.js';

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
            const playlistName = interaction.options.getString('name');
            const includeCurrent = interaction.options.getBoolean('include_current') ?? true;
            const createNew = interaction.options.getBoolean('create_new') ?? false;

            // Validate playlist name
            if (!playlistName || playlistName.length > 50) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Tên playlist không hợp lệ! Tên phải có 1-50 ký tự.', client.config)]
                });
            }

            // Get queue
            const queue = client.musicManager.getQueue(interaction.guildId);

            if (!queue) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Không có hàng đợi nào đang hoạt động!', client.config)]
                });
            }

            // Collect tracks to save
            const tracksToSave = [];

            if (includeCurrent && queue.current) {
                tracksToSave.push(queue.current);
            }

            if (queue.tracks.length > 0) {
                tracksToSave.push(...queue.tracks);
            }

            if (tracksToSave.length === 0) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Hàng đợi trống! Không có bài nào để lưu.', client.config)]
                });
            }

            // Check if playlist exists
            let playlist = Playlist.getByName(playlistName, interaction.user.id, interaction.guildId);
            let isNewPlaylist = false;

            if (playlist && createNew) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `Playlist "${playlistName}" đã tồn tại. Bỏ chọn "create_new" để thêm vào playlist này.`,
                            client.config
                        )
                    ]
                });
            }

            if (!playlist) {
                // Create new playlist
                try {
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
                } catch (createError) {
                    logger.error('Failed to create playlist for queue save', createError);
                    return interaction.editReply({
                        embeds: [createErrorEmbed('Không thể tạo playlist mới. Vui lòng thử lại!', client.config)]
                    });
                }
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

                    const simpleTrack = {
                        url: track.info.uri,
                        title: track.info.title,
                        author: track.info.author,
                        duration: track.info.length
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
                .setColor(savedCount > 0 ? client.config.bot.color : '#FFA500')
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
            logger.error('Queue save command error', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi lưu hàng đợi!', client.config)]
            });
        }
    }
};
