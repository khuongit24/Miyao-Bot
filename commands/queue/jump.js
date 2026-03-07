import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueueTracks, validateQueuePosition } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Nhảy tới một bài cụ thể trong hàng đợi và phát ngay')
        .addIntegerOption(option =>
            option
                .setName('position')
                .setDescription('Vị trí bài trong hàng đợi (bắt đầu từ 1)')
                .setMinValue(1)
                .setRequired(true)
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

            // Validate position
            // validateQueuePosition throws InvalidPositionError
            validateQueuePosition(queue, position, 'jump to track');

            const trackToJump = queue.tracks[position - 1];

            // Jump
            // jump method implementation varies. usually it acts like skip to pos.
            const ok = await queue.jump(position);

            if (!ok) {
                throw new Error(`Không thể nhảy tới vị trí ${position}!`);
            }

            const trackTitle = trackToJump?.info?.title || 'Unknown Track';
            await interaction.editReply({
                embeds: [
                    createSuccessEmbed(
                        'Đã nhảy tới bài',
                        `Đang phát **${trackTitle}** (vị trí #${position}).`,
                        client.config
                    )
                ]
            });

            logger.command('jump', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
