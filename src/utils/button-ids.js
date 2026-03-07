/**
 * Button Custom ID Constants
 * Centralized constants for all Discord button, select menu, and modal custom IDs.
 * Eliminates magic strings scattered throughout the codebase.
 *
 * @module button-ids
 * @version 1.9.0
 */

// ─────────────────────────────────────────────────────────
// Music Player Controls
// ─────────────────────────────────────────────────────────

export const MUSIC = {
    PAUSE: 'music_pause',
    RESUME: 'music_resume',
    STOP: 'music_stop',
    SKIP: 'music_skip',
    PREVIOUS: 'music_previous',
    LOOP: 'music_loop',
    SHUFFLE: 'music_shuffle',
    VOLUME_UP: 'music_volume_up',
    VOLUME_DOWN: 'music_volume_down',
    QUEUE: 'music_queue',
    LYRICS: 'music_lyrics',
    REPLAY: 'music_replay',
    LIKE: 'music_like',
    ADD_TO_PLAYLIST: 'music_add_to_playlist',
    SETTINGS: 'music_settings',
    FILTER_SELECT: 'music_filter_select',
    VOLUME_SELECT: 'music_volume_select'
};

// ─────────────────────────────────────────────────────────
// Seek Controls
// ─────────────────────────────────────────────────────────

export const SEEK = {
    BACKWARD_30: 'music_seek_backward_30',
    BACKWARD_10: 'music_seek_backward_10',
    START: 'music_seek_start',
    FORWARD_10: 'music_seek_forward_10',
    FORWARD_30: 'music_seek_forward_30'
};

// ─────────────────────────────────────────────────────────
// Queue Controls
// ─────────────────────────────────────────────────────────

export const QUEUE = {
    PREVIOUS_PAGE: 'queue_previous',
    NEXT_PAGE: 'queue_next',
    FIRST_PAGE: 'queue_first',
    LAST_PAGE: 'queue_last',
    REFRESH: 'queue_refresh',
    REMOVE_TRACK: 'queue_remove_track',
    ADD_ALL_TO_PLAYLIST: 'queue_add_to_playlist'
};

// ─────────────────────────────────────────────────────────
// Search & Discovery
// ─────────────────────────────────────────────────────────

export const SEARCH = {
    /** Prefix for search result selection: `search_pick_{index}` */
    PICK_PREFIX: 'search_pick_',
    CONFIRM_PLAY: 'search_confirm_play',
    SHOW_DETAILED: 'search_show_detailed',
    CANCEL: 'search_cancel',
    SELECT: 'search_select'
};

export const DISCOVERY = {
    /** Prefix for discovery track selection */
    SELECT_PREFIX: 'discovery_select_',
    PLAY_ALL: 'discovery_play_all',
    SHUFFLE_ALL: 'discovery_shuffle_all',
    REFRESH: 'discovery_refresh'
};

// ─────────────────────────────────────────────────────────
// Playlist Management
// ─────────────────────────────────────────────────────────

export const PLAYLIST = {
    /** Prefix: `playlist_play_{id}` */
    PLAY_PREFIX: 'playlist_play_',
    /** Prefix: `playlist_add_track_to_{id}` */
    ADD_TRACK_PREFIX: 'playlist_add_track_to_',
    /** Prefix: `playlist_remove_track_{id}` */
    REMOVE_TRACK_PREFIX: 'playlist_remove_track_',
    /** Prefix: `playlist_edit_{id}` */
    EDIT_PREFIX: 'playlist_edit_',
    /** Prefix: `playlist_shuffle_{id}` */
    SHUFFLE_PREFIX: 'playlist_shuffle_',
    /** Prefix: `playlist_clone_{id}` */
    CLONE_PREFIX: 'playlist_clone_',

    // Modal submissions
    /** Prefix: `playlist_remove_track_submit_{id}` */
    REMOVE_TRACK_SUBMIT_PREFIX: 'playlist_remove_track_submit_',
    /** Prefix: `playlist_add_track_to_submit_{id}` */
    ADD_TRACK_SUBMIT_PREFIX: 'playlist_add_track_to_submit_',
    /** Prefix: `playlist_edit_submit_{id}` */
    EDIT_SUBMIT_PREFIX: 'playlist_edit_submit_',
    /** Prefix: `playlist_clone_submit_{id}` */
    CLONE_SUBMIT_PREFIX: 'playlist_clone_submit_'
};

// ─────────────────────────────────────────────────────────
// Lyrics
// ─────────────────────────────────────────────────────────

export const LYRICS = {
    PREVIOUS_PAGE: 'lyrics_prev',
    NEXT_PAGE: 'lyrics_next',
    TOGGLE_SYNC: 'lyrics_toggle_sync'
};

// ─────────────────────────────────────────────────────────
// History & Replay
// ─────────────────────────────────────────────────────────

export const HISTORY = {
    /** Select menu ID for history replay */
    REPLAY_SELECT: 'history_replay_select',
    REPLAY_CANCEL: 'history_replay_cancel'
};

// ─────────────────────────────────────────────────────────
// Help & Navigation
// ─────────────────────────────────────────────────────────

export const HELP = {
    CATEGORY_SELECT: 'help_category_select',
    BACK: 'help_back',
    HOME: 'help_home'
};

// ─────────────────────────────────────────────────────────
// Select Menus (v1.9.0 new)
// ─────────────────────────────────────────────────────────

export const SELECT_MENUS = {
    VOLUME_QUICK: 'volume_quick',
    FILTER_QUICK: 'filter_quick',
    EQ_QUICK: 'eq_quick'
};

// ─────────────────────────────────────────────────────────
// Auto-Play Preferences (v1.9.3)
// ─────────────────────────────────────────────────────────

export const AUTOPLAY_PREF_BUTTONS = {
    /** User accepts the auto-play suggestion */
    SUGGESTION_ACCEPT: 'ap_suggest_accept',
    /** User dismisses the auto-play suggestion ("No thanks") */
    SUGGESTION_DISMISS: 'ap_suggest_dismiss',
    /** User confirms disabling auto-play after instant skip */
    DISABLE_CONFIRM: 'ap_disable_confirm',
    /** User keeps auto-play after instant skip prompt */
    DISABLE_CANCEL: 'ap_disable_cancel',
    /** Prefix for disabling a specific track in /mypreferences: `ap_pref_disable_{index}` */
    PREF_DISABLE_PREFIX: 'ap_pref_disable_',
    /** Pagination: previous page in /mypreferences */
    PREF_PREV_PAGE: 'ap_pref_prev',
    /** Pagination: next page in /mypreferences */
    PREF_NEXT_PAGE: 'ap_pref_next',
    /** Disable all auto-play preferences */
    PREF_DISABLE_ALL: 'ap_pref_disable_all'
};

/**
 * Check if a custom ID matches a prefix pattern.
 *
 * @param {string} customId - The button/select custom ID
 * @param {string} prefix - The prefix to match against
 * @returns {boolean} Whether the custom ID starts with the prefix
 *
 * @example
 * if (matchesPrefix(customId, PLAYLIST.PLAY_PREFIX)) {
 *     const playlistId = customId.slice(PLAYLIST.PLAY_PREFIX.length);
 * }
 */
export function matchesPrefix(customId, prefix) {
    return customId.startsWith(prefix);
}

/**
 * Extract the ID portion from a prefixed custom ID.
 *
 * @param {string} customId - The button/select custom ID
 * @param {string} prefix - The prefix to strip
 * @returns {string} The extracted ID portion
 *
 * @example
 * const playlistId = extractId('playlist_play_abc123', PLAYLIST.PLAY_PREFIX);
 * // returns 'abc123'
 */
export function extractId(customId, prefix) {
    return customId.slice(prefix.length);
}

export default {
    MUSIC,
    SEEK,
    QUEUE,
    SEARCH,
    DISCOVERY,
    PLAYLIST,
    LYRICS,
    HISTORY,
    HELP,
    SELECT_MENUS,
    AUTOPLAY_PREF_BUTTONS,
    matchesPrefix,
    extractId
};
