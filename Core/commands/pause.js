import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Tạm dừng phát nhạc'),
    
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
            logger.error('Pause command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi tạm dừng nhạc!', client.config)],
                ephemeral: true
            });
        }
    }
};
