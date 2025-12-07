import { SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed, createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Di chuyển vị trí một bài trong hàng đợi')
        .addIntegerOption(option =>
            option.setName('from').setDescription('Vị trí hiện tại (bắt đầu từ 1)').setMinValue(1).setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('to').setDescription('Vị trí mới (bắt đầu từ 1)').setMinValue(1).setRequired(true)
        ),

    async execute(interaction, client) {
        try {
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
            const from = interaction.options.getInteger('from');
            const to = interaction.options.getInteger('to');

            if (!queue || queue.tracks.length === 0) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không có hàng đợi hoặc hàng đợi trống!', client.config)],
                    ephemeral: true
                });
            }

            if (from < 1 || from > queue.tracks.length || to < 1 || to > queue.tracks.length) {
                return interaction.reply({
                    embeds: [
                        createErrorEmbed(`Vị trí không hợp lệ! Chọn từ 1 đến ${queue.tracks.length}.`, client.config)
                    ],
                    ephemeral: true
                });
            }

            // Get track info before moving
            const trackToMove = queue.tracks[from - 1];

            const ok = queue.move(from - 1, to - 1);
            if (!ok) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không thể di chuyển bài, vui lòng thử lại!', client.config)],
                    ephemeral: true
                });
            }

            const trackTitle = trackToMove?.info?.title || 'Unknown Track';
            await interaction.reply({
                embeds: [
                    createSuccessEmbed(
                        'Đã di chuyển',
                        `Đã di chuyển **${trackTitle}** từ vị trí #${from} về vị trí #${to}.`,
                        client.config
                    )
                ]
            });

            logger.command('move', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Move command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi di chuyển bài!', client.config)],
                ephemeral: true
            });
        }
    }
};
