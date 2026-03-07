/**
 * Playlist Management Handlers
 * Handles: Create, Edit, Delete playlists
 */

import { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import Playlist from '../../database/models/Playlist.js';
import { ValidationError, PlaylistNotFoundError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export async function showCreatePlaylistModal(interaction) {
    const modal = new ModalBuilder().setCustomId('playlist_create_submit').setTitle('Tạo Playlist Mới');

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

export async function handleCreatePlaylistSubmit(interaction, client) {
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
                value: 'Sử dụng `/playlist menu` để quản lý playlist của bạn!',
                inline: false
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-create-modal', interaction.user.id, interaction.guildId);
}

export async function showDeletePlaylistModal(interaction) {
    const modal = new ModalBuilder().setCustomId('playlist_delete_submit').setTitle('Xóa Playlist');

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

export async function handleDeletePlaylistSubmit(interaction, client) {
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
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-delete-modal', interaction.user.id, interaction.guildId);
}

export async function showEditPlaylistModal(interaction) {
    const playlistId = parseInt(interaction.customId.replace('playlist_edit_', ''));

    // Get current playlist info
    const playlist = Playlist.getById(playlistId);

    if (!playlist) {
        throw new PlaylistNotFoundError(`Playlist ID ${playlistId}`);
    }

    // Verify ownership
    if (playlist.owner_id !== interaction.user.id) {
        throw new ValidationError('Bạn không có quyền chỉnh sửa playlist này!', 'permission');
    }

    const modal = new ModalBuilder().setCustomId(`playlist_edit_submit_${playlistId}`).setTitle('Chỉnh Sửa Playlist');

    const nameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên Playlist')
        .setPlaceholder('Nhập tên playlist mới')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setValue(playlist.name);

    const descriptionInput = new TextInputBuilder()
        .setCustomId('playlist_description')
        .setLabel('Mô Tả (Không bắt buộc)')
        .setPlaceholder('Nhập mô tả cho playlist')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200)
        .setValue(playlist.description || '');

    const publicInput = new TextInputBuilder()
        .setCustomId('playlist_public')
        .setLabel('Công Khai? (yes/no)')
        .setPlaceholder('Nhập "yes" để công khai, "no" để riêng tư')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(3)
        .setValue(playlist.is_public ? 'yes' : 'no');

    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(descriptionInput);
    const row3 = new ActionRowBuilder().addComponents(publicInput);

    modal.addComponents(row1, row2, row3);

    await interaction.showModal(modal);
}

export async function handleEditPlaylistSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const playlistId = parseInt(interaction.customId.replace('playlist_edit_submit_', ''));
    const name = interaction.fields.getTextInputValue('playlist_name').trim();
    const description = interaction.fields.getTextInputValue('playlist_description')?.trim() || null;
    const publicInput = interaction.fields.getTextInputValue('playlist_public')?.trim().toLowerCase() || 'no';

    const isPublic = publicInput === 'yes' || publicInput === 'có' || publicInput === 'co';

    // Validate name
    if (name.length === 0) {
        throw new ValidationError('Tên playlist không được để trống', 'name');
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

    // Check if new name conflicts with existing playlist (if name changed)
    if (name !== playlist.name) {
        const existing = Playlist.getByName(name, interaction.user.id, interaction.guildId);
        if (existing) {
            throw new ValidationError(`Playlist "${name}" đã tồn tại`, 'name');
        }
    }

    // Update playlist
    const updated = Playlist.update(playlistId, interaction.user.id, {
        name,
        description,
        is_public: isPublic
    });

    if (!updated) {
        throw new Error('Không thể cập nhật playlist. Vui lòng thử lại sau.');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Playlist Đã Cập Nhật')
        .setDescription(`Playlist **${name}** đã được cập nhật thành công!`)
        .addFields([
            {
                name: '📋 Thông tin mới',
                value: `• **Tên:** ${name}\n• **Mô tả:** ${description || 'Không có'}\n• **Công khai:** ${isPublic ? 'Có' : 'Không'}`,
                inline: false
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    logger.command('playlist-edit-modal', interaction.user.id, interaction.guildId);
}
