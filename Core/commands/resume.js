import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Tiếp tục phát nhạc'),
    
    async execute(interaction, client) {
        try {
            const queue = client.musicManager.getQueue(interaction.guildId);
            
            // Check if there's a queue
            if (!queue) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
                    ephemeral: true
                });
            }
            
            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannelId) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Bạn phải ở trong cùng voice channel với bot!', client.config)],
                    ephemeral: true
                });
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
            logger.error('Resume command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi tiếp tục phát nhạc!', client.config)],
                ephemeral: true
            });
        }
    }
};
