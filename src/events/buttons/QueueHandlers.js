/**
 * Queue Management Button Handlers
 * Handles: Show Queue, Pagination, Remove Track (interactive & modal)
 */

import { createQueueEmbed, createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { createQueueButtons } from '../../UI/components/MusicControls.js';
import logger from '../../utils/logger.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export async function handleShowQueue(interaction, queue, client) {
    if (!queue || !queue.current) {
        return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
    }

    const page = 1;
    const totalPages = Math.max(1, Math.ceil(queue.tracks.length / 10));

    await interaction.reply({
        embeds: [createQueueEmbed(queue, client.config, page)],
        components: createQueueButtons(page, totalPages, queue),
        ephemeral: false
    });
}

export async function handleQueueButton(interaction, queue, client) {
    const customId = interaction.customId;

    if (!queue || !queue.current) {
        return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
    }

    // Extract current page from customId (format: queue_action_pageNumber)
    const pageMatch = customId.match(/_(\d+)$/);
    let page = pageMatch ? parseInt(pageMatch[1]) : 1;

    // Re-compute total pages from current queue state (not stale data)
    const freshTotalPages = Math.max(1, Math.ceil(queue.tracks.length / 10));
    // Clamp current page to valid range (queue may have shrunk)
    page = Math.min(page, freshTotalPages);

    if (customId.startsWith('queue_first')) {
        page = 1;
    } else if (customId.startsWith('queue_previous')) {
        page = Math.max(1, page - 1);
    } else if (customId.startsWith('queue_refresh')) {
        // page stays as is (already clamped)
    } else if (customId.startsWith('queue_next')) {
        page = Math.min(freshTotalPages, page + 1);
    } else if (customId.startsWith('queue_last')) {
        page = freshTotalPages;
    }

    try {
        await interaction.update({
            embeds: [createQueueEmbed(queue, client.config, page)],
            components: createQueueButtons(page, freshTotalPages, queue)
        });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Queue button update error', error);
    }
}

export async function handleRemoveQueueTrack(interaction, queue, client) {
    if (!queue) {
        return sendErrorResponse(interaction, new Error('Không có hàng đợi nào!'), client.config, true);
    }

    const queuedTracks = queue.tracks?.length || 0;

    if (queuedTracks === 0) {
        return sendErrorResponse(
            interaction,
            new Error(
                'Không có bài nào trong hàng đợi để xóa!\n\n*Bài đang phát không thể xóa, hãy dùng /skip hoặc /stop*'
            ),
            client.config,
            true
        );
    }

    const modal = new ModalBuilder().setCustomId('queue_remove_track_modal').setTitle('Xóa Bài Nhạc Khỏi Hàng Đợi');

    const trackInput = new TextInputBuilder()
        .setCustomId('track_identifier')
        .setLabel(`Vị trí bài muốn xóa (1-${queuedTracks})`)
        .setPlaceholder(`Nhập số từ 1 đến ${queuedTracks} hoặc một phần tên bài hát`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

    const actionRow = new ActionRowBuilder().addComponents(trackInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

export async function handleQueueRemoveTrackModalSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue) {
        return sendErrorResponse(interaction, new Error('Không có hàng đợi nào!'), client.config);
    }

    const trackIdentifier = interaction.fields.getTextInputValue('track_identifier').trim();

    if (!trackIdentifier) {
        return sendErrorResponse(interaction, new Error('Vui lòng nhập tên hoặc số thứ tự bài nhạc!'), client.config);
    }

    const queuedTracks = queue.tracks || [];

    if (queuedTracks.length === 0) {
        return sendErrorResponse(
            interaction,
            new Error(
                'Không có bài nào trong hàng đợi để xóa!\n\n*Bài đang phát không thể xóa, hãy dùng /skip hoặc /stop*'
            ),
            client.config
        );
    }

    let trackToRemove = null;
    let removePosition = -1;

    const position = parseInt(trackIdentifier);
    if (!isNaN(position)) {
        if (position < 1 || position > queuedTracks.length) {
            return sendErrorResponse(
                interaction,
                new Error(
                    `Vị trí không hợp lệ!\n\nHàng đợi có **${queuedTracks.length}** bài (nhập số từ 1 đến ${queuedTracks.length})`
                ),
                client.config
            );
        }

        trackToRemove = queuedTracks[position - 1]; // Convert to 0-indexed
        removePosition = position - 1;
    } else {
        const searchTerm = trackIdentifier.toLowerCase();
        const foundIndex = queuedTracks.findIndex(t => t.info.title.toLowerCase().includes(searchTerm));

        if (foundIndex === -1) {
            const availableTracks = queuedTracks
                .slice(0, 5)
                .map((t, i) => `${i + 1}. ${t.info.title.substring(0, 40)}${t.info.title.length > 40 ? '...' : ''}`)
                .join('\n');

            return sendErrorResponse(
                interaction,
                new Error(
                    `Không tìm thấy bài nhạc có tên "${trackIdentifier}" trong hàng đợi.\n\n**Các bài trong hàng đợi:**\n${availableTracks}${queuedTracks.length > 5 ? `\n...và ${queuedTracks.length - 5} bài khác` : ''}`
                ),
                client.config
            );
        }

        trackToRemove = queuedTracks[foundIndex];
        removePosition = foundIndex;
    }

    try {
        queue.remove(removePosition);

        const remainingCount = queue.tracks?.length || 0;

        const embed = createSuccessEmbed(
            '✅ Đã Xóa Bài Nhạc',
            `**${trackToRemove.info.title}**\n└ 🎤 ${trackToRemove.info.author}\n\nĐã xóa khỏi hàng đợi thành công!`,
            client.config
        );

        embed
            .setFooter({
                text: `${client.config?.bot?.footer || 'Miyao Music Bot'} • Còn ${remainingCount} bài trong hàng đợi`
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        logger.command('queue-remove-track-modal', interaction.user.id, interaction.guildId);
    } catch (error) {
        logger.error('Failed to remove track from queue', error);
        await sendErrorResponse(interaction, error, client.config);
    }
}
