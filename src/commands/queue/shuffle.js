import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createWarningEmbed, sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('shuffle').setDescription('Xáo trộn hàng đợi'),

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
            // queue.tracks is the UPCOMING tracks.
            // If length < 2, minimal effect, but user might want to shuffle anyway?
            // shuffle.js logic: returns error if < 2.
            if (queue.tracks.length < 2) {
                return interaction.editReply({
                    embeds: [createWarningEmbed('Cần ít nhất 2 bài trong hàng đợi để xáo trộn!', client.config)]
                });
            }

            // Shuffle
            queue.shuffle();

            await interaction.editReply({
                embeds: [
                    createSuccessEmbed(
                        'Xáo trộn',
                        `Đã xáo trộn **${queue.tracks.length}** bài trong hàng đợi`,
                        client.config
                    )
                ]
            });

            logger.command('shuffle', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
