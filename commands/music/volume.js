import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Điều chỉnh âm lượng')
        .addIntegerOption(option =>
            option
                .setName('level')
                .setDescription('Âm lượng từ 0 (tắt tiếng) đến 100 (tối đa)')
                .setMinValue(0)
                .setMaxValue(100)
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
            const queue = requireQueue(client.musicManager, interaction.guildId);

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            const volume = interaction.options.getInteger('level');

            // BUG-C18: Defensive validation harmonized with queue's 0-100 clamp
            if (volume < 0 || volume > 100) {
                return interaction.editReply({
                    embeds: [createSuccessEmbed('Âm lượng', 'Âm lượng phải trong khoảng **0-100%**', client.config)]
                });
            }

            // Set volume
            await queue.setVolume(volume);

            await interaction.editReply({
                embeds: [createSuccessEmbed('Âm lượng', `Đã đặt âm lượng thành **${volume}%**`, client.config)]
            });

            logger.command('volume', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
