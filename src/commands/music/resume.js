import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError, NothingPlayingError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('resume').setDescription('Tiếp tục phát nhạc'),

    async execute(interaction, client) {
        try {
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

            // Check if not paused
            if (!queue.paused) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Nhạc đang phát rồi!', client.config)],
                    ephemeral: true
                });
            }

            // Resume
            await queue.resume();

            await interaction.reply({
                embeds: [createSuccessEmbed('Tiếp tục', 'Đã tiếp tục phát nhạc', client.config)]
            });

            logger.command('resume', interaction.user.id, interaction.guildId);
        } catch (error) {
            // Handle middleware errors with user-friendly messages
            if (error instanceof NothingPlayingError) {
                return interaction.reply({
                    embeds: [createErrorEmbed(error.message, client.config)],
                    ephemeral: true
                });
            }
            if (error instanceof UserNotInVoiceError || error instanceof DifferentVoiceChannelError) {
                return interaction.reply({
                    embeds: [createErrorEmbed(error.message, client.config)],
                    ephemeral: true
                });
            }

            logger.error('Resume command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi tiếp tục phát nhạc!', client.config)],
                ephemeral: true
            });
        }
    }
};
