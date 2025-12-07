import { SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed, createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Xóa một bài khỏi hàng đợi theo vị trí')
        .addIntegerOption(option =>
            option
                .setName('position')
                .setDescription('Vị trí bài trong hàng đợi (bắt đầu từ 1)')
                .setMinValue(1)
                .setRequired(true)
        ),

    async execute(interaction, client) {
        try {
            // Voice checks
            const member = interaction.member;
            const voiceChannel = member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Bạn phải ở trong voice channel để dùng lệnh này!', client.config)],
                    ephemeral: true
                });
            }
            const queue = client.musicManager.getQueue(interaction.guildId);
            if (queue && queue.voiceChannelId !== voiceChannel.id) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Bạn phải ở cùng voice channel với bot!', client.config)],
                    ephemeral: true
                });
            }
            if (!queue || queue.tracks.length === 0) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Hàng đợi trống! Không có bài nào để xóa.', client.config)],
                    ephemeral: true
                });
            }

            const position = interaction.options.getInteger('position');

            if (position < 1 || position > queue.tracks.length) {
                return interaction.reply({
                    embeds: [
                        createErrorEmbed(`Vị trí không hợp lệ! Chọn từ 1 đến ${queue.tracks.length}.`, client.config)
                    ],
                    ephemeral: true
                });
            }

            const removed = queue.remove(position - 1);
            if (!removed) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không thể xóa bài này, vui lòng thử lại!', client.config)],
                    ephemeral: true
                });
            }

            const trackTitle = removed.info?.title || 'Unknown Track';
            await interaction.reply({
                embeds: [
                    createSuccessEmbed(
                        'Đã xóa bài',
                        `Đã xóa **${trackTitle}** khỏi hàng đợi (vị trí #${position}).`,
                        client.config
                    )
                ]
            });

            logger.command('remove', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Remove command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi xóa bài khỏi hàng đợi!', client.config)],
                ephemeral: true
            });
        }
    }
};
