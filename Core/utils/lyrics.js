/**
 * Lyrics Service
 * Fetch lyrics from LRCLIB API with caching
 */

import logger from '../utils/logger.js';

const LRCLIB_API_BASE = 'https://lrclib.net/api';
const USER_AGENT = 'Miyao Music Bot v1.5.0 (https://github.com/your-repo/miyao-bot)';

// In-memory cache for lyrics (TTL: 1 hour)
const lyricsCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Generate cache key
 */
function getCacheKey(trackName, artistName, duration) {
    return `${trackName}:${artistName}:${duration || 0}`.toLowerCase();
}

/**
 * Search for lyrics
 * @param {string} trackName - Track title
 * @param {string} artistName - Artist name
 * @param {string} albumName - Album name (optional)
 * @param {number} duration - Duration in seconds
 * @returns {Promise<Object|null>} Lyrics data or null
 */
export async function getLyrics(trackName, artistName, albumName = '', duration = null) {
    try {
        // Check cache first
        const cacheKey = getCacheKey(trackName, artistName, duration);
        const cached = lyricsCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            logger.debug('Lyrics cache hit', { trackName, artistName });
            return cached.data;
        }

        // Build query parameters
        const params = new URLSearchParams({
            track_name: trackName,
            artist_name: artistName
        });

        if (albumName) {
            params.append('album_name', albumName);
        }

        if (duration) {
            params.append('duration', Math.round(duration / 1000)); // Convert ms to seconds
        }

        // Fetch from API
        const url = `${LRCLIB_API_BASE}/get?${params.toString()}`;
        
        logger.debug('Fetching lyrics from LRCLIB', { trackName, artistName });

        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT
            }
        });

        if (response.status === 404) {
            logger.debug('Lyrics not found', { trackName, artistName });
            // Cache null result to avoid repeated API calls
            lyricsCache.set(cacheKey, { data: null, timestamp: Date.now() });
            return null;
        }

        if (!response.ok) {
            throw new Error(`LRCLIB API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Cache the result
        lyricsCache.set(cacheKey, { data, timestamp: Date.now() });

        logger.info('Lyrics fetched and cached', { 
            trackName: data.trackName,
            hasPlainLyrics: !!data.plainLyrics,
            hasSyncedLyrics: !!data.syncedLyrics,
            instrumental: data.instrumental
        });

        return data;

    } catch (error) {
        logger.error('Failed to fetch lyrics', error);
        return null;
    }
}

/**
 * Clear lyrics cache (for memory management)
 */
export function clearLyricsCache() {
    const size = lyricsCache.size;
    lyricsCache.clear();
    logger.info('Lyrics cache cleared', { entriesRemoved: size });
}

// Auto-cleanup old cache entries every hour
setInterval(() => {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, value] of lyricsCache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
            lyricsCache.delete(key);
            removed++;
        }
    }
    
    if (removed > 0) {
        logger.debug('Lyrics cache cleanup', { removed, remaining: lyricsCache.size });
    }
}, CACHE_TTL);

/**
 * Search for lyrics by keyword
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of lyrics results
 */
export async function searchLyrics(query) {
    try {
        const params = new URLSearchParams({ q: query });
        const url = `${LRCLIB_API_BASE}/search?${params.toString()}`;

        logger.debug('Searching lyrics', { query });

        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT
            }
        });

        if (!response.ok) {
            throw new Error(`LRCLIB API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        logger.debug('Lyrics search completed', { results: data.length });

        return data;

    } catch (error) {
        logger.error('Failed to search lyrics', error);
        return [];
    }
}

/**
 * Format plain lyrics for display (paginated)
 * @param {string} lyrics - Plain lyrics text
 * @param {number} linesPerPage - Lines per page (default 20)
 * @returns {Array<string>} Array of pages
 */
export function paginateLyrics(lyrics, linesPerPage = 20) {
    if (!lyrics) return [];

    const lines = lyrics.split('\n');
    const pages = [];

    for (let i = 0; i < lines.length; i += linesPerPage) {
        const page = lines.slice(i, i + linesPerPage).join('\n');
        pages.push(page);
    }

    return pages;
}

/**
 * Parse synced lyrics (LRC format)
 * @param {string} syncedLyrics - Synced lyrics in LRC format
 * @returns {Array<Object>} Array of {time, text} objects
 */
export function parseSyncedLyrics(syncedLyrics) {
    if (!syncedLyrics) return [];

    const lines = syncedLyrics.split('\n');
    const parsed = [];

    // LRC format: [mm:ss.xx] text
    const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{2})\](.*)/;

    for (const line of lines) {
        const match = line.match(lrcRegex);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const centiseconds = parseInt(match[3]);
            const text = match[4].trim();

            const timeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;

            parsed.push({
                time: timeMs,
                text: text
            });
        }
    }

    return parsed.sort((a, b) => a.time - b.time);
}

/**
 * Get current lyric line for a given position
 * @param {Array<Object>} syncedLyrics - Parsed synced lyrics
 * @param {number} positionMs - Current position in milliseconds
 * @returns {Object|null} Current line {time, text} or null
 */
export function getCurrentLyricLine(syncedLyrics, positionMs) {
    if (!syncedLyrics || syncedLyrics.length === 0) return null;

    // Find the line that should be displayed at this position
    let currentLine = null;

    for (let i = 0; i < syncedLyrics.length; i++) {
        if (syncedLyrics[i].time <= positionMs) {
            currentLine = syncedLyrics[i];
        } else {
            break;
        }
    }

    return currentLine;
}

/**
 * Format synced lyrics with highlighting
 * @param {Array<Object>} syncedLyrics - Parsed synced lyrics
 * @param {number} positionMs - Current position
 * @param {number} contextLines - Number of lines to show before/after current
 * @returns {string} Formatted lyrics with current line highlighted
 */
export function formatSyncedLyrics(syncedLyrics, positionMs, contextLines = 3) {
    if (!syncedLyrics || syncedLyrics.length === 0) return '';

    // Find current line index
    let currentIndex = -1;
    for (let i = 0; i < syncedLyrics.length; i++) {
        if (syncedLyrics[i].time <= positionMs) {
            currentIndex = i;
        } else {
            break;
        }
    }

    if (currentIndex === -1) {
        // Before first line
        return syncedLyrics.slice(0, contextLines + 1)
            .map(line => line.text)
            .join('\n');
    }

    // Get context lines
    const start = Math.max(0, currentIndex - contextLines);
    const end = Math.min(syncedLyrics.length, currentIndex + contextLines + 1);

    const lines = [];
    for (let i = start; i < end; i++) {
        if (i === currentIndex) {
            lines.push(`**► ${syncedLyrics[i].text}**`); // Highlight current
        } else {
            lines.push(`   ${syncedLyrics[i].text}`);
        }
    }

    return lines.join('\n');
}

/**
 * Clean track name for lyrics search (remove extras)
 * @param {string} title - Original title
 * @returns {string} Cleaned title
 */
export function cleanTrackName(title) {
    if (!title) return '';

    let cleaned = title;

    // Remove common suffixes
    const patterns = [
        /\s*\(.*?official.*?\)/gi,
        /\s*\[.*?official.*?\]/gi,
        /\s*-\s*official.*/gi,
        /\s*\(.*?video.*?\)/gi,
        /\s*\[.*?video.*?\]/gi,
        /\s*\(.*?audio.*?\)/gi,
        /\s*\[.*?audio.*?\]/gi,
        /\s*\(.*?lyrics.*?\)/gi,
        /\s*\[.*?lyrics.*?\]/gi,
        /\s*\(.*?mv.*?\)/gi,
        /\s*\[.*?mv.*?\]/gi,
        /\s*\(.*?hd.*?\)/gi,
        /\s*\[.*?hd.*?\]/gi,
        /\s*\(.*?4k.*?\)/gi,
        /\s*\[.*?4k.*?\]/gi
    ];

    patterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim();
}

export default {
    getLyrics,
    searchLyrics,
    paginateLyrics,
    parseSyncedLyrics,
    getCurrentLyricLine,
    formatSyncedLyrics,
    cleanTrackName
};
