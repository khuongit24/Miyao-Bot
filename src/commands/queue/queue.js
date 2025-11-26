import { SlashCommandBuilder } from 'discord.js';
import { createQueueEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createQueueButtons } from '../../UI/components/MusicControls.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Xem danh sách hàng đợi')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Số trang')
                .setMinValue(1)
                .setRequired(false)
        ),
    
    async execute(interaction, client) {
        try {
            const queue = client.musicManager.getQueue(interaction.guildId);
            
            // Check if there's a queue
            if (!queue || !queue.current) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
                    ephemeral: true
                });
            }
            
            const page = interaction.options.getInteger('page') || 1;
            const totalPages = Math.ceil((queue.tracks.length + 1) / 10);
            
            if (page > totalPages) {
                return interaction.reply({
                    embeds: [createErrorEmbed(`Trang không hợp lệ! Chỉ có ${totalPages} trang. Hãy chọn số từ 1 đến ${totalPages}.`, client.config)],
                    ephemeral: true
                });
            }
            
            await interaction.reply({
                embeds: [createQueueEmbed(queue, client.config, page)],
                components: totalPages > 1 ? createQueueButtons(page, totalPages) : []
            });
            
            logger.command('queue', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Queue command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi hiển thị hàng đợi!', client.config)],
                ephemeral: true
            });
        }
    }
};
