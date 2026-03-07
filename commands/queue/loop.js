import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Bật/tắt lặp lại bài hát hoặc toàn bộ hàng đợi')
        .addStringOption(option =>
            option
                .setName('mode')
                .setDescription('Chọn chế độ lặp')
                .setRequired(true)
                .addChoices(
                    { name: 'Tắt', value: 'off' },
                    { name: 'Bài hát hiện tại', value: 'track' },
                    { name: 'Toàn bộ hàng đợi', value: 'queue' }
                )
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

            const mode = interaction.options.getString('mode');

            // Set loop mode
            await queue.setLoop(mode);

            // Clear pending leave timeout when loop is enabled
            if (mode !== 'off') {
                queue.clearLeaveTimeout();
            }

            const modeText = {
                off: 'Tắt',
                track: 'Bài hát hiện tại',
                queue: 'Toàn bộ hàng đợi'
            };

            await interaction.editReply({
                embeds: [
                    createSuccessEmbed('Chế độ lặp', `Đã đặt chế độ lặp thành **${modeText[mode]}**`, client.config)
                ]
            });

            logger.command('loop', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
