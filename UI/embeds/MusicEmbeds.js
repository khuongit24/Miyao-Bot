import { EmbedBuilder } from 'discord.js';
import { formatDuration, getProgressBar, truncate, getPlatformIcon } from '../../Core/utils/helpers.js';

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
    const progress = currentPosition !== null ? currentPosition : (queue.player?.position || track.position || 0);
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
    const requesterId = track.requester?.id || 'Unknown';
    
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
    // Validate inputs
    if (!queue || !config?.bot) {
        throw new Error('Invalid queue or config object');
    }
    
    const perPage = 10;
    const totalPages = Math.ceil((queue.tracks.length + 1) / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    
    const embed = new EmbedBuilder()
        .setColor(config.bot.color || '#5865F2')
        .setTitle('📋 Hàng đợi phát nhạc')
        .setFooter({ 
            text: `${config.bot.footer || 'Miyao Music Bot'} • Trang ${page}/${totalPages || 1}` 
        })
        .setTimestamp();
    
    // Current track - only add if valid
    if (queue.current && queue.current.info) {
        const current = queue.current;
        const info = current.info;
        
        try {
            // Safe access with fallbacks
            const icon = getPlatformIcon(info.sourceName || 'unknown');
            const title = truncate(info.title || 'Unknown Track', 45);
            const uri = info.uri || '#';
            const isStream = info.isStream || false;
            const length = info.length || 0;
            const author = truncate(info.author || 'Unknown Artist', 20);
            const requesterId = current.requester?.id || 'Unknown';
            
            const fieldValue = `${icon} **[${title}](${uri})**\n` +
                               `⏱️ ${isStream ? '🔴 LIVE' : formatDuration(length)} | ` +
                               `👤 ${author} | ` +
                               `📢 <@${requesterId}>`;
            
            // Validate field value length (Discord limit is 1024 chars per field)
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
            // Log error but don't fail the entire embed
            console.error('Error creating current track field:', error);
        }
    }
    
    // Queue tracks
    if (queue.tracks && Array.isArray(queue.tracks) && queue.tracks.length > 0) {
        try {
            const tracks = [queue.current, ...queue.tracks].slice(start + 1, end + 1);
            
            const trackList = tracks
                .filter(track => track && track.info && track.info.title) // Filter out invalid tracks
                .map((track, index) => {
                    try {
                        const position = start + index + 1;
                        const info = track.info;
                        
                        // Safe access with fallbacks
                        const icon = getPlatformIcon(info.sourceName || 'unknown');
                        const title = truncate(info.title || 'Unknown Track', 40);
                        const uri = info.uri || '#';
                        const isStream = info.isStream || false;
                        const length = info.length || 0;
                        const author = truncate(info.author || 'Unknown Artist', 18);
                        
                        return `**#${position}** ${icon} [${title}](${uri})\n` +
                               `⏱️ ${isStream ? '🔴 LIVE' : formatDuration(length)} | ` +
                               `👤 ${author}`;
                    } catch (error) {
                        console.error('Error formatting track:', error);
                        return null;
                    }
                })
                .filter(track => track !== null) // Remove failed tracks
                .join('\n\n');
            
            // Only add field if trackList is not empty and valid
            // Discord field value must be between 1-1024 characters
            if (trackList && trackList.trim().length > 0 && trackList.length <= 1024) {
                embed.addFields([
                    {
                        name: `📝 Tiếp theo (${queue.tracks.length} bài)`,
                        value: trackList,
                        inline: false
                    }
                ]);
            } else if (trackList && trackList.length > 1024) {
                // If too long, truncate and add indication
                const truncated = trackList.substring(0, 1000) + '\n\n*... và nhiều bài khác*';
                embed.addFields([
                    {
                        name: `📝 Tiếp theo (${queue.tracks.length} bài)`,
                        value: truncated,
                        inline: false
                    }
                ]);
            }
        } catch (error) {
            console.error('Error creating queue tracks field:', error);
        }
    }
    
    // Queue info with defensive programming
    try {
        const totalDuration = (queue.tracks || [])
            .filter(track => track && track.info && !track.info.isStream) // Filter out invalid tracks and streams
            .reduce((acc, track) => {
                return acc + (track.info.length || 0);
            }, 0);
        
        // Estimated time until end (exclude current progress)
        const currentLeft = queue.current && queue.current.info && !queue.current.info.isStream
            ? Math.max((queue.current.info.length - (queue.player?.position || 0)), 0)
            : 0;
        const eta = currentLeft + totalDuration;
        
        const loopText = queue.loop === 'off' ? 'Tắt' : queue.loop === 'track' ? 'Bài hát' : 'Hàng đợi';
        const volumeText = `${queue.volume || 50}%`;
        
        const infoValue = `🔁 Loop: **${loopText}** | ` +
                         `📊 Âm lượng: **${volumeText}** | ` +
                         `⏱️ Tổng: **${formatDuration(totalDuration)}** | ` +
                         `🕒 Ước tính còn lại: **${formatDuration(eta)}**`;
        
        // Validate field value length
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
        console.error('Error creating queue info field:', error);
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
    const requesterId = track.requester?.id || 'Unknown';
    
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
            const tracks = history.slice(0, 10)
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
                        const timeText = minutesAgo < 1 ? 'Vừa xong' : 
                                        minutesAgo < 60 ? `${minutesAgo} phút trước` :
                                        minutesAgo < 1440 ? `${Math.floor(minutesAgo / 60)} giờ trước` :
                                        `${Math.floor(minutesAgo / 1440)} ngày trước`;
                        
                        return `**#${index + 1}** ${icon} [${title}](${uri})\n` +
                               `⏱️ ${isStream ? '🔴 LIVE' : formatDuration(length)} | ` +
                               `👤 ${author} | 🕐 ${timeText}`;
                    } catch (error) {
                        console.error('Error formatting history track:', error);
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
            console.error('Error creating history embed:', error);
            embed.setDescription('Đã xảy ra lỗi khi tải lịch sử phát nhạc.');
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
