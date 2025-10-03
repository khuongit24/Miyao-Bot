import { EmbedBuilder } from 'discord.js';
import { formatDuration, getProgressBar, truncate, getPlatformIcon } from '../../Core/utils/helpers.js';

/**
 * Create now playing embed with dynamic progress
 */
export function createNowPlayingEmbed(track, queue, config, currentPosition = null) {
    // Use provided position or get from player
    const progress = currentPosition !== null ? currentPosition : (queue.player?.position || track.position || 0);
    const duration = track.info.length;
    const progressBar = getProgressBar(progress, duration, 24);
    
    // Calculate percentage
    const percentage = duration > 0 ? Math.min(Math.round((progress / duration) * 100), 100) : 0;
    
    // Status indicator
    const statusEmoji = queue.paused ? '⏸️' : '▶️';
    const statusText = queue.paused ? 'Đã tạm dừng' : 'Đang phát';
    
    const embed = new EmbedBuilder()
        .setColor(queue.paused ? '#FFA500' : config.bot.color)
        .setTitle(`${statusEmoji} ${statusText}`)
        .setDescription(`**[${track.info.title}](${track.info.uri})**`)
        .addFields([
            {
                name: '👤 Tác giả',
                value: track.info.author || 'Unknown',
                inline: true
            },
            {
                name: '⏱️ Thời lượng',
                value: track.info.isStream ? '🔴 LIVE' : formatDuration(duration),
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
                value: `<@${track.requester.id}>`,
                inline: true
            }
        ]);
    
    // Add progress bar for non-stream tracks
    if (!track.info.isStream) {
        embed.addFields([
            {
                name: '⏳ Tiến trình',
                value: `\`${formatDuration(progress)}\` ${progressBar} \`${formatDuration(duration)}\`\n**${percentage}%** hoàn thành`,
                inline: false
            }
        ]);
    }
    
    if (track.info.artworkUrl) {
        embed.setThumbnail(track.info.artworkUrl);
    }
    
    embed.setFooter({ text: `${config.bot.footer}` })
        .setTimestamp();
    
    return embed;
}

/**
 * Create queue embed
 */
export function createQueueEmbed(queue, config, page = 1) {
    const perPage = 10;
    const totalPages = Math.ceil((queue.tracks.length + 1) / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    
    const embed = new EmbedBuilder()
        .setColor(config.bot.color)
        .setTitle('📋 Hàng đợi phát nhạc')
        .setFooter({ 
            text: `${config.bot.footer} • Trang ${page}/${totalPages}` 
        })
        .setTimestamp();
    
    // Current track
    if (queue.current) {
        const current = queue.current;
        const icon = getPlatformIcon(current.info.sourceName);
        embed.addFields([
            {
                name: '🎵 Đang phát',
                value: `${icon} **[${truncate(current.info.title, 45)}](${current.info.uri})**\n` +
                       `⏱️ ${current.info.isStream ? '🔴 LIVE' : formatDuration(current.info.length)} | ` +
                       `👤 ${truncate(current.info.author, 20)} | ` +
                       `📢 <@${current.requester.id}>`,
                inline: false
            }
        ]);
    }
    
    // Queue tracks
    if (queue.tracks.length > 0) {
        const tracks = [queue.current, ...queue.tracks].slice(start + 1, end + 1);
        
        const trackList = tracks.map((track, index) => {
            const position = start + index + 1;
            const icon = getPlatformIcon(track.info.sourceName);
            return `**#${position}** ${icon} [${truncate(track.info.title, 40)}](${track.info.uri})\n` +
                   `⏱️ ${track.info.isStream ? '🔴 LIVE' : formatDuration(track.info.length)} | ` +
                   `👤 ${truncate(track.info.author, 18)}`;
        }).join('\n\n');
        
        embed.addFields([
            {
                name: `📝 Tiếp theo (${queue.tracks.length} bài)`,
                value: trackList || 'Không có bài nào',
                inline: false
            }
        ]);
    }
    
    // Queue info
    const totalDuration = queue.tracks.reduce((acc, track) => {
        return acc + (track.info.isStream ? 0 : track.info.length);
    }, 0);
    // Estimated time until end (exclude current progress)
    const currentLeft = queue.current && !queue.current.info.isStream
        ? Math.max((queue.current.info.length - (queue.player?.position || 0)), 0)
        : 0;
    const eta = currentLeft + totalDuration;

    embed.addFields([
        {
            name: '📊 Thông tin',
            value: `🔁 Loop: **${queue.loop === 'off' ? 'Tắt' : queue.loop === 'track' ? 'Bài hát' : 'Hàng đợi'}** | ` +
                   `📊 Âm lượng: **${queue.volume}%** | ` +
                   `⏱️ Tổng: **${formatDuration(totalDuration)}** | ` +
                   `🕒 Ước tính còn lại: **${formatDuration(eta)}**`,
            inline: false
        }
    ]);
    
    return embed;
}

/**
 * Create track added embed
 */
export function createTrackAddedEmbed(track, position, config) {
    const icon = getPlatformIcon(track.info.sourceName);
    
    const embed = new EmbedBuilder()
        .setColor(config.bot.color)
        .setTitle('✅ Đã thêm vào hàng đợi')
        .setDescription(`${icon} **[${track.info.title}](${track.info.uri})**`)
        .addFields([
            {
                name: '👤 Tác giả',
                value: track.info.author || 'Unknown',
                inline: true
            },
            {
                name: '⏱️ Thời lượng',
                value: track.info.isStream ? '🔴 LIVE' : formatDuration(track.info.length),
                inline: true
            },
            {
                name: '📍 Vị trí',
                value: `#${position}`,
                inline: true
            },
            {
                name: '👥 Yêu cầu bởi',
                value: `<@${track.requester.id}>`,
                inline: true
            }
        ]);
    
    if (track.info.artworkUrl) {
        embed.setThumbnail(track.info.artworkUrl);
    }
    
    embed.setFooter({ text: config.bot.footer })
        .setTimestamp();
    
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
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Lỗi')
        .setDescription(message)
        .setFooter({ text: config.bot.footer })
        .setTimestamp();
}

/**
 * Create success embed
 */
export function createSuccessEmbed(title, message, config) {
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
 * Create history replay embed
 */
export function createHistoryReplayEmbed(history, config) {
    // Validate inputs
    if (!Array.isArray(history)) {
        throw new Error('History must be an array');
    }
    
    if (!config?.bot?.footer) {
        throw new Error('Config must have bot.footer property');
    }
    
    const embed = new EmbedBuilder()
        .setColor(config.bot.color || '#5865F2')
        .setTitle('📜 Lịch Sử Phát Nhạc - Chọn Bài Để Phát Lại')
        .setDescription('Chọn một bài hát từ danh sách bên dưới để phát lại ngay lập tức!')
        .setFooter({ 
            text: `${config.bot.footer} • Hiển thị ${Math.min(10, history.length)} bài gần nhất` 
        })
        .setTimestamp();
    
    // Show history tracks with defensive programming
    if (history.length > 0) {
        const tracks = history.slice(0, 10)
            .filter(entry => entry?.track?.info) // Filter out invalid entries
            .map((entry, index) => {
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
                const timeText = minutesAgo < 1 ? 'Vừa xong' : 
                                minutesAgo < 60 ? `${minutesAgo} phút trước` :
                                minutesAgo < 1440 ? `${Math.floor(minutesAgo / 60)} giờ trước` :
                                `${Math.floor(minutesAgo / 1440)} ngày trước`;
                
                return `**#${index + 1}** ${icon} [${title}](${uri})\n` +
                       `⏱️ ${isStream ? '🔴 LIVE' : formatDuration(length)} | ` +
                       `👤 ${author} | 🕐 ${timeText}`;
            })
            .join('\n\n');
        
        if (tracks) {
            embed.addFields([
                {
                    name: '🎵 Lịch sử phát nhạc',
                    value: tracks || 'Không có bài hát nào',
                    inline: false
                }
            ]);
        } else {
            embed.setDescription('Không có bài hát hợp lệ trong lịch sử.');
        }
    } else {
        embed.setDescription('Lịch sử phát nhạc trống.');
    }
    
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
    createHistoryReplayEmbed
};
