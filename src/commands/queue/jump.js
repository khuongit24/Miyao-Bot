import { SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed, createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Nhảy tới một bài cụ thể trong hàng đợi và phát ngay')
        .addIntegerOption(option =>
            option
                .setName('position')
                .setDescription('Vị trí bài trong hàng đợi (bắt đầu từ 1)')
                .setMinValue(1)
                .setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const member = interaction.member;
            const voiceChannel = member.voice.channel;
            if (!voiceChannel) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Bạn phải ở trong voice channel để dùng lệnh này!', client.config)]
                });
            }
            const queue = client.musicManager.getQueue(interaction.guildId);
            if (queue && queue.voiceChannelId !== voiceChannel.id) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Bạn phải ở cùng voice channel với bot!', client.config)]
                });
            }
            const position = interaction.options.getInteger('position');

            if (!queue || queue.tracks.length === 0) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Hàng đợi trống! Không có bài nào để nhảy tới.', client.config)]
                });
            }

            if (position < 1 || position > queue.tracks.length) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `Vị trí không hợp lệ! Chọn từ 1 đến ${queue.tracks.length}.\n` +
                                `Hiện có ${queue.tracks.length} bài trong hàng đợi.`,
                            client.config
                        )
                    ]
                });
            }

            const trackToJump = queue.tracks[position - 1];
            const ok = await queue.jump(position);
            if (!ok) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(`Vị trí không hợp lệ! Chọn từ 1 đến ${queue.tracks.length}.`, client.config)
                    ]
                });
            }

            const trackTitle = trackToJump?.info?.title || 'Unknown Track';
            await interaction.editReply({
                embeds: [
                    createSuccessEmbed(
                        'Đã nhảy tới bài',
                        `Đang phát **${trackTitle}** (vị trí #${position}).`,
                        client.config
                    )
                ]
            });

            logger.command('jump', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Jump command error', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi nhảy tới bài!', client.config)]
            });
        }
    }
};
