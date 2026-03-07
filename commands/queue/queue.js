import { SlashCommandBuilder } from 'discord.js';
import { createQueueEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse, createErrorEmbed } from '../../UI/embeds/ErrorEmbeds.js';
import { createQueueButtons } from '../../UI/components/MusicControls.js';
import { requireCurrentTrack } from '../../middleware/queueCheck.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Xem danh sách hàng đợi')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Xem trang cụ thể (mặc định: trang 1)')
                .setMinValue(1)
                .setRequired(false)
        ),

    async execute(interaction, client) {
        await interaction.deferReply();
        try {
            // Check resilience
            if (!isMusicSystemAvailable(client.musicManager)) {
                return sendErrorResponse(
                    interaction,
                    new Error(getDegradedModeMessage('nhạc').description),
                    client.config
                );
            }

            // Use middleware
            const { queue } = requireCurrentTrack(client.musicManager, interaction.guildId);

            const pageSize = 10;
            const requestedPage = interaction.options.getInteger('page') || 1;
            const totalPages = Math.max(1, Math.ceil(queue.tracks.length / pageSize));

            if (requestedPage > totalPages || requestedPage < 1) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `Trang không hợp lệ! Chỉ có ${totalPages} trang. Hãy chọn số từ 1 đến ${totalPages}.`,
                            client.config
                        )
                    ]
                });
            }

            // Clamp page to valid range as safety net
            const page = Math.min(Math.max(1, requestedPage), totalPages);

            await interaction.editReply({
                embeds: [createQueueEmbed(queue, client.config, page)],
                components: createQueueButtons(page, totalPages, queue)
            });

            logger.command('queue', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
