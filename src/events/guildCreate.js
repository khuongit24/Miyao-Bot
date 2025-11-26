/**
 * @file guildCreate.js
 * @description Welcome message when bot joins a new guild
 * @version 1.6.0
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import logger from '../utils/logger.js';

export default {
    name: 'guildCreate',
    async execute(guild, client) {
        logger.info(`Bot joined new guild: ${guild.name} (${guild.id})`, {
            memberCount: guild.memberCount,
            ownerId: guild.ownerId
        });

        try {
            // Find the first text channel where bot can send messages
            const channel = await findWelcomeChannel(guild);
            
            if (!channel) {
                logger.warn(`Could not find suitable channel in guild ${guild.name}`, { guildId: guild.id });
                return;
            }

            // Create welcome embed
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color || '#00FF00')
                .setTitle('👋 Xin chào! Cảm ơn bạn đã thêm Miyao Bot')
                .setDescription(
                    `Miyao Bot là một music bot mạnh mẽ với nhiều tính năng:\n\n` +
                    `🎵 **Phát nhạc** - Phát nhạc từ YouTube, Spotify, SoundCloud\n` +
                    `📋 **Quản lý hàng đợi** - Thêm, xóa, sắp xếp bài hát dễ dàng\n` +
                    `🎚️ **Filters** - Bassboost, nightcore, và nhiều hiệu ứng khác\n` +
                    `💾 **Playlists** - Tạo và quản lý playlist cá nhân\n` +
                    `🔍 **Discovery** - Khám phá nhạc mới dựa trên lịch sử nghe\n` +
                    `📊 **Statistics** - Xem thống kê nghe nhạc của bạn\n` +
                    `🎯 **Autoplay** - Tự động phát nhạc liên tục\n\n` +
                    `**Bắt đầu ngay:**\n` +
                    `• Sử dụng \`/help\` để xem tất cả lệnh\n` +
                    `• Sử dụng \`/play <tên bài hát>\` để phát nhạc\n` +
                    `• Sử dụng \`/settings\` để cấu hình bot (chỉ Admin)`
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ 
                    text: `Miyao Bot v${client.config.bot.version || '1.6.0'} • Phát triển bởi ${client.config.bot.author || 'Miyao Team'}` 
                })
                .setTimestamp();

            // Create quick action buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('📚 Hướng dẫn')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://github.com/yourusername/miyao-bot/wiki') // Update with actual URL
                        .setEmoji('📚'),
                    new ButtonBuilder()
                        .setLabel('🆘 Support Server')
                        .setStyle(ButtonStyle.Link)
                        .setURL(client.config.bot.supportServer || 'https://discord.gg/yourinvite') // Update with actual URL
                        .setEmoji('🆘'),
                    new ButtonBuilder()
                        .setLabel('⭐ GitHub')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://github.com/yourusername/miyao-bot') // Update with actual URL
                        .setEmoji('⭐')
                );

            // Send welcome message
            await channel.send({ embeds: [embed], components: [row] });

            logger.info(`Welcome message sent to guild ${guild.name}`, { 
                guildId: guild.id,
                channelId: channel.id 
            });

        } catch (error) {
            logger.error(`Failed to send welcome message to guild ${guild.name}`, {
                guildId: guild.id,
                error: error.message,
                stack: error.stack
            });
        }
    }
};

/**
 * Find a suitable channel to send the welcome message
 * Priority: system channel > general channel > first text channel with permissions
 */
async function findWelcomeChannel(guild) {
    // Try system channel first
    if (guild.systemChannel && guild.systemChannel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        return guild.systemChannel;
    }

    // Try to find "general" channel
    const generalChannel = guild.channels.cache.find(channel =>
        channel.isTextBased() &&
        (channel.name.toLowerCase().includes('general') || channel.name.toLowerCase().includes('chat')) &&
        channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)
    );

    if (generalChannel) {
        return generalChannel;
    }

    // Find first text channel where bot can send messages
    const firstChannel = guild.channels.cache
        .filter(channel => channel.isTextBased())
        .sort((a, b) => a.position - b.position)
        .find(channel => channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));

    return firstChannel;
}
