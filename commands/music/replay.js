import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireCurrentTrack } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('replay').setDescription('Phát lại bài hát hiện tại từ đầu'),

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

            // Use middleware — no separate voiceCheck needed (CMD-H03 fix)
            const { queue, current } = requireCurrentTrack(client.musicManager, interaction.guildId);

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            // Seek to the beginning to replay the current track
            await queue.player.seekTo(0);

            const title = current?.info?.title || 'Unknown Track';
            await interaction.editReply({
                embeds: [createSuccessEmbed('Phát lại', `Đang phát lại **${title}** từ đầu`, client.config)]
            });

            logger.command('replay', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
