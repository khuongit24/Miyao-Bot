/**
 * Playlist View Handlers
 * Handles: Search/View playlist
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
import Playlist from '../../database/models/Playlist.js';
import { PlaylistNotFoundError, ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export async function showSearchPlaylistModal(interaction) {
    const modal = new ModalBuilder().setCustomId('playlist_search_submit').setTitle('Tìm Kiếm Playlist');

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

export async function handleSearchPlaylistSubmit(interaction, client) {
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
    const isOwn = playlist.owner_id === interaction.user.id;

    let description = `**Chủ sở hữu:** ${isOwn ? 'Bạn' : `<@${playlist.owner_id}>`}\n`;
    description += `**Mô tả:** ${playlist.description || 'Không có'}\n`;
    description += `**Công khai:** ${playlist.is_public ? 'Có' : 'Không'}\n`;
    description += `**Tạo lúc:** ${new Date(playlist.created_at).toLocaleString('vi-VN')}\n\n`;

    if (tracks.length === 0) {
        description += '*Playlist đang trống*';
    } else {
        description += '**Danh sách bài hát:**\n';
        const trackList = tracks
            .slice(0, 10)
            .map((track, index) => {
                const title =
                    track.track_title.length > 50 ? track.track_title.substring(0, 47) + '...' : track.track_title;
                return `${index + 1}. ${title}`;
            })
            .join('\n');
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

    // Build action buttons
    const components = [];

    // Row 1: Play and Edit actions
    const row1 = new ActionRowBuilder();

    // Play button (always available if playlist has tracks)
    if (tracks.length > 0) {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_play_${playlist.id}`)
                .setLabel('Phát Playlist')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Success)
        );
    }

    // Only show edit buttons if user owns the playlist
    if (isOwn) {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_add_track_to_${playlist.id}`)
                .setLabel('Thêm Nhạc')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`playlist_remove_track_${playlist.id}`)
                .setLabel('Xóa Nhạc')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(tracks.length === 0)
        );
    }

    if (row1.components.length > 0) {
        components.push(row1);
    }

    // Row 2: Additional actions (only for owner)
    if (isOwn) {
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_edit_${playlist.id}`)
                .setLabel('Sửa Playlist')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`playlist_shuffle_${playlist.id}`)
                .setLabel('Xáo Trộn')
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(tracks.length < 2),
            new ButtonBuilder()
                .setCustomId(`playlist_clone_${playlist.id}`)
                .setLabel('Nhân Bản')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary)
        );
        components.push(row2);
    } else {
        // Non-owner can clone public playlists
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_clone_${playlist.id}`)
                .setLabel('Lưu Bản Sao')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary)
        );
        components.push(row2);
    }

    await interaction.editReply({ embeds: [embed], components });
    logger.command('playlist-search-modal', interaction.user.id, interaction.guildId);
}

/**
 * Handle autocomplete for playlist search
 */
export async function handlePlaylistAutocomplete(interaction) {
    // logger.debug(`Autocomplete requested: ${interaction.commandName}`); // excessive logging

    try {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'name') {
            const query = focusedOption.value.toLowerCase();

            // Get user's own playlists
            const userPlaylists = Playlist.getByOwner(interaction.user.id, interaction.guildId);

            // Get public playlists in the guild (from other users/bot)
            const publicPlaylists = Playlist.getPublic(interaction.guildId);

            // Combine and deduplicate (user's own playlists take priority)
            const userPlaylistNames = new Set(userPlaylists.map(p => p.name));
            const combinedPlaylists = [
                ...userPlaylists,
                ...publicPlaylists.filter(p => !userPlaylistNames.has(p.name))
            ];

            // Filter by search query
            const filtered = combinedPlaylists.filter(p => p.name.toLowerCase().includes(query));

            // Create choices with indicator for public vs own playlists
            const choices = filtered.slice(0, 25).map(p => {
                const isOwn = p.owner_id === interaction.user.id;
                const prefix = isOwn ? '📁' : '🌐';
                return {
                    name: `${prefix} ${p.name} (${p.track_count || 0} bài hát)`,
                    value: p.name
                };
            });

            await interaction.respond(choices);
        }
    } catch (error) {
        if (error.code === 10062) return;
        logger.error(`Error handling playlist autocomplete for ${interaction.commandName}`, error);
        await interaction.respond([]).catch(() => {});
    }
}
