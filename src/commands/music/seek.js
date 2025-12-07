import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { parseTime } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Tua đến thời điểm cụ thể')
        .addStringOption(option =>
            option.setName('time').setDescription('Thời điểm (MM:SS hoặc HH:MM:SS)').setRequired(true)
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

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannelId) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Bạn phải ở trong cùng voice channel với bot!', client.config)],
                    ephemeral: true
                });
            }

            // Check if track is seekable
            if (queue.current?.info?.isStream) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không thể tua livestream!', client.config)],
                    ephemeral: true
                });
            }

            const timeString = interaction.options.getString('time');
            const position = parseTime(timeString);

            // Validate time format: MM:SS or HH:MM:SS with proper bounds
            // Seconds: 00-59, Minutes: 00-59 (or any for hours format)
            const isValidFormat = /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/.test(timeString.trim());

            if (!isValidFormat) {
                return interaction.reply({
                    embeds: [
                        createErrorEmbed(
                            'Định dạng thời gian không hợp lệ! Sử dụng MM:SS hoặc HH:MM:SS\n*Ví dụ: 1:30, 02:45, 1:05:30*',
                            client.config
                        )
                    ],
                    ephemeral: true
                });
            }

            const trackLength = queue.current?.info?.length || 0;
            if (position < 0 || position > trackLength) {
                // Format duration nicely for user
                const totalSeconds = Math.floor(trackLength / 1000);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                return interaction.reply({
                    embeds: [
                        createErrorEmbed(
                            `Thời điểm không hợp lệ! Bài hát chỉ dài **${formattedDuration}**.`,
                            client.config
                        )
                    ],
                    ephemeral: true
                });
            }

            // Seek
            await queue.seek(position);

            await interaction.reply({
                embeds: [createSuccessEmbed('Tua nhạc', `Đã tua đến **${timeString}**`, client.config)]
            });

            logger.command('seek', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Seek command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi tua nhạc!', client.config)],
                ephemeral: true
            });
        }
    }
};
