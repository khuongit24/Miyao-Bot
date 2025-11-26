import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError, NothingPlayingError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Tạm dừng phát nhạc'),
    
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
            
            // Check if already paused
            if (queue.paused) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Nhạc đã được tạm dừng rồi!', client.config)],
                    ephemeral: true
                });
            }
            
            // Pause
            await queue.pause();
            
            await interaction.reply({
                embeds: [createSuccessEmbed('Tạm dừng', 'Đã tạm dừng phát nhạc', client.config)]
            });
            
            logger.command('pause', interaction.user.id, interaction.guildId);
            
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
            
            logger.error('Pause command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi tạm dừng nhạc!', client.config)],
                ephemeral: true
            });
        }
    }
};
