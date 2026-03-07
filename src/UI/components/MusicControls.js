/**
 * @file MusicControls.js
 * @description Discord button and select menu components for music player controls
 * @version 1.9.0 - Standardized with button-ids.js constants
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { shortenButtonLabel } from '../../utils/mobile-optimization.js';
import { MUSIC, SEEK, QUEUE, SEARCH, HISTORY } from '../../utils/button-ids.js';
import { ICONS } from '../../config/design-system.js';

/**
 * Create music control buttons (2 rows: main controls + additional controls)
 * @param {Object} queue - The music queue
 * @param {boolean} [disabled=false] - Whether buttons should be disabled
 * @returns {ActionRowBuilder[]} Array of action rows with buttons
 */
export function createMusicButtons(queue, disabled = false) {
    // Check if previous is available (has history)
    const hasPrevious = queue && queue.history && queue.history.length > 0;

    // Row 1: Main controls
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC.PREVIOUS)
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !hasPrevious),

        new ButtonBuilder()
            .setCustomId(queue?.paused ? MUSIC.RESUME : MUSIC.PAUSE)
            .setEmoji(queue?.paused ? '▶️' : '⏸️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || !queue?.current),

        new ButtonBuilder()
            .setCustomId(MUSIC.STOP)
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled || !queue?.current),

        new ButtonBuilder()
            .setCustomId(MUSIC.SKIP)
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || !queue?.current),

        new ButtonBuilder()
            .setCustomId(MUSIC.QUEUE)
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue)
    );

    // Row 2: Additional controls
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC.LOOP)
            .setEmoji(getLoopEmoji(queue?.loop || 'off'))
            .setLabel(shortenButtonLabel(getLoopLabelVi(queue?.loop || 'off'), 12))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue),

        new ButtonBuilder()
            .setCustomId(MUSIC.SHUFFLE)
            .setEmoji('🔀')
            .setLabel(shortenButtonLabel('Xáo trộn', 12))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue || queue?.tracks?.length < 2),

        new ButtonBuilder()
            .setCustomId(MUSIC.VOLUME_DOWN)
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue || queue?.volume <= 0),

        new ButtonBuilder()
            .setCustomId(MUSIC.VOLUME_UP)
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue || queue?.volume >= 100),

        new ButtonBuilder()
            .setCustomId(MUSIC.LYRICS)
            .setEmoji('📝')
            .setLabel(shortenButtonLabel('Lời nhạc', 12))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue?.current)
    );

    return [row1, row2];
}

/**
 * Create now playing buttons (compact version with 3 rows: controls + seek + volume/queue)
 * @param {Object} queue - The music queue
 * @param {boolean} [disabled=false] - Whether buttons should be disabled
 * @returns {ActionRowBuilder[]} Array of action rows with buttons
 */
export function createNowPlayingButtons(queue, disabled = false) {
    // Enhanced buttons with dynamic states and better visual feedback
    // Row 1: Main playback controls
    const isPaused = queue?.paused;
    const loopMode = queue?.loop || 'off';
    const hasPrevious = queue && queue.history && queue.history.length > 0;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC.PREVIOUS)
            .setEmoji('⏮️')
            .setLabel(shortenButtonLabel('Trước', 10))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !hasPrevious),

        new ButtonBuilder()
            .setCustomId(isPaused ? MUSIC.RESUME : MUSIC.PAUSE)
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setLabel(shortenButtonLabel(isPaused ? 'Tiếp tục' : 'Tạm dừng', 12))
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(disabled || !queue?.current),

        new ButtonBuilder()
            .setCustomId(MUSIC.SKIP)
            .setEmoji('⏭️')
            .setLabel(shortenButtonLabel('Bỏ qua', 10))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || !queue?.current),

        new ButtonBuilder()
            .setCustomId(MUSIC.STOP)
            .setEmoji('⏹️')
            .setLabel(shortenButtonLabel('Dừng', 10))
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled || !queue?.current),

        new ButtonBuilder()
            .setCustomId(MUSIC.LOOP)
            .setEmoji(getLoopEmoji(loopMode))
            .setLabel(shortenButtonLabel(getLoopLabelVi(loopMode), 12))
            .setStyle(loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled || !queue)
    );

    // Row 2: Shuffle + Interactive seek controls (only for non-stream tracks) + Lyrics
    const isSeekable = queue?.current && !queue.current.info?.isStream;
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC.SHUFFLE)
            .setEmoji('🔀')
            .setLabel(shortenButtonLabel('Xáo trộn', 10))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue || queue?.tracks?.length < 2),

        new ButtonBuilder()
            .setCustomId(SEEK.BACKWARD_10)
            .setEmoji('⏪')
            .setLabel(shortenButtonLabel('-10s', 8))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !isSeekable),

        new ButtonBuilder()
            .setCustomId(MUSIC.SETTINGS)
            .setEmoji('⚙️')
            .setLabel(shortenButtonLabel('Cài đặt', 8))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue),

        new ButtonBuilder()
            .setCustomId(SEEK.FORWARD_10)
            .setEmoji('⏩')
            .setLabel(shortenButtonLabel('+10s', 8))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !isSeekable),

        new ButtonBuilder()
            .setCustomId(MUSIC.LYRICS)
            .setEmoji('📝')
            .setLabel(shortenButtonLabel('Lời nhạc', 8))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue?.current)
    );

    // Row 3: Volume and queue controls + Add to Playlist + Like button
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC.VOLUME_DOWN)
            .setEmoji('🔉')
            .setLabel(shortenButtonLabel('Giảm 10%', 10))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue || queue?.volume <= 0),

        new ButtonBuilder()
            .setCustomId(MUSIC.VOLUME_UP)
            .setEmoji('🔊')
            .setLabel(shortenButtonLabel('Tăng 10%', 10))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue || queue?.volume >= 100),

        new ButtonBuilder()
            .setCustomId(MUSIC.LIKE)
            .setEmoji('❤️')
            .setLabel(shortenButtonLabel('Yêu thích', 10))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue?.current),

        new ButtonBuilder()
            .setCustomId(MUSIC.QUEUE)
            .setEmoji('📋')
            .setLabel(shortenButtonLabel('Hàng đợi', 10))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || !queue),

        new ButtonBuilder()
            .setCustomId(MUSIC.ADD_TO_PLAYLIST)
            .setEmoji('➕')
            .setLabel(shortenButtonLabel('Playlist', 10))
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled || !queue?.current)
    );

    return [row1, row2, row3];
}

/**
 * Create queue navigation buttons with Add to Playlist button
 * @param {number} page - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {Object} [queue=null] - The music queue (optional, for playlist button)
 * @returns {ActionRowBuilder[]} Array of action rows with buttons
 */
export function createQueueButtons(page, totalPages, queue = null) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${QUEUE.FIRST_PAGE}_${page}`)
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),

        new ButtonBuilder()
            .setCustomId(`${QUEUE.PREVIOUS_PAGE}_${page}`)
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),

        new ButtonBuilder()
            .setCustomId(`${QUEUE.REFRESH}_${page}`)
            .setEmoji('🔄')
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false),

        new ButtonBuilder()
            .setCustomId(`${QUEUE.NEXT_PAGE}_${page}`)
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages),

        new ButtonBuilder()
            .setCustomId(`${QUEUE.LAST_PAGE}_${page}`)
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
    );

    // Row 2: Add entire queue to playlist and remove track
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(QUEUE.ADD_ALL_TO_PLAYLIST)
            .setEmoji('➕')
            .setLabel(shortenButtonLabel('Thêm tất cả vào Playlist', 40))
            .setStyle(ButtonStyle.Success)
            .setDisabled(!queue || (!queue.current && (!queue.tracks || queue.tracks.length === 0))),
        new ButtonBuilder()
            .setCustomId(QUEUE.REMOVE_TRACK)
            .setEmoji('🗑️')
            .setLabel(shortenButtonLabel('Xóa bài nhạc', 40))
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!queue || (!queue.current && (!queue.tracks || queue.tracks.length === 0)))
    );

    return [row1, row2];
}

/**
 * Get loop emoji based on mode
 * @param {string} mode - Loop mode (off, track, queue)
 * @returns {string} Emoji
 */
function getLoopEmoji(mode) {
    switch (mode) {
        case 'track':
            return '🔂';
        case 'queue':
            return '🔁';
        default:
            return '🔁';
    }
}

/**
 * Get loop label in Vietnamese based on mode
 * @param {string} mode - Loop mode (off, track, queue)
 * @returns {string} Vietnamese Label
 */
function getLoopLabelVi(mode) {
    switch (mode) {
        case 'track':
            return 'Bài hát';
        case 'queue':
            return 'Tất cả';
        default:
            return 'Tắt';
    }
}

/**
 * Create confirmation buttons for search result (Play, Details, Cancel)
 * @param {Object} track - The track to confirm
 * @returns {ActionRowBuilder[]} Array of action rows with buttons
 */
export function createSearchConfirmButtons(track) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(SEARCH.CONFIRM_PLAY)
            .setEmoji('✅')
            .setLabel('Phát ngay')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(SEARCH.SHOW_DETAILED)
            .setEmoji('ℹ️')
            .setLabel('Tìm kiếm thêm')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder().setCustomId(SEARCH.CANCEL).setEmoji('❌').setLabel('Hủy').setStyle(ButtonStyle.Danger)
    );

    return [row];
}

/**
 * Create search result buttons for up to 5 tracks
 * Each button id encodes the index to pick: search_pick_{index}
 * @param {Array} tracks - Array of track objects
 * @returns {ActionRowBuilder[]} Array of action rows with select menu and cancel button
 */
export function createSearchResultButtons(tracks) {
    // Create dropdown menu for song selection
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(SEARCH.SELECT)
        .setPlaceholder('🎵 Chọn bài hát bạn muốn phát')
        .setMinValues(1)
        .setMaxValues(1);

    // Add options (max 5 tracks)
    const max = Math.min(5, tracks.length);
    for (let i = 0; i < max; i++) {
        const track = tracks[i];
        const title = truncateTitle(track.info?.title || 'Unknown', 100);
        const author = truncateTitle(track.info?.author || 'Unknown', 50);
        const duration = track.info?.length
            ? `${Math.floor(track.info.length / 1000 / 60)}:${String(Math.floor((track.info.length / 1000) % 60)).padStart(2, '0')}`
            : 'Trực tiếp';

        selectMenu.addOptions({
            label: title,
            description: `${author} • ${duration}`,
            value: `${i}`,
            emoji: '🎵'
        });
    }

    const row1 = new ActionRowBuilder().addComponents(selectMenu);

    // Add cancel button
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(SEARCH.CANCEL)
            .setEmoji('❌')
            .setLabel(shortenButtonLabel('Hủy', 8))
            .setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

/**
 * Truncate a string to a maximum length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} [max=70] - Maximum length
 * @returns {string} Truncated string
 */
function truncateTitle(str, max = 70) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

/**
 * Create history replay dropdown for selecting tracks from history
 * @param {Array} history - Array of history entries { track, playedAt }
 * @returns {ActionRowBuilder[]} Array of action rows with dropdown and cancel button
 * @throws {Error} If history is empty or has no valid entries
 */
export function createHistoryReplayButtons(history) {
    // Validate history parameter
    if (!Array.isArray(history) || history.length === 0) {
        throw new Error('History must be a non-empty array');
    }

    // Create dropdown menu for history selection
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(HISTORY.REPLAY_SELECT)
        .setPlaceholder('🔄 Chọn bài hát từ lịch sử để phát lại')
        .setMinValues(1)
        .setMaxValues(1);

    // Add options (max 10 tracks from history)
    const max = Math.min(10, history.length);
    let validOptionsCount = 0;

    for (let i = 0; i < max; i++) {
        const entry = history[i];

        // Defensive check for entry structure
        if (!entry?.track?.info) {
            continue;
        }

        const track = entry.track;
        const title = truncateTitle(track.info.title || 'Unknown', 80);
        const author = truncateTitle(track.info.author || 'Unknown', 40);
        const duration =
            track.info.length && !track.info.isStream
                ? `${Math.floor(track.info.length / 1000 / 60)}:${String(Math.floor((track.info.length / 1000) % 60)).padStart(2, '0')}`
                : 'Trực tiếp';

        // Format played time with validation
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

        selectMenu.addOptions({
            label: title,
            description: `${author} • ${duration} • ${timeText}`,
            value: `${i}`,
            emoji: '🎵'
        });
        validOptionsCount++;
    }

    // If no valid options after filtering, throw error to prevent Discord API error
    if (validOptionsCount === 0) {
        throw new Error('No valid history entries found');
    }

    const row1 = new ActionRowBuilder().addComponents(selectMenu);

    // Add cancel button
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(HISTORY.REPLAY_CANCEL)
            .setEmoji('❌')
            .setLabel(shortenButtonLabel('Hủy', 8))
            .setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

/**
 * Create filter select menu
 * @param {Array<string>} activeFilters - Currently active filters
 * @returns {ActionRowBuilder[]} Array of action rows
 */
export function createFilterSelectMenu(activeFilters = []) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(MUSIC.FILTER_SELECT)
        .setPlaceholder('🎚️ Chọn hiệu ứng âm thanh')
        .setMinValues(1)
        .setMaxValues(1);

    const options = [
        { label: 'Tắt tất cả', value: 'clear', description: 'Xóa mọi hiệu ứng', emoji: '🚫' },
        { label: 'Bass Boost', value: 'bass', description: 'Tăng cường âm trầm', emoji: '🎸' },
        { label: 'Nightcore', value: 'nightcore', description: 'Tăng tốc độ & pitch', emoji: '🌙' },
        { label: 'Vaporwave', value: 'vaporwave', description: 'Giảm tốc độ & pitch', emoji: '🌊' },
        { label: 'Karaoke', value: 'karaoke', description: 'Loại bỏ giọng hát', emoji: '🎤' },
        { label: '8D Audio', value: '8d', description: 'Âm thanh xoay vòng', emoji: '🎧' },
        { label: 'Pop', value: 'pop', description: 'Equalizer Pop', emoji: '🎵' },
        { label: 'Rock', value: 'rock', description: 'Equalizer Rock', emoji: '🤘' },
        { label: 'Jazz', value: 'jazz', description: 'Equalizer Jazz', emoji: '🎷' }
    ];

    const activeSet = new Set(activeFilters.map(f => f.toLowerCase()));
    const finalOptions = options.map(opt => ({
        ...opt,
        label: activeSet.has(opt.value) ? `${opt.label} (Đang bật)` : opt.label,
        default: activeSet.has(opt.value)
    }));

    selectMenu.addOptions(finalOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return [row];
}

/**
 * Create volume select menu
 * @param {number} currentVol - Current volume
 * @returns {ActionRowBuilder[]} Array of action rows
 */
export function createVolumeSelectMenu(currentVol) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(MUSIC.VOLUME_SELECT)
        .setPlaceholder(`🔊 Âm lượng hiện tại: ${currentVol}%`)
        .setMinValues(1)
        .setMaxValues(1);

    const options = [
        { label: 'Tắt tiếng (0%)', value: '0', emoji: '🔇' },
        { label: 'Nhỏ (25%)', value: '25', emoji: '🔈' },
        { label: 'Vừa (50%)', value: '50', emoji: '🔉' },
        { label: 'Cao (75%)', value: '75', emoji: '🔊' },
        { label: 'Tối đa (100%)', value: '100', emoji: '🔊' }
    ];

    selectMenu.addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return [row];
}

export default {
    createMusicButtons,
    createNowPlayingButtons,
    createQueueButtons,
    createSearchResultButtons,
    createSearchConfirmButtons,
    createHistoryReplayButtons,
    createFilterSelectMenu,
    createVolumeSelectMenu
};
