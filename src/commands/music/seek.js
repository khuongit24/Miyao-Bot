import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { parseTime } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Tua đến thời điểm cụ thể')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Thời điểm (MM:SS hoặc HH:MM:SS)')
                .setRequired(true)
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
            if (queue.current.info.isStream) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không thể tua livestream!', client.config)],
                    ephemeral: true
                });
            }
            
            const timeString = interaction.options.getString('time');
            const position = parseTime(timeString);
            
            if (position === 0 || position > queue.current.info.length) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Thời điểm không hợp lệ!', client.config)],
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
