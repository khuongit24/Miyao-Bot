/**
 * Shared help category dropdown options for select menus.
 * Used by both help.js command and helpHandler.js event.
 *
 * @type {Array<{label: string, description: string, value: string, emoji: string}>}
 */
export const HELP_CATEGORY_OPTIONS = [
    { label: 'Trang chủ', description: 'Giới thiệu về Miyao Music Bot', value: 'home', emoji: '🏠' },
    { label: 'Phát nhạc', description: 'Play, pause, skip, stop...', value: 'playback', emoji: '🎶' },
    { label: 'Hàng đợi', description: 'Queue, shuffle, loop, move...', value: 'queue', emoji: '📋' },
    { label: 'Âm thanh & Filters', description: 'Volume, filters, autoplay', value: 'control', emoji: '🎛️' },
    { label: 'Khám phá', description: 'Discover, trending, lyrics, similar', value: 'discovery', emoji: '🔍' },
    {
        label: 'Playlist & Favorites',
        description: 'Quản lý danh sách phát cá nhân',
        value: 'playlist',
        emoji: '❤️'
    },
    { label: 'Thống kê', description: 'Mystats, serverstats, leaderboard', value: 'stats', emoji: '📊' },
    { label: 'Cài đặt', description: 'Cài đặt cá nhân và server', value: 'settings', emoji: '⚙️' },
    { label: 'Tips & Tricks', description: 'Mẹo sử dụng hiệu quả', value: 'tips', emoji: '💡' }
];
