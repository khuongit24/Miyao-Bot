/**
 * Miyao Bot Design System
 * Centralized visual constants for consistent UI across all embeds,
 * buttons, and messages.
 *
 * @module design-system
 * @version 1.11.0
 */

// ─────────────────────────────────────────────────────────
// Color Palette
// ─────────────────────────────────────────────────────────

export const COLORS = {
    /** Brand/primary color — used for standard embeds, now playing (active) */
    PRIMARY: '#FF69B4',

    /** Success — used for confirmations, track added, playlist saved */
    SUCCESS: '#2ECC71',

    /** Error — used for error embeds, critical failures */
    ERROR: '#E74C3C',

    /** Warning — used for warnings, cautions, paused state */
    WARNING: '#F39C12',

    /** Info — used for informational embeds, help, tips */
    INFO: '#3498DB',

    /** Muted/neutral — used for secondary info, disabled states */
    MUTED: '#95A5A6',

    /** Severity mapping — matches errors.js ErrorSeverity */
    SEVERITY: {
        info: '#3498DB',
        warning: '#F39C12',
        error: '#E74C3C',
        critical: '#C0392B'
    },

    /** Feature-specific colors */
    NOW_PLAYING: '#FF69B4',
    NOW_PLAYING_PAUSED: '#F39C12',
    QUEUE: '#FF69B4',
    AUTOPLAY_ON: '#2ECC71',
    AUTOPLAY_OFF: '#95A5A6',
    FILTER_ACTIVE: '#9B59B6',
    SETTINGS_ENABLED: '#2ECC71',
    SETTINGS_DISABLED: '#95A5A6'
};

// ─────────────────────────────────────────────────────────
// Icon Set (Emoji)
// ─────────────────────────────────────────────────────────

export const ICONS = {
    // Status
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '⏳',
    CRITICAL: '🚨',

    // Music playback
    PLAYING: '▶️',
    PAUSED: '⏸️',
    STOPPED: '⏹️',
    SKIPPED: '⏭️',
    PREVIOUS: '⏮️',
    SHUFFLE: '🔀',
    LOOP_OFF: '➡️',
    LOOP_TRACK: '🔂',
    LOOP_QUEUE: '🔁',
    VOLUME: '🔊',
    VOLUME_DOWN: '🔉',
    VOLUME_MUTE: '🔇',
    LYRICS: '📝',
    LIKE: '❤️',

    // Queue & tracks
    QUEUE: '📋',
    TRACK: '🎵',
    PLAYLIST: '📁',
    ADD: '➕',
    REMOVE: '🗑️',
    POSITION: '📍',

    // User & social
    USER: '👤',
    USERS: '👥',
    DJ: '🎧',
    CROWN: '👑',

    // Navigation
    FIRST: '⏮️', // Same emoji as PREVIOUS
    LAST: '⏭️', // Same emoji as SKIPPED
    NEXT: '▶️', // Same emoji as PLAYING
    PREV: '◀️',
    REFRESH: '🔄',
    BACK: '↩️',
    HOME: '🏠',

    // Features
    SEARCH: '🔍',
    FILTER: '🎛️',
    SETTINGS: '⚙️',
    STATS: '📊',
    HISTORY: '📜',
    TRENDING: '🔥',
    DISCOVER: '✨',
    SIMILAR: '🎯',
    AUTOPLAY: '🔄', // Same emoji as REFRESH

    // Platforms
    YOUTUBE: '🎥',
    SPOTIFY: '🎵', // Same emoji as TRACK
    SOUNDCLOUD: '🔊', // Same emoji as VOLUME
    LIVE: '🔴',

    // Platform-specific (v1.11.2)
    PLATFORM_YOUTUBE: '🔴',
    PLATFORM_SPOTIFY: '💚',
    PLATFORM_SOUNDCLOUD: '🔊',
    PLATFORM_BANDCAMP: '🎸',
    PLATFORM_DEEZER: '💜',
    PLATFORM_TWITCH: '🟣',
    PLATFORM_VIMEO: '🔵',
    PLATFORM_HTTP: '🌐',
    PLATFORM_UNKNOWN: '🎵',
    SOURCE_SWITCH: '🔄',
    SOURCE_WARNING: '⚠️',

    // Misc
    TIP: '💡',
    STAR: '⭐',
    CLOCK: '🕐',
    DURATION: '⏱️',
    LINK: '🔗',
    SAVE: '💾',
    NEW: '🆕',
    ROCKET: '🚀'
};

// ─────────────────────────────────────────────────────────
// Tone of Voice — Vietnamese, friendly, concise
// ─────────────────────────────────────────────────────────

export const MESSAGES = {
    // Empty states with guidance
    EMPTY_QUEUE: `${ICONS.QUEUE} Hàng đợi đang trống\n${ICONS.TIP} Thêm bài với \`/play <tên bài>\` hoặc \`/playlist play\``,
    NOTHING_PLAYING: `${ICONS.TRACK} Không có bài nào đang phát\n${ICONS.TIP} Bắt đầu nghe nhạc với \`/play\``,
    NO_HISTORY: `${ICONS.HISTORY} Chưa có lịch sử nghe\n${ICONS.TIP} Hãy phát một bài hát để bắt đầu!`,
    NO_PLAYLISTS: `${ICONS.PLAYLIST} Bạn chưa có playlist nào\n${ICONS.TIP} Tạo mới với \`/playlist create <tên>\``,
    NO_RESULTS: `${ICONS.SEARCH} Không tìm thấy kết quả\n${ICONS.TIP} Thử từ khóa khác hoặc dùng URL trực tiếp`,

    // Quick actions after events
    AFTER_PLAY: `${ICONS.TIP} Dùng \`/queue\` xem hàng đợi • \`/lyrics\` xem lời bài hát`,
    AFTER_STOP: `${ICONS.TIP} Phát nhạc lại với \`/play\` • Lưu queue với \`/save\``,
    QUEUE_ENDED: `${ICONS.QUEUE} Hàng đợi đã kết thúc\n${ICONS.TIP} Bật \`/autoplay\` để nghe liên tục hoặc dùng \`/discover\` để khám phá`,

    // Feature discovery tips
    TIPS: [
        `${ICONS.TIP} Click chuột phải vào tin nhắn → **Add to Queue** để thêm bài nhanh!`,
        `${ICONS.TIP} Dùng \`/similar\` để tìm bài giống bài đang phát`,
        `${ICONS.TIP} Tạo playlist yêu thích với \`/playlist create\``,
        `${ICONS.TIP} Dùng \`/discover\` để nhận gợi ý nhạc theo sở thích`,
        `${ICONS.TIP} Bật \`/autoplay\` để bot tự phát nhạc khi hết queue`,
        `${ICONS.TIP} Dùng \`/filter\` để thêm hiệu ứng: Bass Boost, Nightcore, 8D...`,
        `${ICONS.TIP} Dùng \`/lyrics\` để xem lời bài hát đang phát`,
        `${ICONS.TIP} Xem \`/history\` để phát lại bài đã nghe trước đó`
    ],

    // Onboarding
    FIRST_TIME_TIP: `${ICONS.NEW} Chào mừng bạn đến với Miyao! Bắt đầu nghe nhạc với \`/play <tên bài>\``,
    FIRST_PLAY_TIP: `${ICONS.TIP} Biết không? Bạn có thể dùng \`/queue\` để xem hàng đợi và \`/lyrics\` để xem lời bài hát!`
};

// ─────────────────────────────────────────────────────────
// Embed Templates (consistent structure)
// ─────────────────────────────────────────────────────────

/**
 * Standard embed field names used across the bot
 */
export const FIELD_NAMES = {
    SUGGESTIONS: `${ICONS.TIP} Gợi ý`,
    REQUESTED_BY: `${ICONS.USER} Yêu cầu bởi`,
    VOLUME: `${ICONS.VOLUME} Âm lượng`,
    LOOP: `${ICONS.LOOP_QUEUE} Lặp lại`,
    DURATION: `${ICONS.DURATION} Thời lượng`,
    POSITION: `${ICONS.POSITION} Vị trí`,
    AUTHOR: `${ICONS.USER} Tác giả`,
    NOW_PLAYING: `${ICONS.TRACK} Đang phát`,
    UP_NEXT: `${ICONS.QUEUE} Tiếp theo`,
    QUEUE_INFO: `${ICONS.STATS} Thông tin`,
    SEARCH_TIPS: `${ICONS.TIP} Mẹo tìm kiếm`
};

// BUG-S12: Freeze all exports to prevent accidental mutation
function deepFreeze(obj) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    }
    return obj;
}

deepFreeze(COLORS);
deepFreeze(ICONS);
deepFreeze(MESSAGES);
deepFreeze(FIELD_NAMES);

export default {
    COLORS,
    ICONS,
    MESSAGES,
    FIELD_NAMES
};
