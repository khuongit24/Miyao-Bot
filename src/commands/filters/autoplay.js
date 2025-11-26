/**
 * Autoplay Command
 * Enable/disable automatic playlist continuation
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import UserPreferences from '../../database/models/UserPreferences.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { NothingPlayingError, DifferentVoiceChannelError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Bật/tắt tự động phát nhạc liên quan')
        .addBooleanOption(option =>
            option.setName('enabled')
                .setDescription('Bật hoặc tắt autoplay')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        try {
            const queue = client.musicManager.getQueue(interaction.guildId);

            // Check if there's a queue
            if (!queue) {
                throw new NothingPlayingError();
            }

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            // Get enabled option or toggle current state
            const enabled = interaction.options.getBoolean('enabled');
            const newState = enabled !== null ? enabled : !queue.autoplay;

            // Set autoplay state
            queue.setAutoplay(newState);

            // Also save to user preferences
            UserPreferences.set(
                interaction.user.id,
                { autoResume: newState },
                interaction.user.username
            );

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle(newState ? '✅ Autoplay Đã Bật' : '❌ Autoplay Đã Tắt')
                .setDescription(
                    newState
                        ? '**Bot sẽ tự động thêm nhạc liên quan khi hàng đợi kết thúc**\n\n' +
                          '💡 *Autoplay sử dụng tên bài hát và nghệ sĩ để tìm nhạc tương tự*'
                        : '**Bot sẽ dừng khi hết hàng đợi**\n\n' +
                          '💡 *Dùng `/autoplay` hoặc `/autoplay enabled:true` để bật lại*'
                )
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            logger.command('autoplay', interaction.user.id, interaction.guildId);

        } catch (error) {
            logger.error('Autoplay command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
