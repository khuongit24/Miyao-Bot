import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createInfoEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('clear').setDescription('Xóa toàn bộ hàng đợi'),

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
            const queue = requireQueue(client.musicManager, interaction.guildId);

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            // Check if queue has tracks
            if (queue.tracks.length === 0) {
                return interaction.editReply({
                    embeds: [createInfoEmbed('Hàng đợi trống', 'Hàng đợi đã trống rồi, không cần xóa.', client.config)]
                });
            }

            const count = queue.tracks.length;

            // Clear queue
            queue.clear();

            await interaction.editReply({
                embeds: [createSuccessEmbed('Xóa hàng đợi', `Đã xóa **${count}** bài khỏi hàng đợi`, client.config)]
            });

            logger.command('clear', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
