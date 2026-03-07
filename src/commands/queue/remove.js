import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueueTracks, validateQueuePosition } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Xóa bài hát khỏi hàng đợi — dùng /queue để xem vị trí')
        .addIntegerOption(option =>
            option
                .setName('position')
                .setDescription('Vị trí bài trong hàng đợi (bắt đầu từ 1)')
                .setMinValue(1)
                .setRequired(true)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();
            // Check resilience
            if (!isMusicSystemAvailable(client.musicManager)) {
                return sendErrorResponse(
                    interaction,
                    new Error(getDegradedModeMessage('nhạc').description),
                    client.config
                );
            }

            // Use middleware
            const { queue } = requireQueueTracks(client.musicManager, interaction.guildId);

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            const position = interaction.options.getInteger('position');

            // BUG-C07: Re-validate position against current queue length before removing
            if (position < 1 || position > queue.tracks.length) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `Vị trí #${position} không hợp lệ! Hàng đợi hiện có ${queue.tracks.length} bài.\nDùng \`/queue\` để xem vị trí mới.`,
                            client.config
                        )
                    ]
                });
            }

            // Validate position
            const index = validateQueuePosition(queue, position, 'remove track');

            // Remove track
            const removed = queue.remove(index);

            // queue.remove returns the removed track or null/false
            if (!removed) {
                throw new Error('Không thể xóa bài này, vui lòng thử lại!');
            }

            const trackTitle = removed.info?.title || 'Unknown Track';
            await interaction.editReply({
                embeds: [
                    createSuccessEmbed(
                        'Đã xóa bài',
                        `Đã xóa **${trackTitle}** khỏi hàng đợi (vị trí #${position}).`,
                        client.config
                    )
                ]
            });

            logger.command('remove', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
