import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('stop').setDescription('Dừng phát nhạc, xóa hàng đợi và rời kênh thoại'),

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

            // Use middleware for common checks
            const queue = requireQueue(client.musicManager, interaction.guildId);

            // Check if user is in voice channel and same as bot
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            // Stop
            await queue.stop();

            await interaction.editReply({
                embeds: [createSuccessEmbed('Dừng phát', 'Đã dừng phát nhạc và xóa hàng đợi', client.config)]
            });

            logger.command('stop', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
