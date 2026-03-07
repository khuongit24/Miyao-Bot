/**
 * Playlist Button Handlers
 * Handles: Add current track to playlist, Add queue to playlist
 */

import { createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export async function handleAddCurrentTrackToPlaylist(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có bài hát nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId('add_current_track_to_playlist_modal')
        .setTitle('Thêm bài hát vào playlist');

    const playlistNameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên playlist')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Nhập tên playlist...')
        .setRequired(true)
        .setMaxLength(100);

    const actionRow = new ActionRowBuilder().addComponents(playlistNameInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

export async function handleAddQueueToPlaylist(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    const totalTracks = (queue.current ? 1 : 0) + (queue.tracks?.length || 0);

    if (totalTracks === 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Hàng đợi trống!', client.config)],
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId('add_queue_to_playlist_modal')
        .setTitle(`Thêm ${totalTracks} bài vào playlist`);

    const playlistNameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên playlist')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Nhập tên playlist...')
        .setRequired(true)
        .setMaxLength(100);

    const actionRow = new ActionRowBuilder().addComponents(playlistNameInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}
