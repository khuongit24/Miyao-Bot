/**
 * @file MusicEmbeds.js
 * @description Centralized Discord embed builders for music player UI
 * @version 1.9.0 - Added comprehensive JSDoc documentation
 */

import { EmbedBuilder } from 'discord.js';
import { formatDuration, getProgressBar, truncate, getPlatformIcon } from '../../utils/helpers.js';
import { formatDurationMobile, exceedsMobileLimits } from '../../utils/mobile-optimization.js';
import logger from '../../utils/logger.js';
import { COLORS, ICONS, FIELD_NAMES } from '../../config/design-system.js';
import { PLATFORM_NAMES } from '../../utils/constants.js';
import { createErrorEmbed } from './ErrorEmbeds.js';
import { safeAddFields } from './EmbedUtils.js';

export { safeAddFields } from './EmbedUtils.js';
export { createErrorEmbed } from './ErrorEmbeds.js';

/**
 * Create now playing embed with dynamic progress bar, track info, and queue status
 * @param {Object} track - Track object with info property
 * @param {Object} queue - Queue object with player state, tracks, volume, loop mode
 * @param {Object} config - Bot configuration with bot.color and bot.footer
 * @param {number|null} [currentPosition=null] - Override playback position in ms
 * @returns {EmbedBuilder} Now playing embed
 */
export function createNowPlayingEmbed(track, queue, config, currentPosition = null) {
    // Validate track and info
    if (!track || !track.info) {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${ICONS.ERROR} Lỗi`)
            .setDescription('Không thể hiển thị thông tin bài hát')
            .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
            .setTimestamp();
    }

    const info = track.info;

    // Use provided position or get from player
    const progress = currentPosition !== null ? currentPosition : queue.player?.position || track.position || 0;
    const duration = info.length || 0;
    const isStream = info.isStream || false;

    // For streams, show a special livestream indicator instead of progress bar
    let progressBar;
    let percentage;
    if (isStream || duration <= 0) {
        progressBar = '🔴 ━━━━━━━━━━ LIVE ━━━━━━━━━━ 🔴';
        percentage = null;
    } else {
        progressBar = getProgressBar(progress, duration, 25); // Slightly shorter to fit mobile
        // BUG-080: Handle large or non-finite ms values safely
        percentage =
            Number.isFinite(progress) && Number.isFinite(duration) && duration > 0
                ? Math.min(Math.round((progress / duration) * 100), 100)
                : 0;
    }

    // Status indicator
    const statusEmoji = queue.paused ? '⏸️' : '▶️';
    const statusText = queue.paused ? 'Đã tạm dừng' : 'Đang phát';

    // Safe access with fallbacks
    const title = info.title || 'Không rõ bài hát';
    const uri = info.uri || '#';
    const author = info.author || 'Không rõ nghệ sĩ';

    // v1.11.0: Source indicator
    const platformEmoji = getPlatformIcon(info.sourceName || 'unknown');
    const platformName = PLATFORM_NAMES[(info.sourceName || '').toLowerCase()] || 'Không rõ';

    // Handle requester
    const requesterId =
        typeof track.requester === 'string' ? track.requester : track.requester?.id || track.requesterId || 'Không rõ';

    // Get active filters if any
    const activeFilters = queue.getActiveFilters ? queue.getActiveFilters() : [];
    const filterText =
        activeFilters.length > 0
            ? `✨ Hiệu ứng: **${activeFilters.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ')}**`
            : '';

    // Get next track info
    const nextTrack = queue.tracks && queue.tracks.length > 0 ? queue.tracks[0] : null;
    const nextTrackText = nextTrack
        ? `⏭️ **Tiếp theo:** [${truncate(nextTrack.info?.title, 35)}](${nextTrack.info?.uri || '#'})`
        : '📝 **Tiếp theo:** *Hết danh sách*';

    const embed = new EmbedBuilder()
        .setColor(queue.paused ? COLORS.NOW_PLAYING_PAUSED : COLORS.NOW_PLAYING)
        .setAuthor({
            name: `${statusText} | ${platformEmoji} ${platformName}`,
            iconURL: 'https://cdn.discordapp.com/emojis/995648833319080006.webp?size=96&quality=lossless', // Dynamic or static music icon
            url: uri
        })
        .setTitle(truncate(title, 60))
        .setURL(uri)
        .setDescription(
            `${progressBar}\n` +
                `\`${formatDuration(progress)}\` / \`${isStream ? '🔴 LIVE' : formatDuration(duration)}\`${percentage !== null ? ` • **${percentage}%**` : ''}\n\n` +
                `🎤 ${author}\n` +
                `${filterText ? filterText + '\n' : ''}` +
                `${nextTrackText}`
        )
        .addFields([
            {
                name: FIELD_NAMES.REQUESTED_BY,
                value: `<@${requesterId}>`,
                inline: true
            },
            {
                name: FIELD_NAMES.VOLUME,
                value: `**${queue.volume}%**`,
                inline: true
            },
            {
                name: FIELD_NAMES.LOOP,
                value: queue.loop === 'off' ? 'Tắt' : queue.loop === 'track' ? 'Bài hát' : 'Tất cả',
                inline: true
            }
        ]);

    if (track.info.artworkUrl) {
        embed.setThumbnail(track.info.artworkUrl);
    }

    embed.setFooter({ text: `${config?.bot?.footer || 'Miyao Music Bot'} • ${statusText}` }).setTimestamp();

    return embed;
}

/**
 * Create paginated queue embed showing current track and upcoming tracks
 * @param {Object} queue - Queue object with current track, tracks array, volume, loop mode
 * @param {Object} config - Bot configuration with bot.color and bot.footer
 * @param {number} [page=1] - Page number to display (1-indexed)
 * @returns {EmbedBuilder} Queue embed with track listing
 * @throws {Error} If queue or config.bot is missing
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
    const totalPages = Math.max(1, Math.ceil(tracks.length / perPage));
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
        .setColor(COLORS.QUEUE)
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
            const title = truncate(info.title || 'Không rõ bài hát', 50);
            const uri = info.uri || '#';
            const isStream = info.isStream || false;
            const length = info.length || 0;
            const author = truncate(info.author || 'Không rõ nghệ sĩ', 25);
            const requesterId =
                typeof current.requester === 'string'
                    ? current.requester
                    : current.requester?.id || current.requesterId || 'Không rõ';

            const fieldValue =
                `${icon} **[${title}](${uri})**\n` +
                `⏱️ ${isStream ? '🔴 LIVE' : formatDuration(length)} | 👤 ${author} | 📢 <@${requesterId}>`;

            if (fieldValue.length > 0 && fieldValue.length <= 1024) {
                safeAddFields(embed, [
                    {
                        name: FIELD_NAMES.NOW_PLAYING,
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

            // Build track list incrementally to stay within 1024 char limit
            const trackLines = [];
            let currentLength = 0;
            const MAX_FIELD_LENGTH = 1024;
            const TRUNCATION_RESERVE = 50; // Reserve space for "...and X more" message

            for (let index = 0; index < displayTracks.length; index++) {
                const track = displayTracks[index];
                if (!track || !track.info || !track.info.title) continue;

                try {
                    const position = start + index + 1;
                    const info = track.info;
                    const icon = getPlatformIcon(info.sourceName || 'unknown');
                    const title = truncate(info.title || 'Không rõ bài hát', 40);
                    const isStream = info.isStream || false;
                    const length = info.length || 0;

                    const line = `**#${position}** ${icon} ${title} • ${isStream ? '🔴 LIVE' : formatDuration(length)}`;

                    if (currentLength + line.length + 1 > MAX_FIELD_LENGTH - TRUNCATION_RESERVE) {
                        const remaining = displayTracks.length - index;
                        trackLines.push(`\n*...và ${remaining} bài khác*`);
                        break;
                    }

                    trackLines.push(line);
                    currentLength += line.length + 1; // +1 for newline
                } catch (error) {
                    logger.error('Error formatting track:', error);
                }
            }

            const trackList = trackLines.join('\n');

            if (trackList && trackList.trim().length > 0) {
                safeAddFields(embed, [
                    {
                        name: `${FIELD_NAMES.UP_NEXT} (${tracks.length} bài)`,
                        value: trackList.substring(0, MAX_FIELD_LENGTH),
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
        const loopText = queue.loop === 'off' ? 'Tắt' : queue.loop === 'track' ? 'Bài hát' : 'Tất cả';

        const infoValue = `${loopEmoji} Loop: **${loopText}** | 📊 Âm lượng: **${queue.volume || 50}%** | ⏱️ Tổng: **${formatDuration(totalDuration)}** | 🕒 Còn lại: **${formatDuration(eta)}**`;

        if (infoValue.length > 0 && infoValue.length <= 1024) {
            safeAddFields(embed, [
                {
                    name: FIELD_NAMES.QUEUE_INFO,
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
 * Create embed shown when a track is added to the queue
 * @param {Object} track - Track object with info property
 * @param {number} position - Position in queue (1-indexed)
 * @param {Object} config - Bot configuration with bot.color and bot.footer
 * @param {Object|null} [searchInfo=null] - Optional search source info for fallback badge
 * @param {string} [searchInfo.searchSource] - Search prefix used (e.g., 'scsearch')
 * @param {string} [searchInfo.searchSourceName] - Human-readable source name (e.g., 'SoundCloud')
 * @param {boolean} [searchInfo.isFallback] - Whether this was a fallback from primary source
 * @returns {EmbedBuilder} Track added confirmation embed
 */
export function createTrackAddedEmbed(track, position, config, searchInfo = null) {
    // Validate track and info
    if (!track || !track.info) {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${ICONS.ERROR} Lỗi`)
            .setDescription('Không thể hiển thị thông tin bài hát')
            .setTimestamp();
    }

    const info = track.info;

    // Safe access with fallbacks
    const icon = getPlatformIcon(info.sourceName || 'unknown');
    const title = info.title || 'Không rõ bài hát';
    const uri = info.uri || '#';
    const author = info.author || 'Không rõ nghệ sĩ';
    const isStream = info.isStream || false;
    const length = info.length || 0;
    // Handle requester as string ID, object with id property, or 'autoplay'
    const requesterId =
        typeof track.requester === 'string' ? track.requester : track.requester?.id || track.requesterId || 'Không rõ';

    const embed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle('✅ Đã thêm vào hàng đợi')
        .setDescription(
            `${icon} **[${title}](${uri})**` +
                (searchInfo?.isFallback
                    ? `\n${ICONS.SOURCE_SWITCH} Tìm thấy trên **${searchInfo.searchSourceName}**`
                    : '')
        )
        .addFields([
            {
                name: FIELD_NAMES.AUTHOR,
                value: author,
                inline: true
            },
            {
                name: FIELD_NAMES.DURATION,
                value: isStream ? '🔴 LIVE' : formatDuration(length),
                inline: true
            },
            {
                name: FIELD_NAMES.POSITION,
                value: `#${position}`,
                inline: true
            },
            {
                name: FIELD_NAMES.REQUESTED_BY,
                value: `<@${requesterId}>`,
                inline: true
            }
        ]);

    if (info.artworkUrl) {
        embed.setThumbnail(info.artworkUrl);
    }

    embed.setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' }).setTimestamp();

    return embed;
}

/**
 * Create embed shown when a playlist is added to the queue
 * @param {string} playlistName - Name of the added playlist
 * @param {number} trackCount - Number of tracks added from the playlist
 * @param {Object} config - Bot configuration with bot.color and bot.footer
 * @returns {EmbedBuilder} Playlist added confirmation embed
 */
export function createPlaylistAddedEmbed(playlistName, trackCount, config) {
    const embed = new EmbedBuilder()
        .setColor(config?.bot?.color || COLORS.PRIMARY)
        .setTitle('✅ Đã thêm playlist')
        .setDescription(`📝 **${playlistName}**`)
        .addFields([
            {
                name: '🎵 Số bài',
                value: `${trackCount} bài`,
                inline: true
            }
        ])
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();

    return embed;
}

/**
 * Create a success embed with green color
 * @param {string} title - Success title (auto-prefixed with ✅)
 * @param {string} message - Success description text
 * @param {Object} config - Bot configuration with bot.footer
 * @returns {EmbedBuilder} Success embed
 * @throws {Error} If config.bot.footer is missing
 */
export function createSuccessEmbed(title, message, config) {
    return new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`${ICONS.SUCCESS} ${title}`)
        .setDescription(message)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create an informational embed using the bot's brand color
 * @param {string} title - Info title (auto-prefixed with ℹ️)
 * @param {string} message - Info description text
 * @param {Object} config - Bot configuration with bot.color and bot.footer
 * @returns {EmbedBuilder} Info embed
 */
export function createInfoEmbed(title, message, config) {
    return new EmbedBuilder()
        .setColor(config?.bot?.color || COLORS.INFO)
        .setTitle(`${ICONS.INFO} ${title}`)
        .setDescription(message)
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
        .setTimestamp();
}

/**
 * Create search confirmation embed for the first track result
 * Shows track details and prompts user to confirm or search for alternatives
 * @param {Object} track - Track object with info property (title, author, uri, etc.)
 * @param {Object} config - Bot configuration with bot.color and bot.footer
 * @returns {EmbedBuilder} Search confirmation embed
 */
export function createSearchConfirmEmbed(track, config) {
    // Validate track and info
    if (!track || !track.info) {
        return new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`${ICONS.ERROR} Lỗi`)
            .setDescription('Không thể hiển thị thông tin bài hát')
            .setTimestamp();
    }

    const info = track.info;

    // Safe access with fallbacks
    const icon = getPlatformIcon(info.sourceName || 'unknown');
    const title = info.title || 'Không rõ bài hát';
    const uri = info.uri || '#';
    const author = info.author || 'Không rõ nghệ sĩ';
    const isStream = info.isStream || false;
    const length = info.length || 0;

    // Create compact description for mobile
    const description =
        `${icon} **[${title}](${uri})**\n\n` +
        `👤 **Tác giả:** ${author}\n` +
        `⏱️ **Thời lượng:** ${isStream ? '🔴 LIVE' : formatDurationMobile(length)}\n\n` +
        '✅ Đúng bài này? Nhấn **Phát ngay**\n' +
        '🔍 Không phải? Bạn nhấn **Tìm kiếm thêm** nhé';

    const embed = new EmbedBuilder()
        .setColor(config?.bot?.color || COLORS.PRIMARY)
        .setTitle('🤔 Bạn muốn phát bài này phải không?')
        .setDescription(description);

    if (info.artworkUrl) {
        embed.setThumbnail(info.artworkUrl);
    }

    embed.setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' }).setTimestamp();

    return embed;
}

/**
 * Create history replay embed showing recent tracks with relative timestamps
 * @param {Array<{track: Object, playedAt: number}>} history - Array of history entries
 * @param {Object} config - Bot configuration with bot.color and bot.footer
 * @returns {EmbedBuilder} History replay embed
 * @throws {Error} If history is not an array or config.bot is missing
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
        .setColor(config.bot.color || COLORS.PRIMARY)
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
                        const title = truncate(info.title || 'Không rõ bài hát', 40);
                        const author = truncate(info.author || 'Không rõ nghệ sĩ', 20);
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
                safeAddFields(embed, [
                    {
                        name: '🎵 Lịch sử phát nhạc',
                        value: tracks,
                        inline: false
                    }
                ]);
            } else if (tracks && tracks.length > 1024) {
                // Truncate if too long - ensure total stays within 1024 char limit
                const suffix = '\n\n*... và nhiều bài khác*';
                const truncated = tracks.substring(0, 1024 - suffix.length) + suffix;
                safeAddFields(embed, [
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
        .setColor(COLORS.WARNING)
        .setTitle('🔍 Không tìm thấy kết quả')
        .setDescription(
            `Không tìm thấy bài hát nào cho: **"${truncate(query, 50)}"**\n\n` +
                'Có thể bạn đang tìm một trong những bài này?'
        )
        .setFooter({ text: config?.bot?.footer || 'Miyao Music Bot' })
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
                        `**${i + 1}.** [${truncate(s.title, 40)}](${s.url || '#'})\n   └ 🎤 ${truncate(s.author || 'Không rõ', 25)}`
                )
                .join('\n');

            safeAddFields(embed, [
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
                .map(
                    (s, i) => `**${i + 1}.** ${truncate(s.title, 40)}\n   └ 🎤 ${truncate(s.author || 'Không rõ', 25)}`
                )
                .join('\n');

            safeAddFields(embed, [
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

            safeAddFields(embed, [
                {
                    name: '🔥 Phổ biến gần đây',
                    value: popularText || '*Không có gợi ý*',
                    inline: false
                }
            ]);
        }
    }

    // Add tips section
    safeAddFields(embed, [
        {
            name: FIELD_NAMES.SEARCH_TIPS,
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
    safeAddFields,
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
