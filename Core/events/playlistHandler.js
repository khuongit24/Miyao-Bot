/**
 * @file playlistHandler.js
 * @description Handle playlist button interactions and modal submissions
 */

import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} from 'discord.js';
import Playlist from '../database/models/Playlist.js';
import { createErrorEmbed, createSuccessEmbed, createTrackAddedEmbed, createNowPlayingEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons } from '../../UI/components/MusicControls.js';
import logger from '../utils/logger.js';
import { 
    PlaylistNotFoundError,
    ValidationError,
    NoSearchResultsError,
    UserNotInVoiceError,
    VoiceChannelPermissionError,
    DifferentVoiceChannelError
} from '../utils/errors.js';

/**
 * Handle playlist button interactions
 */
export async function handlePlaylistButton(interaction, client) {
    const customId = interaction.customId;
    
    try {
        // Handle playlist play button
        if (customId.startsWith('playlist_play_')) {
            await handlePlayPlaylistButton(interaction, client);
        }
        // Handle playlist track remove button
        else if (customId.startsWith('playlist_remove_track_')) {
            await showRemovePlaylistTrackModal(interaction);
        }
        // Handle button clicks to show modals
        else if (customId === 'playlist_create_modal') {
            await showCreatePlaylistModal(interaction);
        } 
        else if (customId === 'playlist_search_modal') {
            await showSearchPlaylistModal(interaction);
        } 
        else if (customId === 'playlist_add_track_modal') {
            await showAddTrackModal(interaction);
        } 
        else if (customId === 'playlist_delete_modal') {
            await showDeletePlaylistModal(interaction);
        }
    } catch (error) {
        logger.error('Error handling playlist button', { error: error.message, customId });
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi xử lý yêu cầu!', client.config)],
                ephemeral: true
            });
        }
    }
}

/**
 * Handle playlist modal submissions
 */
export async function handlePlaylistModalSubmit(interaction, client) {
    const customId = interaction.customId;
    
    try {
        if (customId === 'playlist_create_submit') {
            await handleCreatePlaylistSubmit(interaction, client);
        } 
        else if (customId === 'playlist_search_submit') {
            await handleSearchPlaylistSubmit(interaction, client);
        } 
        else if (customId === 'playlist_add_track_submit') {
            await handleAddTrackSubmit(interaction, client);
        } 
        else if (customId === 'playlist_delete_submit') {
            await handleDeletePlaylistSubmit(interaction, client);
        }
        else if (customId.startsWith('playlist_remove_track_submit_')) {
            await handleRemovePlaylistTrackSubmit(interaction, client);
        }
        else if (customId === 'add_current_track_to_playlist_modal') {
            await handleAddCurrentTrackToPlaylistSubmit(interaction, client);
        }
        else if (customId === 'add_queue_to_playlist_modal') {
            await handleAddQueueToPlaylistSubmit(interaction, client);
        }
    } catch (error) {
        logger.error('Error handling playlist modal submit', { error: error.message, customId });
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [createErrorEmbed(
                    error.message || 'Đã xảy ra lỗi khi xử lý!',
                    client.config
                )],
                ephemeral: true
            });
        }
    }
}

/**
 * Show create playlist modal
 */
async function showCreatePlaylistModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('playlist_create_submit')
        .setTitle('Tạo Playlist Mới');
    
    const nameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên Playlist')
        .setPlaceholder('Nhập tên playlist (tối đa 50 ký tự)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);
    
    const descriptionInput = new TextInputBuilder()
        .setCustomId('playlist_description')
        .setLabel('Mô Tả (Không bắt buộc)')
        .setPlaceholder('Nhập mô tả cho playlist')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);
    
    const publicInput = new TextInputBuilder()
        .setCustomId('playlist_public')
        .setLabel('Công Khai? (yes/no)')
        .setPlaceholder('Nhập "yes" để công khai, "no" để riêng tư')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(3)
        .setValue('no');
    
    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(descriptionInput);
    const row3 = new ActionRowBuilder().addComponents(publicInput);
    
    modal.addComponents(row1, row2, row3);
    
    await interaction.showModal(modal);
}

/**
 * Show search playlist modal
 */
async function showSearchPlaylistModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('playlist_search_submit')
        .setTitle('Tìm Kiếm Playlist');
    
    const nameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên Playlist')
        .setPlaceholder('Nhập tên playlist để tìm kiếm')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);
    
    const row = new ActionRowBuilder().addComponents(nameInput);
    modal.addComponents(row);
    
    await interaction.showModal(modal);
}

/**
 * Show add track modal
 */
async function showAddTrackModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('playlist_add_track_submit')
        .setTitle('Thêm Nhạc Vào Playlist');
    
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

/**
 * Show delete playlist modal
 */
async function showDeletePlaylistModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('playlist_delete_submit')
        .setTitle('Xóa Playlist');
    
    const nameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên Playlist')
        .setPlaceholder('Nhập tên playlist cần xóa')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);
    
    const confirmInput = new TextInputBuilder()
        .setCustomId('confirm_delete')
        .setLabel('Xác Nhận (gõ "XAC NHAN" để xóa)')
        .setPlaceholder('Gõ "XAC NHAN" để xác nhận xóa')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);
    
    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(confirmInput);
    
    modal.addComponents(row1, row2);
    
    await interaction.showModal(modal);
}

/**
 * Handle create playlist submission
 */
async function handleCreatePlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    
    const name = interaction.fields.getTextInputValue('playlist_name').trim();
    const description = interaction.fields.getTextInputValue('playlist_description')?.trim() || null;
    const publicInput = interaction.fields.getTextInputValue('playlist_public')?.trim().toLowerCase() || 'no';
    
    const isPublic = publicInput === 'yes' || publicInput === 'có' || publicInput === 'co';
    
    // Validate name
    if (name.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'name');
    }
    
    if (name.length > 50) {
        throw new ValidationError('Tên playlist không được dài quá 50 ký tự', 'name');
    }
    
    // Check if playlist already exists
    const existing = Playlist.getByName(name, interaction.user.id, interaction.guildId);
    if (existing) {
        throw new ValidationError(`Playlist "${name}" đã tồn tại`, 'name');
    }
    
    // Create playlist
    const playlist = Playlist.create(
        name,
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        description,
        isPublic
    );
    
    if (!playlist) {
        throw new Error('Không thể tạo playlist. Vui lòng thử lại sau.');
    }
    
    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Playlist Đã Tạo')
        .setDescription(`Playlist **${name}** đã được tạo thành công!`)
        .addFields([
            {
                name: '📋 Thông tin',
                value: `• **Mô tả:** ${description || 'Không có'}\n• **Công khai:** ${isPublic ? 'Có' : 'Không'}\n• **Số bài hát:** 0`,
                inline: false
            },
            {
                name: '💡 Tiếp theo',
                value: `Sử dụng \`/playlist menu\` để quản lý playlist của bạn!`,
                inline: false
            }
        ])
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-create-modal', interaction.user.id, interaction.guildId);
}

/**
 * Handle search playlist submission
 */
async function handleSearchPlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    
    const name = interaction.fields.getTextInputValue('playlist_name').trim();
    
    if (name.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'name');
    }
    
    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);
    
    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }
    
    const tracks = Playlist.getTracks(playlist.id);
    
    let description = `**Mô tả:** ${playlist.description || 'Không có'}\n`;
    description += `**Công khai:** ${playlist.is_public ? 'Có' : 'Không'}\n`;
    description += `**Tạo lúc:** ${new Date(playlist.created_at).toLocaleString('vi-VN')}\n\n`;
    
    if (tracks.length === 0) {
        description += '*Playlist đang trống*';
    } else {
        description += `**Danh sách bài hát:**\n`;
        const trackList = tracks.slice(0, 10).map((track, index) => {
            const title = track.track_title.length > 50 
                ? track.track_title.substring(0, 47) + '...' 
                : track.track_title;
            return `${index + 1}. ${title}`;
        }).join('\n');
        description += trackList;
        
        if (tracks.length > 10) {
            description += `\n\n...và ${tracks.length - 10} bài khác`;
        }
    }
    
    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`🎵 ${playlist.name}`)
        .setDescription(description)
        .setFooter({ text: `Playlist ID: ${playlist.id} • ${client.config.bot.footer}` })
        .setTimestamp();
    
    // Add buttons to play and remove tracks if playlist has tracks
    const components = [];
    if (tracks.length > 0) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`playlist_play_${playlist.id}`)
                    .setLabel('Phát Playlist')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`playlist_remove_track_${playlist.id}`)
                    .setLabel('Xóa Bài Hát')
                    .setEmoji('🗑️')
                    .setStyle(ButtonStyle.Danger)
            );
        components.push(row);
    }
    
    await interaction.editReply({ embeds: [embed], components });
    logger.command('playlist-search-modal', interaction.user.id, interaction.guildId);
}

/**
 * Handle add track submission
 */
async function handleAddTrackSubmit(interaction, client) {
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

/**
 * Handle delete playlist submission
 */
async function handleDeletePlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    
    const name = interaction.fields.getTextInputValue('playlist_name').trim();
    const confirm = interaction.fields.getTextInputValue('confirm_delete').trim().toUpperCase();
    
    if (name.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'name');
    }
    
    if (confirm !== 'XAC NHAN') {
        throw new ValidationError('Xác nhận không đúng. Vui lòng gõ "XAC NHAN" để xóa', 'confirm');
    }
    
    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);
    
    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }
    
    const success = Playlist.delete(playlist.id, interaction.user.id);
    
    if (!success) {
        throw new Error('Không thể xóa playlist');
    }
    
    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Xóa Playlist')
        .setDescription(`Playlist **${name}** đã được xóa thành công!`)
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-delete-modal', interaction.user.id, interaction.guildId);
}

/**
 * Handle adding current track to playlist submission
 */
async function handleAddCurrentTrackToPlaylistSubmit(interaction, client) {
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
        playlist = Playlist.create({
            name: playlistName,
            description: `Auto-created from now playing`,
            ownerId: interaction.user.id,
            guildId: interaction.guildId,
            isPublic: false
        });
        
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
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    logger.command('add-current-track-to-playlist', interaction.user.id, interaction.guildId);
}

/**
 * Handle adding entire queue to playlist submission
 */
async function handleAddQueueToPlaylistSubmit(interaction, client) {
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
        playlist = Playlist.create({
            name: playlistName,
            description: `Auto-created from queue (${allTracks.length} tracks)`,
            ownerId: interaction.user.id,
            guildId: interaction.guildId,
            isPublic: false
        });
        
        if (!playlist) {
            throw new Error('Không thể tạo playlist mới!');
        }
    }
    
    // Add all tracks to playlist
    let successCount = 0;
    let failedCount = 0;
    
    for (const track of allTracks) {
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
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    logger.command('add-queue-to-playlist', interaction.user.id, interaction.guildId);
}

/**
 * Handle play playlist button click
 */
async function handlePlayPlaylistButton(interaction, client) {
    const playlistId = parseInt(interaction.customId.replace('playlist_play_', ''));
    
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
        queue = await client.musicManager.createQueue(
            interaction.guildId,
            voiceChannel.id,
            interaction.channel
        );
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
                client.musicManager.search(simpleTrack.track_url, interaction.user)
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
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
    // Start playing if not already
    if (!queue.current) {
        await queue.play();
        
        // Send now playing with buttons after a short delay
        setTimeout(async () => {
            try {
                const { createNowPlayingEmbed } = await import('../../UI/embeds/MusicEmbeds.js');
                const { createNowPlayingButtons } = await import('../../UI/components/MusicControls.js');
                
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

/**
 * Show remove playlist track modal
 */
async function showRemovePlaylistTrackModal(interaction) {
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

/**
 * Handle remove playlist track submission
 */
async function handleRemovePlaylistTrackSubmit(interaction, client) {
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
            throw new ValidationError(`Vị trí không hợp lệ! Playlist có ${tracks.length} bài hát (1-${tracks.length})`, 'position');
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
        .setFooter({ text: `Còn ${remainingTracks.length} bài hát trong playlist` })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-remove-track-modal', interaction.user.id, interaction.guildId);
}

export default {
    handlePlaylistButton,
    handlePlaylistModalSubmit
};
