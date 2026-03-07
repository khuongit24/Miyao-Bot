import History from '../database/models/History.js';
import logger from './logger.js';
import { PLATFORM_EMOJIS } from './constants.js';

/**
 * URL patterns for different music platforms.
 * v1.11.0: Added Bandcamp, Deezer, Twitch, Vimeo, HTTP Stream patterns.
 */
export const URL_PATTERNS = {
    // === EXISTING ===
    SPOTIFY_TRACK: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/,
    SPOTIFY_ALBUM: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?album\/([a-zA-Z0-9]+)/,
    SPOTIFY_PLAYLIST: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/,
    SPOTIFY_ARTIST: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?artist\/([a-zA-Z0-9]+)/,
    SOUNDCLOUD: /^https?:\/\/(www\.)?soundcloud\.com\//,
    YOUTUBE: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//,

    // === NEW v1.11.0 ===
    BANDCAMP: /^https?:\/\/([a-zA-Z0-9-]+\.)?bandcamp\.com\/(track|album)\//,
    DEEZER: /^https?:\/\/(www\.)?deezer\.com\/(track|album|playlist|artist)\/\d+/,
    DEEZER_SHARE: /^https?:\/\/deezer\.page\.link\//,
    TWITCH: /^https?:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]+/,
    VIMEO: /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
    HTTP_STREAM: /^https?:\/\/.+\.(mp3|ogg|flac|wav|aac|m3u8|opus)(\?.*)?$/i
};

/**
 * Detect the platform and type from a query string.
 * Handles URLs from all supported platforms and text search queries.
 * v1.11.0: Added Bandcamp, Deezer, Twitch, Vimeo, HTTP Stream detection.
 *
 * @param {string} query - URL or search text
 * @returns {{ platform: string, type: string, isUrl: boolean }}
 */
export function detectPlatform(query) {
    if (!query || typeof query !== 'string') {
        return { platform: 'unknown', type: 'unknown', isUrl: false };
    }

    const trimmed = query.trim();

    // URL detection
    if (/^https?:\/\//i.test(trimmed)) {
        // Spotify (4 types)
        if (URL_PATTERNS.SPOTIFY_TRACK.test(trimmed)) return { platform: 'spotify', type: 'track', isUrl: true };
        if (URL_PATTERNS.SPOTIFY_ALBUM.test(trimmed)) return { platform: 'spotify', type: 'album', isUrl: true };
        if (URL_PATTERNS.SPOTIFY_PLAYLIST.test(trimmed)) return { platform: 'spotify', type: 'playlist', isUrl: true };
        if (URL_PATTERNS.SPOTIFY_ARTIST.test(trimmed)) return { platform: 'spotify', type: 'artist', isUrl: true };

        // YouTube (with playlist/mix detection)
        if (URL_PATTERNS.YOUTUBE.test(trimmed)) {
            const isPlaylist = trimmed.includes('list=');
            const isMix = trimmed.includes('start_radio=');
            if (isPlaylist || isMix) return { platform: 'youtube', type: 'playlist', isUrl: true };
            return { platform: 'youtube', type: 'track', isUrl: true };
        }

        // SoundCloud (with sets/likes detection)
        if (URL_PATTERNS.SOUNDCLOUD.test(trimmed)) {
            const isSet = trimmed.includes('/sets/');
            const isLikes = trimmed.includes('/likes');
            if (isSet) return { platform: 'soundcloud', type: 'playlist', isUrl: true };
            if (isLikes) return { platform: 'soundcloud', type: 'likes', isUrl: true };
            return { platform: 'soundcloud', type: 'track', isUrl: true };
        }

        // Bandcamp (NEW v1.11.0)
        if (URL_PATTERNS.BANDCAMP.test(trimmed)) {
            const isAlbum = trimmed.includes('/album/');
            return { platform: 'bandcamp', type: isAlbum ? 'album' : 'track', isUrl: true };
        }

        // Deezer (NEW v1.11.0)
        if (URL_PATTERNS.DEEZER.test(trimmed) || URL_PATTERNS.DEEZER_SHARE.test(trimmed)) {
            let type = 'track';
            if (trimmed.includes('/album/')) type = 'album';
            else if (trimmed.includes('/playlist/')) type = 'playlist';
            else if (trimmed.includes('/artist/')) type = 'artist';
            return { platform: 'deezer', type, isUrl: true };
        }

        // Twitch (NEW v1.11.0)
        if (URL_PATTERNS.TWITCH.test(trimmed)) {
            return { platform: 'twitch', type: 'stream', isUrl: true };
        }

        // Vimeo (NEW v1.11.0)
        if (URL_PATTERNS.VIMEO.test(trimmed)) {
            return { platform: 'vimeo', type: 'video', isUrl: true };
        }

        // HTTP audio stream (NEW v1.11.0)
        if (URL_PATTERNS.HTTP_STREAM.test(trimmed)) {
            return { platform: 'http', type: 'stream', isUrl: true };
        }

        // Unknown URL — still pass to Lavalink, may be supported
        return { platform: 'unknown', type: 'url', isUrl: true };
    }

    // Text query → search
    return { platform: 'search', type: 'query', isUrl: false };
}

/**
 * Get platform emoji for display in embeds.
 * v1.11.0: Uses centralized PLATFORM_EMOJIS from constants.
 *
 * @param {string} platform - Platform name
 * @returns {string} Emoji icon
 */
export function getPlatformEmoji(platform) {
    return PLATFORM_EMOJIS[platform] || PLATFORM_EMOJIS.unknown;
}

/**
 * Create a text-based progress bar
 * @param {number} percent - Progress percentage (0-100)
 * @param {number} length - Bar length in characters
 * @returns {string} Progress bar string
 */
export function createProgressBar(percent, length = 20) {
    // BUG-S11: Handle NaN/Infinity from zero-length tracks (livestreams)
    if (!Number.isFinite(percent) || percent < 0) {
        percent = 0;
    }
    percent = Math.min(100, percent);

    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Extract potential artist name from search query
 * @param {string} query - The search query
 * @returns {string|null} Potential artist name or null
 */
export function extractArtistFromQuery(query) {
    // Common patterns: "artist - song", "song by artist", "artist song"
    const patterns = [
        /^(.+?)\s*-\s*.+$/i, // "Artist - Song"
        /^.+?\s+by\s+(.+)$/i, // "Song by Artist"
        /^(.+?)\s+(official|music|video|audio|lyrics)/i // "Artist official"
    ];

    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    // Fallback: take first 1-2 words if query has 3+ words
    const words = query.split(/\s+/);
    if (words.length >= 3) {
        return words.slice(0, 2).join(' ');
    }

    return null;
}

/**
 * Get smart suggestions based on user history and query
 * @param {string} query - The search query that returned no results
 * @param {string} userId - The user ID
 * @param {string} guildId - The guild ID
 * @returns {Array} Array of suggestion objects
 */
export function getSmartSuggestions(query, userId, guildId) {
    const suggestions = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    // 1. Get user's history and find similar tracks
    let userHistory = [];
    try {
        userHistory = History.getUserHistory(userId, 50) || [];
    } catch (error) {
        logger.debug('Failed to fetch user history for suggestions', { userId, error: error.message });
    }

    if (userHistory.length > 0) {
        // Find tracks that match any word in the query
        const historyMatches = userHistory
            .filter(entry => {
                const titleLower = (entry.track_title || '').toLowerCase();
                const authorLower = (entry.track_author || '').toLowerCase();

                // Check if any query word is in title or author
                return queryWords.some(word => titleLower.includes(word) || authorLower.includes(word));
            })
            .slice(0, 3);

        // Add history matches
        historyMatches.forEach(entry => {
            suggestions.push({
                type: 'history',
                title: entry.track_title,
                author: entry.track_author,
                url: entry.track_url,
                score: 10 // High priority for history matches
            });
        });
    }

    // 2. Get guild's popular tracks
    let popularTracks = [];
    try {
        popularTracks = History.getMostPlayed(guildId, 5, 'week') || [];
    } catch (error) {
        logger.debug('Failed to fetch popular tracks for suggestions', { guildId, error: error.message });
    }

    if (popularTracks.length > 0) {
        // Filter out already suggested and add some popular tracks
        const existingUrls = new Set(suggestions.map(s => s.url));

        popularTracks.slice(0, 3).forEach(entry => {
            if (!existingUrls.has(entry.track_url)) {
                suggestions.push({
                    type: 'popular',
                    title: entry.track_title,
                    author: entry.track_author,
                    url: entry.track_url,
                    playCount: entry.play_count,
                    score: 5
                });
            }
        });
    }

    // 3. Try to extract artist and suggest artist's tracks
    const artistName = extractArtistFromQuery(query);
    if (artistName) {
        const artistLower = artistName.toLowerCase();

        // Look for tracks by this artist in history
        const artistTracks = userHistory
            .filter(entry => {
                const authorLower = (entry.track_author || '').toLowerCase();
                return authorLower.includes(artistLower);
            })
            .slice(0, 3);

        artistTracks.forEach(entry => {
            const existingUrls = new Set(suggestions.map(s => s.url));
            if (!existingUrls.has(entry.track_url)) {
                suggestions.push({
                    type: 'artist',
                    title: entry.track_title,
                    author: entry.track_author,
                    url: entry.track_url,
                    score: 8
                });
            }
        });
    }

    // Sort by score and return
    return suggestions.sort((a, b) => b.score - a.score);
}
