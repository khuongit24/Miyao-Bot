import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Xóa toàn bộ hàng đợi'),
    
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
            
            // Check if queue has tracks
            if (queue.tracks.length === 0) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Hàng đợi đã trống rồi!', client.config)],
                    ephemeral: true
                });
            }
            
            const count = queue.tracks.length;
            
            // Clear queue
            queue.clear();
            
            await interaction.reply({
                embeds: [createSuccessEmbed('Xóa hàng đợi', `Đã xóa **${count}** bài khỏi hàng đợi`, client.config)]
            });
            
            logger.command('clear', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Clear command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi xóa hàng đợi!', client.config)],
                ephemeral: true
            });
        }
    }
};
