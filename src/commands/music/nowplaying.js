import { SlashCommandBuilder } from 'discord.js';
import { createNowPlayingEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons } from '../../UI/components/MusicControls.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Xem thông tin bài hát đang phát'),
    
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
            
            const currentPosition = queue.player?.position || 0;
            
            const reply = await interaction.reply({
                embeds: [createNowPlayingEmbed(queue.current, queue, client.config, currentPosition)],
                components: createNowPlayingButtons(queue, false),
                fetchReply: true
            });
            
            // Update stored message for auto-updates
            queue.setNowPlayingMessage(reply);
            
            logger.command('nowplaying', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Nowplaying command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi hiển thị thông tin bài hát!', client.config)],
                ephemeral: true
            });
        }
    }
};
