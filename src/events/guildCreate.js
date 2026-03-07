/**
 * @file guildCreate.js
 * @description Welcome message when bot joins a new guild
 * @version 1.6.0
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { COLORS } from '../config/design-system.js';
import logger from '../utils/logger.js';

export default {
    name: 'guildCreate',
    async execute(guild, client) {
        // Skip unavailable guilds (e.g. during outage)
        if (!guild.available) return;

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
                .setColor(COLORS.PRIMARY)
                .setTitle('👋 Xin chào! Cảm ơn bạn đã thêm Miyao Bot')
                .setDescription(
                    'Miyao Bot là một music bot mạnh mẽ với nhiều tính năng:\n\n' +
                        '🎵 **Phát nhạc** - Phát nhạc từ YouTube, Spotify, SoundCloud\n' +
                        '📋 **Quản lý hàng đợi** - Thêm, xóa, sắp xếp bài hát dễ dàng\n' +
                        '🎚️ **Filters** - Bassboost, nightcore, và nhiều hiệu ứng khác\n' +
                        '💾 **Playlists** - Tạo và quản lý playlist cá nhân\n' +
                        '🔍 **Discovery** - Khám phá nhạc mới dựa trên lịch sử nghe\n' +
                        '📊 **Statistics** - Xem thống kê nghe nhạc của bạn\n' +
                        '🎯 **Autoplay** - Tự động phát nhạc liên tục\n\n' +
                        '━━━━━━━━━━━━━━━━━━━━━━\n' +
                        '⚡ **Bắt đầu nhanh (3 bước):**\n\n' +
                        '**1.** Vào một kênh thoại (voice channel)\n' +
                        '**2.** Gõ `/play <tên bài hát hoặc URL>`\n' +
                        '**3.** Thưởng thức! Dùng `/help` để khám phá thêm\n\n' +
                        '🔧 *Admin có thể dùng `/settings` để cấu hình bot.*'
                )
                .setThumbnail(client.user.displayAvatarURL())
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            // Create quick action buttons
            const buttons = [
                new ButtonBuilder()
                    .setLabel('Hướng dẫn')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://github.com/khuongit24/Miyao-Bot')
                    .setEmoji('📚'),
                new ButtonBuilder()
                    .setLabel('GitHub')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://github.com/khuongit24/Miyao-Bot')
                    .setEmoji('⭐'),
                new ButtonBuilder()
                    .setLabel('Báo lỗi')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://github.com/khuongit24/Miyao-Bot/issues')
                    .setEmoji('🐛')
            ];

            // Only add support server button if a real invite URL is configured
            if (client.config.bot.supportServer) {
                buttons.splice(
                    1,
                    0,
                    new ButtonBuilder()
                        .setLabel('Support Server')
                        .setStyle(ButtonStyle.Link)
                        .setURL(client.config.bot.supportServer)
                        .setEmoji('🆘')
                );
            }

            const row = new ActionRowBuilder().addComponents(...buttons);

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
    const me = guild.members.me;
    if (!me) {
        // Bot member not cached yet — cannot check permissions
        return null;
    }

    // Try system channel first
    if (guild.systemChannel && guild.systemChannel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
        return guild.systemChannel;
    }

    // Try to find common welcome/general channel names
    const commonNames = ['general', 'chat', 'welcome', 'lobby', 'main', 'bot', 'commands', 'bot-commands'];
    const generalChannel = guild.channels.cache.find(
        channel =>
            channel.isTextBased() &&
            commonNames.some(name => channel.name.toLowerCase().includes(name)) &&
            channel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)
    );

    if (generalChannel) {
        return generalChannel;
    }

    // Find first text channel where bot can send messages
    const firstChannel = guild.channels.cache
        .filter(channel => channel.isTextBased())
        .sort((a, b) => a.position - b.position)
        .find(channel => channel.permissionsFor(me).has(PermissionFlagsBits.SendMessages));

    return firstChannel;
}
