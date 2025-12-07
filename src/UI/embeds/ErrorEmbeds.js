import { EmbedBuilder } from 'discord.js';
import { MiyaoError, getErrorColor, getErrorEmoji, formatErrorForUser } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

/**
 * Create a standard error embed
 * @param {string} message - Error message to display
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} Discord embed
 */
export function createErrorEmbed(message, config) {
    const errorMessage = message ? String(message) : 'Đã xảy ra lỗi không xác định';

    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Lỗi')
        .setDescription(errorMessage)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create a warning embed
 * @param {string} message - Warning message to display
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} Discord embed
 */
export function createWarningEmbed(message, config) {
    return new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Cảnh báo')
        .setDescription(message)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create a permission error embed
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} Discord embed
 */
export function createPermissionErrorEmbed(config) {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔒 Không có quyền')
        .setDescription('Bạn không có quyền sử dụng lệnh này.')
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create a voice channel required embed
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} Discord embed
 */
export function createVoiceChannelRequiredEmbed(config) {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎤 Yêu cầu kênh thoại')
        .setDescription('Bạn cần tham gia kênh thoại để sử dụng lệnh này.')
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create a bot not in voice channel embed
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} Discord embed
 */
export function createBotNotInVoiceEmbed(config) {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🤖 Bot không ở trong kênh thoại')
        .setDescription('Bot hiện không ở trong kênh thoại nào.')
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create a same voice channel required embed
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} Discord embed
 */
export function createSameVoiceChannelRequiredEmbed(config) {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎤 Khác kênh thoại')
        .setDescription('Bạn cần ở cùng kênh thoại với bot để sử dụng lệnh này.')
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Send a formatted error response to an interaction
 * @param {Object} interaction - Discord interaction
 * @param {Error} error - Error to handle
 * @param {Object} config - Bot configuration
 * @param {boolean} ephemeral - Whether to send ephemeral message (default: false)
 */
export async function sendErrorResponse(interaction, error, config, ephemeral = false) {
    try {
        // Format the error for user
        const errorInfo = formatErrorForUser(error);

        const embed = new EmbedBuilder()
            .setColor(errorInfo.color || '#FF0000')
            .setTitle(errorInfo.title || '❌ Lỗi')
            .setDescription(errorInfo.description || 'Đã xảy ra lỗi không xác định')
            .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
            .setTimestamp();

        // Add suggestions if available
        if (errorInfo.suggestions && errorInfo.suggestions.length > 0) {
            const suggestionsText = errorInfo.suggestions.map(s => `• ${s}`).join('\n');
            embed.addFields({
                name: '💡 Gợi ý',
                value: suggestionsText,
                inline: false
            });
        }

        // Determine how to respond based on interaction state
        const replyOptions = { embeds: [embed], ephemeral };

        if (interaction.replied) {
            await interaction.followUp(replyOptions);
        } else if (interaction.deferred) {
            await interaction.editReply(replyOptions);
        } else {
            await interaction.reply(replyOptions);
        }

        // Log the error
        logger.warn('Error response sent', {
            errorCode: errorInfo.title,
            errorMessage: errorInfo.description,
            userId: interaction.user?.id,
            guildId: interaction.guildId
        });
    } catch (responseError) {
        logger.error('Failed to send error response', {
            originalError: error?.message,
            responseError: responseError.message
        });
    }
}

export default {
    createErrorEmbed,
    createWarningEmbed,
    createPermissionErrorEmbed,
    createVoiceChannelRequiredEmbed,
    createBotNotInVoiceEmbed,
    createSameVoiceChannelRequiredEmbed,
    sendErrorResponse
};
