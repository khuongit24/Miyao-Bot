/**
 * Lyrics Service
 * Fetch lyrics from LRCLIB API with caching and intelligent fallback
 */

import logger from '../utils/logger.js';

const LRCLIB_API_BASE = 'https://lrclib.net/api';
const USER_AGENT = 'Miyao Music Bot (https://github.com/khuongit24/miyao-bot)';

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

    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`LRCLIB API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
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

    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) {
        return null;
    }

    const results = await response.json();

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
}

/**
 * Calculate string similarity (Dice coefficient)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const bigrams1 = new Set();
    const bigrams2 = new Set();

    for (let i = 0; i < str1.length - 1; i++) {
        bigrams1.add(str1.substring(i, i + 2));
    }
    for (let i = 0; i < str2.length - 1; i++) {
        bigrams2.add(str2.substring(i, i + 2));
    }

    let intersection = 0;
    for (const bigram of bigrams1) {
        if (bigrams2.has(bigram)) intersection++;
    }

    return (2 * intersection) / (bigrams1.size + bigrams2.size);
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
    cleaned = cleaned.replace(/\s*[\(\[]?(?:feat\.?|ft\.?|featuring)\s+.+?[\)\]]?\s*$/gi, '');

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
    cleaned = cleaned.replace(/\s*(?:feat\.?|ft\.?|featuring|&|,|x|×|vs\.?|with)\s+.*/gi, '');

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
