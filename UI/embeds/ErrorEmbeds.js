/**
 * Error Embeds
 * User-friendly error messages with actionable suggestions
 */

import { EmbedBuilder } from 'discord.js';
import { 
    getErrorColor, 
    getErrorEmoji, 
    formatErrorForUser,
    MiyaoError 
} from '../../Core/utils/errors.js';

/**
 * Create error embed with suggestions
 * @param {Error} error - Error object
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} Error embed
 */
export function createErrorEmbed(error, config = null) {
    const formatted = formatErrorForUser(error);
    
    const embed = new EmbedBuilder()
        .setColor(formatted.color)
        .setTitle(formatted.title)
        .setDescription(formatted.description)
        .setTimestamp();

    // Add suggestions field if available
    if (formatted.suggestions && formatted.suggestions.length > 0) {
        const suggestionsText = formatted.suggestions
            .map((suggestion, index) => `${index + 1}. ${suggestion}`)
            .join('\n');
        
        embed.addFields([{
            name: '💡 Gợi ý khắc phục',
            value: suggestionsText,
            inline: false
        }]);
    }

    // Add error code in footer
    if (config?.bot?.footer) {
        embed.setFooter({ 
            text: `${config.bot.footer} | Error: ${formatted.severity.toUpperCase()}` 
        });
    } else {
        embed.setFooter({ 
            text: `Error Code: ${error.code || 'UNKNOWN'} | ${formatted.severity.toUpperCase()}` 
        });
    }

    return embed;
}

/**
 * Create network error embed
 */
export function createNetworkErrorEmbed(message, config) {
    return new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🌐 Lỗi Kết Nối')
        .setDescription(message)
        .addFields([
            {
                name: '💡 Gợi ý',
                value: '• Kiểm tra kết nối internet\n• Thử lại sau vài giây\n• Liên hệ admin nếu lỗi tiếp diễn',
                inline: false
            }
        ])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create permission error embed
 */
export function createPermissionErrorEmbed(message, requiredPermissions = [], config) {
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚠️ Thiếu Quyền')
        .setDescription(message)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();

    if (requiredPermissions.length > 0) {
        embed.addFields([
            {
                name: '🔑 Quyền yêu cầu',
                value: requiredPermissions.map(p => `• ${p}`).join('\n'),
                inline: false
            },
            {
                name: '💡 Gợi ý',
                value: '• Kiểm tra quyền của bạn\n• Yêu cầu admin cấp quyền\n• Xem /help để biết quyền cần thiết',
                inline: false
            }
        ]);
    }

    return embed;
}

/**
 * Create validation error embed
 */
export function createValidationErrorEmbed(message, examples = [], config) {
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚠️ Dữ Liệu Không Hợp Lệ')
        .setDescription(message)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();

    if (examples.length > 0) {
        embed.addFields([{
            name: '📝 Ví dụ đúng',
            value: examples.map(ex => `• ${ex}`).join('\n'),
            inline: false
        }]);
    }

    embed.addFields([{
        name: '💡 Gợi ý',
        value: '• Kiểm tra lại input\n• Xem /help <command> để biết cú pháp\n• Thử với giá trị khác',
        inline: false
    }]);

    return embed;
}

/**
 * Create "not found" error embed
 */
export function createNotFoundEmbed(resourceType, identifier, suggestions = [], config) {
    return new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('ℹ️ Không Tìm Thấy')
        .setDescription(`Không tìm thấy ${resourceType}: **${identifier}**`)
        .addFields([{
            name: '💡 Gợi ý',
            value: suggestions.length > 0 
                ? suggestions.map(s => `• ${s}`).join('\n')
                : '• Kiểm tra lại tên/ID\n• Xem danh sách có sẵn\n• Thử với từ khóa khác',
            inline: false
        }])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create search error embed with suggestions
 */
export function createSearchErrorEmbed(query, config) {
    return new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🔍 Không Tìm Thấy Kết Quả')
        .setDescription(`Không tìm thấy kết quả cho: **${query}**`)
        .addFields([
            {
                name: '💡 Thử những cách sau',
                value: 
                    '1. Kiểm tra chính tả\n' +
                    '2. Thử với từ khóa khác\n' +
                    '3. Sử dụng tên đầy đủ của bài hát\n' +
                    '4. Thêm tên nghệ sĩ vào tìm kiếm\n' +
                    '5. Sử dụng URL trực tiếp từ YouTube/Spotify',
                inline: false
            },
            {
                name: '📌 Ví dụ tìm kiếm tốt',
                value:
                    '• `APT Rose Bruno Mars`\n' +
                    '• `Có chắc yêu là đây Sơn Tùng`\n' +
                    '• `https://youtu.be/...`',
                inline: false
            }
        ])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create queue error embed
 */
export function createQueueErrorEmbed(message, action = null, config) {
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('ℹ️ Hàng Đợi')
        .setDescription(message)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();

    if (action) {
        embed.addFields([{
            name: '💡 Hành động tiếp theo',
            value: action,
            inline: false
        }]);
    }

    return embed;
}

/**
 * Create player error embed
 */
export function createPlayerErrorEmbed(message, config) {
    return new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('❌ Lỗi Phát Nhạc')
        .setDescription(message)
        .addFields([{
            name: '💡 Thử những cách sau',
            value:
                '1. Dừng và phát lại: `/stop` rồi `/play`\n' +
                '2. Kiểm tra xem bot còn trong voice channel không\n' +
                '3. Thử với bài hát khác\n' +
                '4. Nếu lỗi tiếp diễn, có thể là lỗi Lavalink',
            inline: false
        }])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create critical error embed
 */
export function createCriticalErrorEmbed(message, errorCode, config) {
    return new EmbedBuilder()
        .setColor('#c0392b')
        .setTitle('🚨 Lỗi Nghiêm Trọng')
        .setDescription(message)
        .addFields([
            {
                name: '⚠️ Yêu cầu hành động',
                value: 'Vui lòng liên hệ admin và cung cấp thông tin sau:',
                inline: false
            },
            {
                name: '🔖 Mã lỗi',
                value: `\`${errorCode}\``,
                inline: true
            },
            {
                name: '🕐 Thời gian',
                value: new Date().toLocaleString('vi-VN'),
                inline: true
            }
        ])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create rate limit embed
 */
export function createRateLimitEmbed(retryAfter, config) {
    const minutes = Math.floor(retryAfter / 60);
    const seconds = retryAfter % 60;
    const timeString = minutes > 0 
        ? `${minutes} phút ${seconds} giây`
        : `${seconds} giây`;

    return new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⏱️ Giới Hạn Tốc Độ')
        .setDescription(`Bạn đang sử dụng lệnh quá nhanh!`)
        .addFields([
            {
                name: '⏳ Thử lại sau',
                value: timeString,
                inline: true
            },
            {
                name: '💡 Lưu ý',
                value: 'Tránh spam lệnh để giữ bot hoạt động tốt cho mọi người',
                inline: false
            }
        ])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create maintenance embed
 */
export function createMaintenanceEmbed(estimatedTime, config) {
    return new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🔧 Bảo Trì')
        .setDescription('Bot đang trong quá trình bảo trì')
        .addFields([
            {
                name: '⏱️ Thời gian dự kiến',
                value: estimatedTime || 'Chưa xác định',
                inline: true
            },
            {
                name: '💡 Thông tin',
                value: 'Vui lòng thử lại sau. Xin lỗi vì sự bất tiện!',
                inline: false
            }
        ])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Quick error response helper
 * @param {Interaction} interaction - Discord interaction
 * @param {Error} error - Error object
 * @param {Object} config - Bot configuration
 * @param {boolean} ephemeral - Whether to send as ephemeral
 */
export async function sendErrorResponse(interaction, error, config, ephemeral = false) {
    const embed = createErrorEmbed(error, config);
    
    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.editReply({ 
                embeds: [embed],
                components: [] // Clear any components
            });
        } else {
            return await interaction.reply({ 
                embeds: [embed], 
                ephemeral,
                components: []
            });
        }
    } catch (replyError) {
        // If we can't reply, try to log it
        console.error('Failed to send error response:', replyError);
        return null;
    }
}

export default {
    createErrorEmbed,
    createNetworkErrorEmbed,
    createPermissionErrorEmbed,
    createValidationErrorEmbed,
    createNotFoundEmbed,
    createSearchErrorEmbed,
    createQueueErrorEmbed,
    createPlayerErrorEmbed,
    createCriticalErrorEmbed,
    createRateLimitEmbed,
    createMaintenanceEmbed,
    sendErrorResponse
};
