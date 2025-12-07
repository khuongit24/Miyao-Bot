import { EmbedBuilder } from 'discord.js';
import { formatDuration, getProgressBar, truncate, getPlatformIcon } from '../../utils/helpers.js';
import {
    optimizeEmbedForMobile,
    splitEmbedDescription,
    formatDurationMobile,
    exceedsMobileLimits
} from '../../utils/mobile-optimization.js';
import logger from '../../utils/logger.js';

/**
 * Create now playing embed with dynamic progress
 */
export function createNowPlayingEmbed(track, queue, config, currentPosition = null) {
    // Validate track and info
    if (!track || !track.info) {
        return new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Lỗi')
            .setDescription('Không thể hiển thị thông tin bài hát')
            .setTimestamp();
    }

    const info = track.info;

    // Use provided position or get from player
    const progress = currentPosition !== null ? currentPosition : queue.player?.position || track.position || 0;
    const duration = info.length || 0;
    const progressBar = getProgressBar(progress, duration, 30); // Use 30-char progress bar for better visualization

    // Calculate percentage
    const percentage = duration > 0 ? Math.min(Math.round((progress / duration) * 100), 100) : 0;

    // Status indicator
    const statusEmoji = queue.paused ? '⏸️' : '▶️';
    const statusText = queue.paused ? 'Đã tạm dừng' : 'Đang phát';

    // Safe access with fallbacks
    const title = info.title || 'Unknown Track';
    const uri = info.uri || '#';
    const author = info.author || 'Unknown Artist';
    const isStream = info.isStream || false;
    // Handle requester as string ID, object with id property, or 'autoplay'
    const requesterId =
        typeof track.requester === 'string' ? track.requester : track.requester?.id || track.requesterId || 'Unknown';

    const embed = new EmbedBuilder()
        .setColor(queue.paused ? '#FFA500' : config.bot.color)
        .setTitle(`${statusEmoji} ${statusText}`)
        .setDescription(`**[${title}](${uri})**`)
        .addFields([
            {
                name: '👤 Tác giả',
                value: author,
                inline: true
            },
            {
                name: '⏱️ Thời lượng',
                value: isStream ? '🔴 LIVE' : formatDuration(duration),
                inline: true
            },
            {
                name: '📊 Âm lượng',
                value: `${queue.volume}%`,
                inline: true
            },
            {
                name: '🔁 Loop',
                value: queue.loop === 'off' ? 'Tắt' : queue.loop === 'track' ? '🔂 Bài hát' : '🔁 Hàng đợi',
                inline: true
            },
            {
                name: '📋 Trong hàng đợi',
                value: `${queue.tracks.length} bài`,
                inline: true
            },
            {
                name: '👥 Yêu cầu bởi',
                value: `<@${requesterId}>`,
                inline: true
            }
        ]);

    // Add progress bar for non-stream tracks
    if (!isStream) {
        // Dynamic progress icon based on percentage
        const progressIcon = percentage >= 75 ? '🏁' : percentage >= 50 ? '⏳' : percentage >= 25 ? '▶️' : '🎵';

        embed.addFields([
            {
                name: `${progressIcon} Tiến trình`,
                value: `\`${formatDuration(progress)}\` ${progressBar} \`${formatDuration(duration)}\`\n**${percentage}%** hoàn thành`,
                inline: false
            }
        ]);
    }

    if (track.info.artworkUrl) {
        embed.setThumbnail(track.info.artworkUrl);
    }

    embed.setFooter({ text: `${config.bot.footer}` }).setTimestamp();

    return embed;
}

/**
 * Create queue embed
 */
export function createQueueEmbed(queue, config, page = 1) {
    // Validate inputs with better error handling
    if (!queue) {
        throw new Error('Queue object is required');
    }
    if (!config?.bot) {
        throw new Error('Config object with bot property is required');
    }

    // Ensure tracks array exists (even if empty)
    const tracks = Array.isArray(queue.tracks) ? queue.tracks : [];

    const perPage = 10;
    const totalPages = Math.max(1, Math.ceil((tracks.length + 1) / perPage));
    const start = (page - 1) * perPage;
    const end = start + perPage;

    // Calculate total duration and ETA
    const totalDuration = tracks
        .filter(track => track && track.info && !track.info.isStream)
        .reduce((acc, track) => acc + (track.info.length || 0), 0);

    const currentLeft =
        queue.current && queue.current.info && !queue.current.info.isStream
            ? Math.max(queue.current.info.length - (queue.player?.position || 0), 0)
            : 0;
    const eta = currentLeft + totalDuration;

    const embed = new EmbedBuilder()
        .setColor(config.bot.color || '#5865F2')
        .setTitle('📋 Hàng đợi phát nhạc')
        .setFooter({
            text: `${config.bot.footer || 'Miyao Music Bot'} • Trang ${page}/${totalPages} • Còn ${tracks.length} bài`
        })
        .setTimestamp();

    // Current track - simplified
    if (queue.current && queue.current.info) {
        const current = queue.current;
        const info = current.info;

        try {
            const icon = getPlatformIcon(info.sourceName || 'unknown');
            const title = truncate(info.title || 'Unknown Track', 50);
            const uri = info.uri || '#';
            const isStream = info.isStream || false;
            const length = info.length || 0;
            const author = truncate(info.author || 'Unknown Artist', 25);
            const requesterId =
                typeof current.requester === 'string'
                    ? current.requester
                    : current.requester?.id || current.requesterId || 'Unknown';

            const fieldValue =
                `${icon} **[${title}](${uri})**\n` +
                `⏱️ ${isStream ? '🔴 LIVE' : formatDuration(length)} | 👤 ${author} | 📢 <@${requesterId}>`;

            if (fieldValue.length > 0 && fieldValue.length <= 1024) {
                embed.addFields([
                    {
                        name: '🎵 Đang phát',
                        value: fieldValue,
                        inline: false
                    }
                ]);
            }
        } catch (error) {
            logger.error('Error creating current track field:', error);
        }
    }

    // Queue tracks - simplified format
    if (tracks.length > 0) {
        try {
            const displayTracks = [queue.current, ...tracks].slice(start + 1, end + 1);

            const trackList = displayTracks
                .filter(track => track && track.info && track.info.title)
                .map((track, index) => {
                    try {
                        const position = start + index + 1;
                        const info = track.info;
                        const icon = getPlatformIcon(info.sourceName || 'unknown');
                        const title = truncate(info.title || 'Unknown Track', 45);
                        const isStream = info.isStream || false;
                        const length = info.length || 0;

                        return `**#${position}** ${icon} ${title} • ${isStream ? '🔴 LIVE' : formatDuration(length)}`;
                    } catch (error) {
                        logger.error('Error formatting track:', error);
                        return null;
                    }
                })
                .filter(track => track !== null)
                .join('\n');

            if (trackList && trackList.trim().length > 0 && trackList.length <= 1024) {
                embed.addFields([
                    {
                        name: `📝 Tiếp theo (${tracks.length} bài)`,
                        value: trackList,
                        inline: false
                    }
                ]);
            } else if (trackList && trackList.length > 1024) {
                const truncated =
                    trackList.substring(0, 950) +
                    '\n\n*...và ' +
                    (tracks.length - displayTracks.length + 1) +
                    ' bài khác*';
                embed.addFields([
                    {
                        name: `📝 Tiếp theo (${tracks.length} bài)`,
                        value: truncated,
                        inline: false
                    }
                ]);
            }
        } catch (error) {
            logger.error('Error creating queue tracks field:', error);
        }
    }

    // Simplified info line
    try {
        const loopEmoji = queue.loop === 'off' ? '➡️' : queue.loop === 'track' ? '🔂' : '🔁';
        const loopText = queue.loop === 'off' ? 'Tắt' : queue.loop === 'track' ? 'Bài' : 'Tất cả';

        const infoValue = `${loopEmoji} Loop: **${loopText}** | 📊 Âm lượng: **${queue.volume || 50}%** | ⏱️ Tổng: **${formatDuration(totalDuration)}** | 🕒 Còn lại: **${formatDuration(eta)}**`;

        if (infoValue.length > 0 && infoValue.length <= 1024) {
            embed.addFields([
                {
                    name: '📊 Thông tin',
                    value: infoValue,
                    inline: false
                }
            ]);
        }
    } catch (error) {
        logger.error('Error creating queue info field:', error);
    }

    return embed;
}

/**
 * Create track added embed
 */
export function createTrackAddedEmbed(track, position, config) {
    // Validate track and info
    if (!track || !track.info) {
        return new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Lỗi')
            .setDescription('Không thể hiển thị thông tin bài hát')
            .setTimestamp();
    }

    const info = track.info;

    // Safe access with fallbacks
    const icon = getPlatformIcon(info.sourceName || 'unknown');
    const title = info.title || 'Unknown Track';
    const uri = info.uri || '#';
    const author = info.author || 'Unknown Artist';
    const isStream = info.isStream || false;
    const length = info.length || 0;
    // Handle requester as string ID, object with id property, or 'autoplay'
    const requesterId =
        typeof track.requester === 'string' ? track.requester : track.requester?.id || track.requesterId || 'Unknown';

    const embed = new EmbedBuilder()
        .setColor(config.bot.color)
        .setTitle('✅ Đã thêm vào hàng đợi')
        .setDescription(`${icon} **[${title}](${uri})**`)
        .addFields([
            {
                name: '👤 Tác giả',
                value: author,
                inline: true
            },
            {
                name: '⏱️ Thời lượng',
                value: isStream ? '🔴 LIVE' : formatDuration(length),
                inline: true
            },
            {
                name: '📍 Vị trí',
                value: `#${position}`,
                inline: true
            },
            {
                name: '👥 Yêu cầu bởi',
                value: `<@${requesterId}>`,
                inline: true
            }
        ]);

    if (info.artworkUrl) {
        embed.setThumbnail(info.artworkUrl);
    }

    embed.setFooter({ text: config.bot.footer }).setTimestamp();

    return embed;
}

/**
 * Create playlist added embed
 */
export function createPlaylistAddedEmbed(playlistName, trackCount, config) {
    const embed = new EmbedBuilder()
        .setColor(config.bot.color)
        .setTitle('✅ Đã thêm playlist')
        .setDescription(`📝 **${playlistName}**`)
        .addFields([
            {
                name: '🎵 Số bài',
                value: `${trackCount} bài`,
                inline: true
            }
        ])
        .setFooter({ text: config.bot.footer })
        .setTimestamp();

    return embed;
}

/**
 * Create error embed
 */
export function createErrorEmbed(message, config) {
    // Ensure message is a string and not empty
    const errorMessage = message ? String(message) : 'Đã xảy ra lỗi không xác định';

    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Lỗi')
        .setDescription(errorMessage)
        .setFooter({ text: config.bot.footer })
        .setTimestamp();
}

/**
 * Create success embed
 */
export function createSuccessEmbed(title, message, config) {
    // Validate config to prevent errors
    if (!config?.bot?.footer) {
        throw new Error('Config object with bot.footer is required');
    }

    return new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`✅ ${title}`)
        .setDescription(message)
        .setFooter({ text: config.bot.footer })
        .setTimestamp();
}

/**
 * Create info embed
 */
export function createInfoEmbed(title, message, config) {
    return new EmbedBuilder()
        .setColor(config.bot.color)
        .setTitle(`ℹ️ ${title}`)
        .setDescription(message)
        .setFooter({ text: config.bot.footer })
        .setTimestamp();
}

/**
 * Create search confirmation embed for first track result
 */
export function createSearchConfirmEmbed(track, config) {
    // Validate track and info
    if (!track || !track.info) {
        return new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Lỗi')
            .setDescription('Không thể hiển thị thông tin bài hát')
            .setTimestamp();
    }

    const info = track.info;

    // Safe access with fallbacks
    const icon = getPlatformIcon(info.sourceName || 'unknown');
    const title = info.title || 'Unknown Track';
    const uri = info.uri || '#';
    const author = info.author || 'Unknown Artist';
    const isStream = info.isStream || false;
    const length = info.length || 0;

    // Create compact description for mobile
    const description =
        `${icon} **[${title}](${uri})**\n\n` +
        `👤 **Tác giả:** ${author}\n` +
        `⏱️ **Thời lượng:** ${isStream ? '🔴 LIVE' : formatDurationMobile(length)}\n\n` +
        '✅ Đúng bài này? Nhấn **Phát ngay**\n' +
        '🔍 Không phải? Nhấn **Tìm kiếm** để xem thêm';

    const embed = new EmbedBuilder()
        .setColor(config.bot.color)
        .setTitle('🤔 Bạn muốn phát bài này phải không?')
        .setDescription(description);

    if (info.artworkUrl) {
        embed.setThumbnail(info.artworkUrl);
    }

    embed.setFooter({ text: config.bot.footer }).setTimestamp();

    return embed;
}

/**
 * Create history replay embed
 */
export function createHistoryReplayEmbed(history, config) {
    // Validate inputs
    if (!Array.isArray(history)) {
        throw new Error('History must be an array');
    }

    if (!config?.bot) {
        throw new Error('Config must have bot property');
    }

    const embed = new EmbedBuilder()
        .setColor(config.bot.color || '#5865F2')
        .setTitle('📜 Lịch Sử Phát Nhạc - Chọn Bài Để Phát Lại')
        .setDescription('Chọn một bài hát từ danh sách bên dưới để phát lại ngay lập tức!')
        .setFooter({
            text: `${config.bot.footer || 'Miyao Music Bot'} • Hiển thị ${Math.min(10, history.length)} bài gần nhất`
        })
        .setTimestamp();

    // Show history tracks with defensive programming
    if (history.length > 0) {
        try {
            const tracks = history
                .slice(0, 10)
                .filter(entry => entry?.track?.info?.title) // Filter out invalid entries
                .map((entry, index) => {
                    try {
                        const track = entry.track;
                        const info = track.info;

                        // Safe access to all properties
                        const icon = getPlatformIcon(info.sourceName || 'unknown');
                        const title = truncate(info.title || 'Unknown Track', 40);
                        const author = truncate(info.author || 'Unknown Artist', 20);
                        const uri = info.uri || '#';
                        const isStream = info.isStream || false;
                        const length = info.length || 0;

                        // Calculate time since played
                        const timeSince = entry.playedAt ? Date.now() - entry.playedAt : 0;
                        const minutesAgo = Math.floor(timeSince / 60000);
                        const timeText =
                            minutesAgo < 1
                                ? 'Vừa xong'
                                : minutesAgo < 60
                                  ? `${minutesAgo} phút trước`
                                  : minutesAgo < 1440
                                    ? `${Math.floor(minutesAgo / 60)} giờ trước`
                                    : `${Math.floor(minutesAgo / 1440)} ngày trước`;

                        return (
                            `**#${index + 1}** ${icon} [${title}](${uri})\n` +
                            `⏱️ ${isStream ? '🔴 LIVE' : formatDuration(length)} | ` +
                            `👤 ${author} | 🕐 ${timeText}`
                        );
                    } catch (error) {
                        logger.error('Error formatting history track:', error);
                        return null;
                    }
                })
                .filter(track => track !== null) // Remove failed tracks
                .join('\n\n');

            // Validate field value and add
            if (tracks && tracks.trim().length > 0 && tracks.length <= 1024) {
                embed.addFields([
                    {
                        name: '🎵 Lịch sử phát nhạc',
                        value: tracks,
                        inline: false
                    }
                ]);
            } else if (tracks && tracks.length > 1024) {
                // Truncate if too long
                const truncated = tracks.substring(0, 1000) + '\n\n*... và nhiều bài khác*';
                embed.addFields([
                    {
                        name: '🎵 Lịch sử phát nhạc',
                        value: truncated,
                        inline: false
                    }
                ]);
            } else {
                embed.setDescription('Không có bài hát hợp lệ trong lịch sử.');
            }
        } catch (error) {
            logger.error('Error creating history embed:', error);
            embed.setDescription('Đã xảy ra lỗi khi tải lịch sử phát nhạc.');
        }
    } else {
        embed.setDescription('Lịch sử phát nhạc trống.');
    }

    return embed;
}

/**
 * Create no results embed with smart suggestions
 * @param {string} query - The search query that returned no results
 * @param {Array} suggestions - Array of suggestion objects {type, title, description, value}
 * @param {Object} config - Bot config
 * @returns {EmbedBuilder} No results embed with suggestions
 */
export function createNoResultsSuggestionsEmbed(query, suggestions, config) {
    const embed = new EmbedBuilder()
        .setColor('#FFA500') // Orange for warning/info
        .setTitle('🔍 Không tìm thấy kết quả')
        .setDescription(
            `Không tìm thấy bài hát nào cho: **"${truncate(query, 50)}"**\n\n` +
                'Có thể bạn đang tìm một trong những bài này?'
        )
        .setFooter({ text: config.bot.footer })
        .setTimestamp();

    // Add suggestions if available
    if (suggestions && suggestions.length > 0) {
        // Group suggestions by type
        const historyMatches = suggestions.filter(s => s.type === 'history');
        const artistMatches = suggestions.filter(s => s.type === 'artist');
        const popularMatches = suggestions.filter(s => s.type === 'popular');

        // Add history suggestions
        if (historyMatches.length > 0) {
            const historyText = historyMatches
                .slice(0, 3)
                .map(
                    (s, i) =>
                        `**${i + 1}.** [${truncate(s.title, 40)}](${s.url || '#'})\n   └ 🎤 ${truncate(s.author || 'Unknown', 25)}`
                )
                .join('\n');

            embed.addFields([
                {
                    name: '📜 Từ lịch sử nghe của bạn',
                    value: historyText || '*Không có gợi ý*',
                    inline: false
                }
            ]);
        }

        // Add artist suggestions
        if (artistMatches.length > 0) {
            const artistText = artistMatches
                .slice(0, 3)
                .map((s, i) => `**${i + 1}.** ${truncate(s.title, 40)}\n   └ 🎤 ${truncate(s.author || 'Unknown', 25)}`)
                .join('\n');

            embed.addFields([
                {
                    name: '🎤 Bài hát của nghệ sĩ',
                    value: artistText || '*Không có gợi ý*',
                    inline: false
                }
            ]);
        }

        // Add popular suggestions
        if (popularMatches.length > 0) {
            const popularText = popularMatches
                .slice(0, 3)
                .map((s, i) => `**${i + 1}.** ${truncate(s.title, 40)}`)
                .join('\n');

            embed.addFields([
                {
                    name: '🔥 Phổ biến gần đây',
                    value: popularText || '*Không có gợi ý*',
                    inline: false
                }
            ]);
        }
    }

    // Add tips section
    embed.addFields([
        {
            name: '💡 Mẹo tìm kiếm',
            value:
                '• Kiểm tra chính tả của từ khóa\n' +
                '• Thử tìm bằng tên đầy đủ + tên nghệ sĩ\n' +
                '• Dùng `/trending` để khám phá nhạc mới\n' +
                '• Dùng `/discover` để gợi ý theo sở thích',
            inline: false
        }
    ]);

    return embed;
}

export default {
    createNowPlayingEmbed,
    createQueueEmbed,
    createTrackAddedEmbed,
    createPlaylistAddedEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createSearchConfirmEmbed,
    createHistoryReplayEmbed,
    createNoResultsSuggestionsEmbed
};
