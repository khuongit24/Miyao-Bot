/**
 * Playlist Track Handlers
 * Handles: Add track, Remove track, Add current/queue to playlist
 */

import { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import Playlist from '../../database/models/Playlist.js';
import { COLORS } from '../../config/design-system.js';
import { ValidationError, PlaylistNotFoundError, NoSearchResultsError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export async function showAddTrackModal(interaction) {
    const modal = new ModalBuilder().setCustomId('playlist_add_track_submit').setTitle('Thêm Nhạc Vào Playlist');

    const playlistNameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên Playlist')
        .setPlaceholder('Nhập tên playlist')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

    const queryInput = new TextInputBuilder()
        .setCustomId('track_query')
        .setLabel('Bài Hát (URL hoặc tên)')
        .setPlaceholder('Nhập URL hoặc tên bài hát')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

    const row1 = new ActionRowBuilder().addComponents(playlistNameInput);
    const row2 = new ActionRowBuilder().addComponents(queryInput);

    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
}

export async function handleAddTrackSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.fields.getTextInputValue('playlist_name').trim();
    const query = interaction.fields.getTextInputValue('track_query').trim();

    if (name.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'name');
    }

    if (query.length === 0) {
        throw new ValidationError('Truy vấn không được để trống', 'query');
    }

    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    // Search for track
    const result = await client.musicManager.search(query, interaction.user);

    if (!result || !result.tracks || result.tracks.length === 0) {
        throw new NoSearchResultsError(query);
    }

    const track = result.tracks[0];

    // Convert to simple format for storage
    const simpleTrack = {
        url: track.info.uri,
        title: track.info.title,
        author: track.info.author,
        duration: track.info.length
    };

    const addedTrack = Playlist.addTrack(playlist.id, simpleTrack, interaction.user.id);

    if (!addedTrack) {
        throw new Error('Không thể thêm bài hát vào playlist');
    }

    const tracks = Playlist.getTracks(playlist.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Thêm Vào Playlist')
        .setDescription(`**${track.info.title}**\n└ Đã thêm vào playlist **${name}**`)
        .setFooter({ text: `Tổng ${tracks.length} bài hát • ${client.config.bot.footer}` })
        .setTimestamp();

    if (track.info.artworkUrl) {
        embed.setThumbnail(track.info.artworkUrl);
    }

    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-add-track-modal', interaction.user.id, interaction.guildId);
}

export async function showAddTrackToPlaylistModal(interaction) {
    const playlistId = parseInt(interaction.customId.replace('playlist_add_track_to_', ''));

    const modal = new ModalBuilder()
        .setCustomId(`playlist_add_track_to_submit_${playlistId}`)
        .setTitle('Thêm Nhạc Vào Playlist');

    const queryInput = new TextInputBuilder()
        .setCustomId('track_query')
        .setLabel('Bài Hát (URL hoặc tên)')
        .setPlaceholder('Nhập URL YouTube/Spotify hoặc tên bài hát để tìm kiếm')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

    const row = new ActionRowBuilder().addComponents(queryInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

export async function handleAddTrackToPlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const playlistId = parseInt(interaction.customId.replace('playlist_add_track_to_submit_', ''));
    const query = interaction.fields.getTextInputValue('track_query').trim();

    if (!query) {
        throw new ValidationError('Vui lòng nhập URL hoặc tên bài hát!', 'track_query');
    }

    // Get playlist
    const playlist = Playlist.getById(playlistId);

    if (!playlist) {
        throw new PlaylistNotFoundError(`Playlist ID ${playlistId}`);
    }

    // Verify ownership
    if (playlist.owner_id !== interaction.user.id) {
        throw new ValidationError('Bạn không có quyền chỉnh sửa playlist này!', 'permission');
    }

    // Check if query contains multiple lines (bulk add)
    const queries = query
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);

    if (queries.length > 1) {
        // Bulk add mode
        let successCount = 0;
        let failedCount = 0;
        const failedTracks = [];

        const loadingEmbed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('⏳ Đang thêm nhạc...')
            .setDescription(`Đang xử lý ${queries.length} bài hát...`)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        await interaction.editReply({ embeds: [loadingEmbed] });

        for (const trackQuery of queries.slice(0, 25)) {
            // Limit to 25 tracks per bulk add
            try {
                const result = await client.musicManager.search(trackQuery, interaction.user);

                if (result?.tracks?.length > 0) {
                    const track = result.tracks[0];
                    const simpleTrack = {
                        url: track.info.uri,
                        title: track.info.title,
                        author: track.info.author,
                        duration: track.info.length
                    };

                    const added = Playlist.addTrack(playlist.id, simpleTrack, interaction.user.id);
                    if (added) {
                        successCount++;
                    } else {
                        failedCount++;
                        failedTracks.push(trackQuery.substring(0, 50));
                    }
                } else {
                    failedCount++;
                    failedTracks.push(trackQuery.substring(0, 50));
                }
            } catch (error) {
                failedCount++;
                failedTracks.push(trackQuery.substring(0, 50));
            }
        }

        const tracks = Playlist.getTracks(playlist.id);
        const embed = new EmbedBuilder()
            .setColor(failedCount > 0 ? COLORS.WARNING : client.config.bot.color)
            .setTitle('📋 Kết Quả Thêm Nhạc')
            .setDescription(
                `**${playlist.name}**\n\n` +
                    `✅ Thành công: **${successCount}** bài\n` +
                    `❌ Thất bại: **${failedCount}** bài` +
                    (failedTracks.length > 0
                        ? `\n\n**Không tìm thấy:**\n${failedTracks
                              .slice(0, 5)
                              .map(t => `• ${t}...`)
                              .join(
                                  '\n'
                              )}${failedTracks.length > 5 ? `\n...và ${failedTracks.length - 5} bài khác` : ''}`
                        : '')
            )
            .setFooter({ text: `Tổng ${tracks.length} bài hát trong playlist • ${client.config.bot.footer}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } else {
        // Single track add mode
        const result = await client.musicManager.search(query, interaction.user);

        if (!result || !result.tracks || result.tracks.length === 0) {
            throw new NoSearchResultsError(query);
        }

        const track = result.tracks[0];

        const simpleTrack = {
            url: track.info.uri,
            title: track.info.title,
            author: track.info.author,
            duration: track.info.length
        };

        const addedTrack = Playlist.addTrack(playlist.id, simpleTrack, interaction.user.id);

        if (!addedTrack) {
            throw new ValidationError('Không thể thêm bài hát vào playlist!', 'add');
        }

        const tracks = Playlist.getTracks(playlist.id);

        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('✅ Đã Thêm Vào Playlist')
            .setDescription(`**${track.info.title}**\n└ Đã thêm vào playlist **${playlist.name}**`)
            .setFooter({ text: `Tổng ${tracks.length} bài hát • ${client.config.bot.footer}` })
            .setTimestamp();

        if (track.info.artworkUrl) {
            embed.setThumbnail(track.info.artworkUrl);
        }

        await interaction.editReply({ embeds: [embed] });
    }

    logger.command('playlist-add-track-to-modal', interaction.user.id, interaction.guildId);
}

export async function showRemovePlaylistTrackModal(interaction) {
    const playlistId = parseInt(interaction.customId.replace('playlist_remove_track_', ''));

    const modal = new ModalBuilder()
        .setCustomId(`playlist_remove_track_submit_${playlistId}`)
        .setTitle('Xóa Bài Hát Khỏi Playlist');

    const trackInput = new TextInputBuilder()
        .setCustomId('track_identifier')
        .setLabel('Tên hoặc số thứ tự bài hát')
        .setPlaceholder('Nhập tên bài hát hoặc số thứ tự (ví dụ: 1, 2, 3...)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

    const row = new ActionRowBuilder().addComponents(trackInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

export async function handleRemovePlaylistTrackSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const playlistId = parseInt(interaction.customId.replace('playlist_remove_track_submit_', ''));
    const trackIdentifier = interaction.fields.getTextInputValue('track_identifier').trim();

    if (!trackIdentifier) {
        throw new ValidationError('Vui lòng nhập tên hoặc số thứ tự bài hát!', 'track_identifier');
    }

    // Get playlist
    const playlist = Playlist.getById(playlistId);

    if (!playlist) {
        throw new PlaylistNotFoundError(`Playlist ID ${playlistId}`);
    }

    // Verify ownership
    if (playlist.owner_id !== interaction.user.id) {
        throw new ValidationError('Bạn không có quyền chỉnh sửa playlist này!', 'permission');
    }

    const tracks = Playlist.getTracks(playlist.id);

    if (tracks.length === 0) {
        throw new ValidationError('Playlist đang trống!', 'tracks');
    }

    let trackToRemove = null;

    // Check if it's a number (position)
    const position = parseInt(trackIdentifier);
    if (!isNaN(position)) {
        if (position < 1 || position > tracks.length) {
            throw new ValidationError(
                `Vị trí không hợp lệ! Playlist có ${tracks.length} bài hát (1-${tracks.length})`,
                'position'
            );
        }
        trackToRemove = tracks.find(t => t.position === position);
    } else {
        // Search by name
        const searchTerm = trackIdentifier.toLowerCase();
        trackToRemove = tracks.find(t => t.track_title.toLowerCase().includes(searchTerm));

        if (!trackToRemove) {
            throw new ValidationError(`Không tìm thấy bài hát có tên "${trackIdentifier}"`, 'track_name');
        }
    }

    if (!trackToRemove) {
        throw new ValidationError('Không tìm thấy bài hát!', 'track');
    }

    const success = Playlist.removeTrack(playlist.id, trackToRemove.id, interaction.user.id);

    if (!success) {
        throw new ValidationError('Không thể xóa bài hát khỏi playlist!', 'remove');
    }

    const remainingTracks = Playlist.getTracks(playlist.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Xóa Bài Hát')
        .setDescription(`**${trackToRemove.track_title}**\n└ Đã xóa khỏi playlist **${playlist.name}**`)
        .setFooter({ text: `Còn ${remainingTracks.length} bài hát trong playlist • ${client.config.bot.footer}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-remove-track-modal', interaction.user.id, interaction.guildId);
}

export async function handleAddCurrentTrackToPlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const playlistName = interaction.fields.getTextInputValue('playlist_name').trim();

    if (playlistName.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'playlist_name');
    }

    // Get the queue
    const queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue || !queue.current) {
        throw new Error('Không có bài hát nào đang phát!');
    }

    const track = queue.current;

    // Get or create playlist
    let playlist = Playlist.getByName(playlistName, interaction.user.id, interaction.guildId);

    if (!playlist) {
        // Create new playlist if it doesn't exist
        playlist = Playlist.create(
            playlistName,
            interaction.user.id,
            interaction.user.username,
            interaction.guildId,
            'Auto-created from now playing',
            false
        );

        if (!playlist) {
            throw new Error('Không thể tạo playlist mới!');
        }
    }

    // Add track to playlist
    const trackData = {
        title: track.info.title,
        url: track.info.uri,
        duration: track.info.length,
        author: track.info.author,
        thumbnail: track.info.artworkUrl || null
    };

    const success = Playlist.addTrack(playlist.id, trackData, interaction.user.id);

    if (!success) {
        throw new Error('Không thể thêm bài hát vào playlist!');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Thêm Bài Hát')
        .setDescription(`**${track.info.title}** đã được thêm vào playlist **${playlistName}**`)
        .setThumbnail(trackData.thumbnail)
        .addFields(
            { name: '📝 Playlist', value: playlistName, inline: true },
            { name: '🎵 Bài hát', value: track.info.title, inline: true }
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('add-current-track-to-playlist', interaction.user.id, interaction.guildId);
}

export async function handleAddQueueToPlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const playlistName = interaction.fields.getTextInputValue('playlist_name').trim();

    if (playlistName.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'playlist_name');
    }

    // Get the queue
    const queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue) {
        throw new Error('Không có hàng đợi nào!');
    }

    // Collect all tracks (current + queued)
    const allTracks = [];

    if (queue.current) {
        allTracks.push(queue.current);
    }

    if (queue.tracks && queue.tracks.length > 0) {
        allTracks.push(...queue.tracks);
    }

    if (allTracks.length === 0) {
        throw new Error('Hàng đợi trống!');
    }

    // Get or create playlist
    let playlist = Playlist.getByName(playlistName, interaction.user.id, interaction.guildId);

    if (!playlist) {
        // Create new playlist if it doesn't exist
        playlist = Playlist.create(
            playlistName,
            interaction.user.id,
            interaction.user.username,
            interaction.guildId,
            `Auto-created from queue (${allTracks.length} tracks)`,
            false
        );

        if (!playlist) {
            throw new Error('Không thể tạo playlist mới!');
        }
    }

    // Add all tracks to playlist
    let successCount = 0;
    let failedCount = 0;

    for (const track of allTracks) {
        if (!track?.info) {
            failedCount++;
            continue;
        }

        const trackData = {
            title: track.info.title,
            url: track.info.uri,
            duration: track.info.length,
            author: track.info.author,
            thumbnail: track.info.artworkUrl || null
        };

        const success = Playlist.addTrack(playlist.id, trackData, interaction.user.id);

        if (success) {
            successCount++;
        } else {
            failedCount++;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Thêm Hàng Đợi')
        .setDescription(`**${successCount}** bài hát đã được thêm vào playlist **${playlistName}**`)
        .addFields(
            { name: '📝 Playlist', value: playlistName, inline: true },
            { name: '✅ Thành công', value: successCount.toString(), inline: true },
            { name: '❌ Thất bại', value: failedCount.toString(), inline: true }
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('add-queue-to-playlist', interaction.user.id, interaction.guildId);
}
