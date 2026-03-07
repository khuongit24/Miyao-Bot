/**
 * Playlist Control Handlers
 * Handles: Play playlist, Shuffle playlist, Clone playlist
 */

import { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import Playlist from '../../database/models/Playlist.js';
import { createErrorEmbed, createNowPlayingEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons } from '../../UI/components/MusicControls.js';
import { getDatabaseManager } from '../../database/DatabaseManager.js';
import logger from '../../utils/logger.js';
import {
    PlaylistNotFoundError,
    ValidationError,
    UserNotInVoiceError,
    VoiceChannelPermissionError,
    DifferentVoiceChannelError
} from '../../utils/errors.js';

export async function handlePlayPlaylistButton(interaction, client) {
    const playlistId = parseInt(interaction.customId.replace('playlist_play_', ''));
    if (isNaN(playlistId)) {
        throw new ValidationError('Playlist ID không hợp lệ!', 'playlist_id');
    }

    await interaction.deferReply();

    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    // Check if user is in voice channel
    if (!voiceChannel) {
        throw new UserNotInVoiceError();
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has(['Connect', 'Speak'])) {
        throw new VoiceChannelPermissionError(voiceChannel.name);
    }

    // Get playlist
    const playlist = Playlist.getById(playlistId);

    if (!playlist) {
        throw new PlaylistNotFoundError(`Playlist ID ${playlistId}`);
    }

    // Verify ownership or public status
    if (playlist.owner_id !== interaction.user.id && !playlist.is_public) {
        throw new ValidationError('Bạn không có quyền phát playlist này!', 'permission');
    }

    const playlistTracks = Playlist.getTracks(playlist.id);

    if (playlistTracks.length === 0) {
        throw new ValidationError('Playlist đang trống!', 'tracks');
    }

    // Get or create queue
    let queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue) {
        queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
    }

    // Check if bot is in different voice channel
    if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
        throw new DifferentVoiceChannelError();
    }

    // Resolve all tracks from URIs to get encoded data (PARALLEL PROCESSING)
    logger.info('Resolving playlist tracks (parallel)', { playlistId: playlist.id, trackCount: playlistTracks.length });

    const resolvedTracks = [];
    let failedCount = 0;

    // Batch processing to avoid overwhelming Lavalink
    const BATCH_SIZE = 10;

    for (let i = 0; i < playlistTracks.length; i += BATCH_SIZE) {
        const batch = playlistTracks.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map(simpleTrack =>
                client.musicManager
                    .search(simpleTrack.track_url, interaction.user)
                    .then(result => ({ success: true, result, track: simpleTrack }))
                    .catch(error => ({ success: false, error, track: simpleTrack }))
            )
        );

        for (const promise of results) {
            if (promise.status === 'fulfilled') {
                const { success, result, track } = promise.value;

                if (success && result?.tracks?.length > 0) {
                    resolvedTracks.push(result.tracks[0]);
                } else {
                    logger.warn('Failed to resolve track from playlist', {
                        uri: track.track_url,
                        title: track.track_title
                    });
                    failedCount++;
                }
            } else {
                logger.error('Error resolving playlist track', {
                    error: promise.reason
                });
                failedCount++;
            }
        }

        if (playlistTracks.length > BATCH_SIZE) {
            const processed = Math.min(i + BATCH_SIZE, playlistTracks.length);
            logger.debug(`Resolved ${processed}/${playlistTracks.length} tracks`);
        }
    }

    if (resolvedTracks.length === 0) {
        throw new ValidationError('Không thể tải bất kỳ bài hát nào từ playlist!', 'tracks');
    }

    // Add requester to all resolved tracks
    resolvedTracks.forEach(track => {
        track.requester = interaction.user.id;
    });

    // Add all resolved tracks to queue
    queue.add(resolvedTracks);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Đang Phát Playlist')
        .setDescription(
            `**${playlist.name}**\n` +
                `└ Đã thêm ${resolvedTracks.length}/${playlistTracks.length} bài hát vào hàng đợi` +
                (failedCount > 0 ? `\n⚠️ ${failedCount} bài không tải được` : '')
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Start playing if not already
    if (!queue.current) {
        await queue.play();

        // Send now playing with buttons after a short delay
        setTimeout(async () => {
            try {
                const nowPlayingMessage = await interaction.channel.send({
                    embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                    components: createNowPlayingButtons(queue, false)
                });

                queue.setNowPlayingMessage(nowPlayingMessage);
            } catch (error) {
                logger.error('Failed to send now playing message from playlist button', error);
            }
        }, 1000);
    }

    logger.command('playlist-play-button', interaction.user.id, interaction.guildId);
}

export async function handleShufflePlaylist(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const playlistId = parseInt(interaction.customId.replace('playlist_shuffle_', ''));
    if (isNaN(playlistId)) {
        throw new ValidationError('Playlist ID không hợp lệ!', 'playlist_id');
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

    if (tracks.length < 2) {
        throw new ValidationError('Playlist cần ít nhất 2 bài hát để xáo trộn!', 'tracks');
    }

    // Shuffle the tracks using Fisher-Yates algorithm
    const shuffledPositions = [...Array(tracks.length).keys()].map(i => i + 1);
    for (let i = shuffledPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPositions[i], shuffledPositions[j]] = [shuffledPositions[j], shuffledPositions[i]];
    }

    // Update positions in database
    const db = getDatabaseManager();

    try {
        db.transaction(() => {
            // Temporarily set all positions to negative to avoid conflicts
            for (let i = 0; i < tracks.length; i++) {
                db.db.prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?').run(-(i + 1), tracks[i].id);
            }

            // Set new shuffled positions
            for (let i = 0; i < tracks.length; i++) {
                db.db
                    .prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?')
                    .run(shuffledPositions[i], tracks[i].id);
            }
        });
    } catch (error) {
        throw new ValidationError(`Không thể xáo trộn playlist: ${error.message}`, 'shuffle');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🔀 Đã Xáo Trộn Playlist')
        .setDescription(
            `Playlist **${playlist.name}** đã được xáo trộn thành công!\n\n🎵 **${tracks.length}** bài hát đã được sắp xếp lại ngẫu nhiên.`
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-shuffle', interaction.user.id, interaction.guildId);
}

export async function showClonePlaylistModal(interaction) {
    const playlistId = parseInt(interaction.customId.replace('playlist_clone_', ''));
    if (isNaN(playlistId)) {
        throw new ValidationError('Playlist ID không hợp lệ!', 'playlist_id');
    }

    // Get source playlist
    const sourcePlaylist = Playlist.getById(playlistId);

    if (!sourcePlaylist) {
        throw new PlaylistNotFoundError(`Playlist ID ${playlistId}`);
    }

    const modal = new ModalBuilder().setCustomId(`playlist_clone_submit_${playlistId}`).setTitle('Nhân Bản Playlist');

    const nameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên Playlist Mới')
        .setPlaceholder('Nhập tên cho playlist mới')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setValue(`${sourcePlaylist.name} (Copy)`);

    const row = new ActionRowBuilder().addComponents(nameInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

export async function handleClonePlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sourcePlaylistId = parseInt(interaction.customId.replace('playlist_clone_submit_', ''));
    if (isNaN(sourcePlaylistId)) {
        throw new ValidationError('Playlist ID không hợp lệ!', 'playlist_id');
    }
    const newName = interaction.fields.getTextInputValue('playlist_name').trim();

    // Validate name
    if (newName.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'name');
    }

    // Get source playlist
    const sourcePlaylist = Playlist.getById(sourcePlaylistId);

    if (!sourcePlaylist) {
        throw new PlaylistNotFoundError(`Source Playlist ID ${sourcePlaylistId}`);
    }

    // Check if user can access source playlist (own or public)
    if (sourcePlaylist.owner_id !== interaction.user.id && !sourcePlaylist.is_public) {
        throw new ValidationError('Bạn không có quyền sao chép playlist này!', 'permission');
    }

    // Check if new name conflicts with existing playlist
    const existing = Playlist.getByName(newName, interaction.user.id, interaction.guildId);
    if (existing) {
        throw new ValidationError(`Playlist "${newName}" đã tồn tại`, 'name');
    }

    // Create new playlist
    const newPlaylist = Playlist.create(
        newName,
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        `Bản sao từ: ${sourcePlaylist.name}`,
        false // Clone is private by default
    );

    if (!newPlaylist) {
        throw new ValidationError('Không thể tạo playlist mới!', 'create');
    }

    // Copy all tracks from source to new playlist
    const sourceTracks = Playlist.getTracks(sourcePlaylistId);
    let copiedCount = 0;

    for (const track of sourceTracks) {
        try {
            const trackData = {
                url: track.track_url,
                title: track.track_title,
                author: track.track_author,
                duration: track.track_duration
            };

            const added = Playlist.addTrack(newPlaylist.id, trackData, interaction.user.id);
            if (added) copiedCount++;
        } catch (error) {
            logger.warn('Failed to copy track to cloned playlist', { error: error.message });
        }
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Đã Nhân Bản Playlist')
        .setDescription(
            `Playlist **${newName}** đã được tạo từ **${sourcePlaylist.name}**!\n\n` +
                `✅ Đã sao chép **${copiedCount}**/${sourceTracks.length} bài hát`
        )
        .addFields([
            {
                name: '💡 Gợi ý',
                value: 'Sử dụng `/playlist show` để xem playlist mới của bạn!',
                inline: false
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-clone', interaction.user.id, interaction.guildId);
}
