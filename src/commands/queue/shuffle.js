import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('shuffle').setDescription('Xáo trộn hàng đợi'),

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
            if (queue.tracks.length < 2) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Cần ít nhất 2 bài trong hàng đợi để xáo trộn!', client.config)],
                    ephemeral: true
                });
            }

            // Shuffle
            queue.shuffle();

            await interaction.reply({
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
            logger.error('Shuffle command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi xáo trộn hàng đợi!', client.config)],
                ephemeral: true
            });
        }
    }
};
