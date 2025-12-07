/**
 * Autoplay Command
 * Enable/disable automatic playlist continuation with smart recommendations
 * @version 1.8.1 - Improved UI and feedback
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import UserPreferences from '../../database/models/UserPreferences.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { NothingPlayingError, DifferentVoiceChannelError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Bật/tắt tự động phát nhạc liên quan khi hết queue')
        .addBooleanOption(option =>
            option.setName('enabled').setDescription('Bật (true) hoặc tắt (false) autoplay').setRequired(false)
        ),

    async execute(interaction, client) {
        try {
            const queue = client.musicManager.getQueue(interaction.guildId);

            if (!queue) {
                throw new NothingPlayingError();
            }

            // Check voice channel
            const member = interaction.member;
            if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            // Get enabled option or toggle
            const enabled = interaction.options.getBoolean('enabled');
            const newState = enabled !== null ? enabled : !queue.autoplay;

            // Apply autoplay state
            queue.setAutoplay(newState);

            // Save preference
            UserPreferences.set(interaction.user.id, { autoResume: newState }, interaction.user.username);

            // Current track info for context
            const currentTrack = queue.current;
            const trackInfo = currentTrack ? `\n🎵 *Đang phát: ${currentTrack.info.title}*` : '';

            const embed = new EmbedBuilder()
                .setColor(newState ? '#00FF00' : '#FF6B6B')
                .setTitle(newState ? '✅ Autoplay Đã Bật' : '❌ Autoplay Đã Tắt')
                .setDescription(
                    newState
                        ? '**Bot sẽ tự động thêm nhạc khi hàng đợi kết thúc**\n\n' +
                              '🎯 Nhạc sẽ được gợi ý dựa trên:\n' +
                              '• Bài hát hiện tại\n' +
                              '• Nghệ sĩ đang nghe\n' +
                              `• Lịch sử nghe của bạn${trackInfo}`
                        : '**Bot sẽ dừng khi hết hàng đợi**\n\n' + `💡 Sử dụng \`/autoplay\` để bật lại${trackInfo}`
                )
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            logger.command('autoplay', interaction.user.id, interaction.guildId, {
                enabled: newState
            });
        } catch (error) {
            logger.error('Autoplay command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
