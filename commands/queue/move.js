import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueueTracks, validateQueuePosition } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError, ValidationError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Di chuyển vị trí một bài trong hàng đợi')
        .addIntegerOption(option =>
            option
                .setName('from')
                .setDescription('Vị trí bài cần di chuyển (xem /queue)')
                .setMinValue(1)
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('to').setDescription('Vị trí đích muốn di chuyển đến').setMinValue(1).setRequired(true)
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

            const from = interaction.options.getInteger('from');
            const to = interaction.options.getInteger('to');

            // FIX-LB06: Validate from !== to position
            if (from === to) {
                throw new ValidationError('Vị trí nguồn và đích giống nhau! Vui lòng chọn 2 vị trí khác nhau.');
            }

            // Validate positions
            const fromIndex = validateQueuePosition(queue, from, 'move track');
            const toIndex = validateQueuePosition(queue, to, 'move destination');

            // Get track info before moving
            const trackToMove = queue.tracks[fromIndex];

            // Move track
            const ok = queue.move(fromIndex, toIndex);

            if (!ok) {
                throw new Error('Không thể di chuyển bài, vui lòng thử lại!');
            }

            const trackTitle = trackToMove?.info?.title || 'Unknown Track';
            await interaction.editReply({
                embeds: [
                    createSuccessEmbed(
                        'Đã di chuyển',
                        `Đã di chuyển **${trackTitle}** từ vị trí #${from} về vị trí #${to}.`,
                        client.config
                    )
                ]
            });

            logger.command('move', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
