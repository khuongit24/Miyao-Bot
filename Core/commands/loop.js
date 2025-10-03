import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Đặt chế độ lặp lại')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Chế độ lặp lại')
                .setRequired(true)
                .addChoices(
                    { name: 'Tắt', value: 'off' },
                    { name: 'Bài hát hiện tại', value: 'track' },
                    { name: 'Toàn bộ hàng đợi', value: 'queue' }
                )
        ),
    
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
            
            const mode = interaction.options.getString('mode');
            
            // Set loop mode
            await queue.setLoop(mode);
            
            const modeText = {
                'off': 'Tắt',
                'track': 'Bài hát hiện tại',
                'queue': 'Toàn bộ hàng đợi'
            };
            
            await interaction.reply({
                embeds: [createSuccessEmbed('Chế độ lặp', `Đã đặt chế độ lặp thành **${modeText[mode]}**`, client.config)]
            });
            
            logger.command('loop', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Loop command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi đặt chế độ lặp!', client.config)],
                ephemeral: true
            });
        }
    }
};
