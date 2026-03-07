/**
 * Autoplay Command
 * Enable/disable automatic playlist continuation with smart recommendations
 * @version 1.9.0 - Standardized error handling
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/design-system.js';
import UserPreferences from '../../database/models/UserPreferences.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireQueue } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
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
            await interaction.deferReply();
            // Check resilience
            if (!isMusicSystemAvailable(client.musicManager)) {
                return sendErrorResponse(
                    interaction,
                    new Error(getDegradedModeMessage('nhạc').description),
                    client.config
                );
            }

            // Use middleware
            const queue = requireQueue(client.musicManager, interaction.guildId);

            // Check voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            // Get enabled option or toggle
            const enabled = interaction.options.getBoolean('enabled');
            const newState = enabled !== null ? enabled : !queue.autoplay;

            // Apply autoplay state
            queue.setAutoplay(newState);

            // When autoplay is enabled, cancel pending leave timer
            // and trigger related track addition if queue is empty
            if (newState) {
                queue.clearLeaveTimeout();
                if (!queue.current && queue.tracks.length === 0) {
                    // Queue is empty, try to add a related track
                    queue.addRelatedTrack().catch(error => {
                        logger.warn('Autoplay: failed to add related track on enable', { error: error.message });
                    });
                }
            }

            // Save preference
            UserPreferences.set(interaction.user.id, { autoResume: newState }, interaction.user.username);

            // Current track info for context
            const currentTrack = queue.current;
            const trackInfo = currentTrack ? `\n🎵 *Đang phát: ${currentTrack.info.title}*` : '';

            const embed = new EmbedBuilder()
                .setColor(newState ? COLORS.AUTOPLAY_ON : COLORS.AUTOPLAY_OFF)
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

            await interaction.editReply({ embeds: [embed] });

            logger.command('autoplay', interaction.user.id, interaction.guildId, {
                enabled: newState
            });
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
