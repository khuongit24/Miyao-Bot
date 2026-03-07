/**
 * Lyrics Service
 * Fetch lyrics from LRCLIB API with caching and intelligent fallback.
 *
 * @module lyrics
 * @version 1.9.0 - Added HTTP timeout (security fix H3), improved JSDoc
 */

import logger from './logger.js';

const LRCLIB_API_BASE = 'https://lrclib.net/api';
const USER_AGENT = 'Miyao Music Bot (https://github.com/khuongit24/miyao-bot)';

/**
 * HTTP request timeout in milliseconds.
 * Security fix H3: Prevents hung API calls from blocking the bot.
 * @type {number}
 */
const HTTP_TIMEOUT_MS = 5000;

// FIX-UTL-H01: Per-request AbortControllers instead of a singleton.
// Track active controllers so shutdown can abort them all.
const _activeLyricsControllers = new Set();

/**
 * Create a per-request AbortController, register it in the active set,
 * and return it.  Callers must call `_releaseController(controller)` when done.
 * @returns {AbortController}
 */
function _createRequestController() {
    const controller = new AbortController();
    _activeLyricsControllers.add(controller);
    return controller;
}

/**
 * Remove a controller from the active set (called after a fetch completes or fails).
 * @param {AbortController} controller
 */
function _releaseController(controller) {
    _activeLyricsControllers.delete(controller);
}

/**
 * Create a composite AbortSignal that aborts when any of the given signals abort.
 * Uses AbortSignal.any() on Node 20+ with manual fallback for Node 18.
 * P2-13: Node 18 compatibility fix
 * @param {AbortSignal[]} signals
 * @returns {AbortSignal}
 */
function _compositeSignal(signals) {
    if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any(signals);
    }
    // Manual composition fallback for Node 18
    const controller = new AbortController();
    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort(signal.reason);
            return controller.signal;
        }
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
}

/**
 * Cancel all pending lyrics fetch requests.
 * Called during graceful shutdown to prevent hanging requests.
 */
export function cancelPendingLyricsRequests() {
    for (const controller of _activeLyricsControllers) {
        controller.abort();
    }
    _activeLyricsControllers.clear();
    logger.debug('Cancelled all pending lyrics requests');
}

/**
 * Maximum allowed response size in bytes (1MB).
 * Prevents oversized responses from consuming memory.
 * @type {number}
 */
const MAX_RESPONSE_SIZE = 1024 * 1024;

// In-memory cache for lyrics (TTL: 1 hour, max 500 entries)
const lyricsCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_LYRICS_CACHE_SIZE = 500; // FIX-PB03: Prevent unbounded growth between hourly cleanups

/**
 * Generate cache key
 */
function getCacheKey(trackName, artistName, duration) {
    return `${trackName}:${artistName}:${duration || 0}`.toLowerCase();
}

/**
 * Try fetching lyrics with exact match API
 * @param {string} trackName - Track title
 * @param {string} artistName - Artist name
 * @param {string} albumName - Album name (optional)
 * @param {number} duration - Duration in seconds
 * @returns {Promise<Object|null>} Lyrics data or null
 */
async function tryExactMatch(trackName, artistName, albumName = '', duration = null) {
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

    const url = `${LRCLIB_API_BASE}/get?${params.toString()}`;

    // FIX-UTL-H01: Per-request AbortController
    const controller = _createRequestController();
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: _compositeSignal([AbortSignal.timeout(HTTP_TIMEOUT_MS), controller.signal]),
            redirect: 'error'
        });

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new Error(`LRCLIB API error: ${response.status} ${response.statusText}`);
        }

        // Enforce response size limit before parsing JSON
        const contentLength = parseInt(response.headers.get('content-length'), 10);
        if (contentLength && contentLength > MAX_RESPONSE_SIZE) {
            throw new Error(`LRCLIB response too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`);
        }

        const text = await response.text();
        if (text.length > MAX_RESPONSE_SIZE) {
            throw new Error(`LRCLIB response too large: ${text.length} chars (max ${MAX_RESPONSE_SIZE})`);
        }

        return JSON.parse(text);
    } finally {
        _releaseController(controller);
    }
}

/**
 * Try fetching lyrics with search API (fuzzy matching)
 * @param {string} query - Search query
 * @param {string} originalTrack - Original track name for matching
 * @param {string} originalArtist - Original artist for matching
 * @param {number} duration - Duration in milliseconds for matching
 * @returns {Promise<Object|null>} Best matching lyrics or null
 */
async function trySearchMatch(query, originalTrack, originalArtist, duration = null) {
    const params = new URLSearchParams({ q: query });
    const url = `${LRCLIB_API_BASE}/search?${params.toString()}`;

    // FIX-UTL-H01: Per-request AbortController
    const controller = _createRequestController();
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: _compositeSignal([AbortSignal.timeout(HTTP_TIMEOUT_MS), controller.signal]),
            redirect: 'error'
        });

        if (!response.ok) {
            return null;
        }

        // Enforce response size limit before parsing JSON
        const contentLength = parseInt(response.headers.get('content-length'), 10);
        if (contentLength && contentLength > MAX_RESPONSE_SIZE) {
            throw new Error(`LRCLIB search response too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`);
        }

        const rawText = await response.text();
        if (rawText.length > MAX_RESPONSE_SIZE) {
            throw new Error(`LRCLIB search response too large: ${rawText.length} chars (max ${MAX_RESPONSE_SIZE})`);
        }

        const results = JSON.parse(rawText);

        if (!results || results.length === 0) {
            return null;
        }

        // Score and find best match
        const originalTrackLower = originalTrack.toLowerCase();
        const originalArtistLower = originalArtist.toLowerCase();
        const durationSec = duration ? Math.round(duration / 1000) : null;

        let bestMatch = null;
        let bestScore = -1;

        for (const result of results) {
            let score = 0;

            const resultTrack = (result.trackName || '').toLowerCase();
            const resultArtist = (result.artistName || '').toLowerCase();

            // Track name similarity
            if (resultTrack === originalTrackLower) {
                score += 50;
            } else if (resultTrack.includes(originalTrackLower) || originalTrackLower.includes(resultTrack)) {
                score += 30;
            } else if (calculateSimilarity(resultTrack, originalTrackLower) > 0.7) {
                score += 20;
            }

            // Artist similarity
            if (resultArtist === originalArtistLower) {
                score += 40;
            } else if (resultArtist.includes(originalArtistLower) || originalArtistLower.includes(resultArtist)) {
                score += 25;
            } else if (calculateSimilarity(resultArtist, originalArtistLower) > 0.6) {
                score += 15;
            }

            // Duration match (±5 seconds tolerance)
            if (durationSec && result.duration) {
                const diff = Math.abs(result.duration - durationSec);
                if (diff <= 5) {
                    score += 20;
                } else if (diff <= 15) {
                    score += 10;
                }
            }

            // Prefer results with synced lyrics
            if (result.syncedLyrics) {
                score += 5;
            }

            // Must have some lyrics
            if (!result.plainLyrics && !result.syncedLyrics && !result.instrumental) {
                continue;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = result;
            }
        }

        // Require minimum confidence
        if (bestScore >= 30) {
            logger.debug('Search match found', {
                query,
                matchedTrack: bestMatch?.trackName,
                matchedArtist: bestMatch?.artistName,
                score: bestScore
            });
            return bestMatch;
        }

        return null;
    } finally {
        _releaseController(controller);
    }
}

/**
 * Calculate string similarity (Dice coefficient)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    // Use multiset (Map) instead of Set to preserve duplicate bigrams
    // for an accurate Dice coefficient calculation
    const getBigramCounts = str => {
        const counts = new Map();
        for (let i = 0; i < str.length - 1; i++) {
            const bigram = str.substring(i, i + 2);
            counts.set(bigram, (counts.get(bigram) || 0) + 1);
        }
        return counts;
    };

    const bigrams1 = getBigramCounts(str1);
    const bigrams2 = getBigramCounts(str2);

    let intersection = 0;
    for (const [bigram, count1] of bigrams1) {
        const count2 = bigrams2.get(bigram) || 0;
        intersection += Math.min(count1, count2);
    }

    const size1 = str1.length - 1;
    const size2 = str2.length - 1;

    return (2 * intersection) / (size1 + size2);
}

/**
 * Search for lyrics with multiple strategies
 * @param {string} trackName - Track title
 * @param {string} artistName - Artist name
 * @param {string} albumName - Album name (optional)
 * @param {number} duration - Duration in milliseconds
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

        logger.debug('Fetching lyrics from LRCLIB', { trackName, artistName });

        // Strategy 1: Try exact match with original names
        let data = await tryExactMatch(trackName, artistName, albumName, duration);

        // Strategy 2: Try exact match with cleaned names
        if (!data) {
            const cleanedTrack = cleanTrackName(trackName);
            const cleanedArtist = cleanArtistName(artistName);

            if (cleanedTrack !== trackName || cleanedArtist !== artistName) {
                logger.debug('Trying cleaned names', { cleanedTrack, cleanedArtist });
                data = await tryExactMatch(cleanedTrack, cleanedArtist, '', duration);
            }
        }

        // Strategy 3: Search API with "track artist" query
        if (!data) {
            const cleanedTrack = cleanTrackName(trackName);
            const cleanedArtist = cleanArtistName(artistName);
            const searchQuery = `${cleanedTrack} ${cleanedArtist}`;

            logger.debug('Trying search API', { searchQuery });
            data = await trySearchMatch(searchQuery, cleanedTrack, cleanedArtist, duration);
        }

        // Strategy 4: Search with just track name (for covers/remixes)
        if (!data) {
            const cleanedTrack = cleanTrackName(trackName);

            logger.debug('Trying track-only search', { cleanedTrack });
            data = await trySearchMatch(cleanedTrack, cleanedTrack, artistName, duration);
        }

        // Strategy 5: Extract main title (before " - " separator often used in YouTube)
        if (!data) {
            const dashParts = trackName.split(' - ');
            if (dashParts.length > 1) {
                // Try both parts as potential track names
                const part1 = cleanTrackName(dashParts[0]);
                const part2 = cleanTrackName(dashParts.slice(1).join(' - '));

                logger.debug('Trying dash-separated parts', { part1, part2 });

                // Try part2 as track, part1 as artist
                data = await trySearchMatch(`${part2} ${part1}`, part2, part1, duration);

                // Or part1 as track, part2 as artist
                if (!data) {
                    data = await trySearchMatch(`${part1} ${part2}`, part1, part2, duration);
                }
            }
        }

        // Cache the result (including null to avoid repeated API calls)
        // FIX-PB03: Evict oldest entry if cache exceeds max size
        if (lyricsCache.size >= MAX_LYRICS_CACHE_SIZE) {
            const oldestKey = lyricsCache.keys().next().value;
            lyricsCache.delete(oldestKey);
        }
        lyricsCache.set(cacheKey, { data, timestamp: Date.now() });

        if (data) {
            logger.info('Lyrics fetched and cached', {
                trackName: data.trackName,
                hasPlainLyrics: !!data.plainLyrics,
                hasSyncedLyrics: !!data.syncedLyrics,
                instrumental: data.instrumental
            });
        } else {
            logger.debug('Lyrics not found after all strategies', { trackName, artistName });
        }

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
}, CACHE_TTL).unref();

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

        // FIX-UTL-H01: Per-request AbortController
        const controller = _createRequestController();
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': USER_AGENT
                },
                signal: _compositeSignal([AbortSignal.timeout(HTTP_TIMEOUT_MS), controller.signal]),
                redirect: 'error'
            });

            if (!response.ok) {
                throw new Error(`LRCLIB API error: ${response.status} ${response.statusText}`);
            }

            // Enforce response size limit before parsing JSON
            const cl = parseInt(response.headers.get('content-length'), 10);
            if (cl && cl > MAX_RESPONSE_SIZE) {
                throw new Error(`LRCLIB search response too large: ${cl} bytes (max ${MAX_RESPONSE_SIZE})`);
            }

            const bodyText = await response.text();
            if (bodyText.length > MAX_RESPONSE_SIZE) {
                throw new Error(
                    `LRCLIB search response too large: ${bodyText.length} chars (max ${MAX_RESPONSE_SIZE})`
                );
            }

            const data = JSON.parse(bodyText);

            logger.debug('Lyrics search completed', { results: data.length });

            return data;
        } finally {
            _releaseController(controller);
        }
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
        return syncedLyrics
            .slice(0, contextLines + 1)
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

    // Remove common parenthetical/bracket suffixes
    const patterns = [
        // Video/Audio related
        /\s*\(.*?official.*?\)/gi,
        /\s*\[.*?official.*?\]/gi,
        /\s*-\s*official.*/gi,
        /\s*\(.*?video.*?\)/gi,
        /\s*\[.*?video.*?\]/gi,
        /\s*\(.*?audio.*?\)/gi,
        /\s*\[.*?audio.*?\]/gi,
        /\s*\(.*?lyrics?.*?\)/gi,
        /\s*\[.*?lyrics?.*?\]/gi,
        /\s*\(.*?\bm\/?v\b.*?\)/gi,
        /\s*\[.*?\bm\/?v\b.*?\]/gi,

        // Quality indicators
        /\s*\(.*?\bhd\b.*?\)/gi,
        /\s*\[.*?\bhd\b.*?\]/gi,
        /\s*\(.*?4k.*?\)/gi,
        /\s*\[.*?4k.*?\]/gi,
        /\s*\(.*?1080p.*?\)/gi,
        /\s*\[.*?1080p.*?\]/gi,
        /\s*\(.*?720p.*?\)/gi,
        /\s*\[.*?720p.*?\]/gi,

        // Version indicators
        /\s*\(.*?remix.*?\)/gi,
        /\s*\[.*?remix.*?\]/gi,
        /\s*\(.*?cover.*?\)/gi,
        /\s*\[.*?cover.*?\]/gi,
        /\s*\(.*?live.*?\)/gi,
        /\s*\[.*?live.*?\]/gi,
        /\s*\(.*?acoustic.*?\)/gi,
        /\s*\[.*?acoustic.*?\]/gi,
        /\s*\(.*?unplugged.*?\)/gi,
        /\s*\[.*?unplugged.*?\]/gi,
        /\s*\(.*?version.*?\)/gi,
        /\s*\[.*?version.*?\]/gi,
        /\s*\(.*?edit.*?\)/gi,
        /\s*\[.*?edit.*?\]/gi,
        /\s*\(.*?extended.*?\)/gi,
        /\s*\[.*?extended.*?\]/gi,
        /\s*\(.*?radio.*?\)/gi,
        /\s*\[.*?radio.*?\]/gi,

        // Year indicators
        /\s*\(\d{4}\)/gi,
        /\s*\[\d{4}\]/gi,

        // Platform specific
        /\s*\(.*?music video.*?\)/gi,
        /\s*\[.*?music video.*?\]/gi,
        /\s*\(.*?visualizer.*?\)/gi,
        /\s*\[.*?visualizer.*?\]/gi,
        /\s*\(.*?performance.*?\)/gi,
        /\s*\[.*?performance.*?\]/gi,

        // Korean/Vietnamese specific
        /\s*\(.*?ost.*?\)/gi,
        /\s*\[.*?ost.*?\]/gi,
        /\s*\(.*?from.*?\)/gi,
        /\s*\[.*?from.*?\]/gi,
        /\s*\(.*?nhạc phim.*?\)/gi,
        /\s*\[.*?nhạc phim.*?\]/gi,

        // Remaster indicators
        /\s*\(.*?remaster.*?\)/gi,
        /\s*\[.*?remaster.*?\]/gi,
        /\s*\(.*?reissue.*?\)/gi,
        /\s*\[.*?reissue.*?\]/gi,

        // Clean up trailing dash and content
        /\s+-\s+(?:lyrics?|official|video|audio|m\/v|mv|hd).*$/gi
    ];

    patterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });

    // Remove feat./ft. at the end only (keep collaborators in title)
    cleaned = cleaned.replace(/\s*[([]?(?:feat\.?|ft\.?|featuring)\s+.+?[)\]]?\s*$/gi, '');

    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    return cleaned.trim();
}

/**
 * Clean artist name for lyrics search
 * @param {string} artist - Original artist name
 * @returns {string} Cleaned artist name
 */
export function cleanArtistName(artist) {
    if (!artist) return '';

    let cleaned = artist;

    // Remove featuring/collaboration parts
    // Note: '&' is intentionally excluded — it's too ambiguous (e.g. "Simon & Garfunkel")
    // 'x'/'×' are also excluded as they appear in legitimate artist names
    cleaned = cleaned.replace(/\s*(?:feat\.?|ft\.?|featuring|vs\.?|with)\s+.*/gi, '');
    cleaned = cleaned.replace(/\s*,\s+.*/g, '');

    // Remove "- Topic" suffix from YouTube auto-generated channels
    cleaned = cleaned.replace(/\s*-\s*Topic$/i, '');

    // Remove VEVO suffix
    cleaned = cleaned.replace(/VEVO$/i, '');

    // Remove "Official" suffix
    cleaned = cleaned.replace(/\s*(?:Official|Channel|Music)$/gi, '');

    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    return cleaned.trim();
}

export default {
    getLyrics,
    searchLyrics,
    paginateLyrics,
    parseSyncedLyrics,
    getCurrentLyricLine,
    formatSyncedLyrics,
    cleanTrackName,
    cleanArtistName
};
