/**
 * @file ErrorEmbeds.js
 * @description Standardized error embed builders using the design system
 * @version 1.9.0 — Unified colors, removed dead code, graceful expiry handling
 */

import { EmbedBuilder } from 'discord.js';
import { formatErrorForUser } from '../../utils/errors.js';
import { COLORS, ICONS } from '../../config/design-system.js';
import { safeAddFields } from './EmbedUtils.js';
import logger from '../../utils/logger.js';

/**
 * Create a standard error embed
 * @param {string} message - Error message to display
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder}
 */
export function createErrorEmbed(message, config) {
    const errorMessage = message ? String(message) : 'Đã xảy ra lỗi không xác định';

    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`${ICONS.ERROR} Lỗi`)
        .setDescription(errorMessage)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create a warning embed
 * @param {string} message - Warning message to display
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder}
 */
export function createWarningEmbed(message, config) {
    return new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`${ICONS.WARNING} Cảnh báo`)
        .setDescription(message)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Send a formatted error response to an interaction.
 * Handles replied, deferred, fresh, and EXPIRED interaction states gracefully.
 * @param {Object} interaction - Discord interaction
 * @param {Error} error - Error to handle
 * @param {Object} config - Bot configuration
 * @param {boolean} [ephemeral=true] - Whether to send ephemeral message
 */
export async function sendErrorResponse(interaction, error, config, ephemeral = true) {
    // BUG-082: Guard against missing interaction or channel
    if (!interaction) {
        logger.warn('sendErrorResponse called with null/undefined interaction', { error: error?.message });
        return;
    }

    try {
        const errorInfo = formatErrorForUser(error);

        const embed = new EmbedBuilder()
            .setColor(errorInfo.color || COLORS.ERROR)
            .setTitle(errorInfo.title || `${ICONS.ERROR} Lỗi`)
            .setDescription(errorInfo.description || 'Đã xảy ra lỗi không xác định')
            .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
            .setTimestamp();

        // Add suggestions if available
        if (errorInfo.suggestions?.length > 0) {
            const suggestionsText = errorInfo.suggestions.map(s => `• ${s}`).join('\n');
            safeAddFields(embed, [
                {
                    name: `${ICONS.TIP} Gợi ý`,
                    value: suggestionsText,
                    inline: false
                }
            ]);
        }

        const replyOptions = { embeds: [embed], ephemeral };

        if (interaction.replied) {
            await interaction.followUp(replyOptions);
        } else if (interaction.deferred) {
            await interaction.editReply(replyOptions);
        } else {
            await interaction.reply(replyOptions);
        }

        logger.warn('Error response sent', {
            errorCode: errorInfo.title,
            errorMessage: errorInfo.description,
            userId: interaction.user?.id,
            guildId: interaction.guildId
        });
    } catch (responseError) {
        // Handle expired / unknown interactions silently
        if (responseError.code === 10062 || responseError.code === 40060) {
            logger.debug('Interaction expired before error response could be sent', {
                originalError: error?.message,
                userId: interaction.user?.id
            });
            return;
        }
        logger.error('Failed to send error response', {
            originalError: error?.message,
            responseError: responseError.message
        });
    }
}

/**
 * Create an OAuth authentication error embed for YouTube playback failures
 * @param {string} trackTitle - Title of the track that failed
 * @returns {EmbedBuilder}
 */
export function createOAuthErrorEmbed(trackTitle) {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setDescription(
            `${ICONS.ERROR} **YouTube yêu cầu xác thực**\n\n` +
                `Không thể phát **${trackTitle}** và các bài hát tiếp theo.\n` +
                `YouTube yêu cầu xác thực OAuth để phát nhạc. ` +
                `Vui lòng kiểm tra cấu hình OAuth của Lavalink.\n\n` +
                `${ICONS.WARNING} Các bài hát còn lại sẽ bị bỏ qua cho đến khi OAuth được sửa.`
        );
}

export default {
    createErrorEmbed,
    createWarningEmbed,
    sendErrorResponse,
    createOAuthErrorEmbed
};
