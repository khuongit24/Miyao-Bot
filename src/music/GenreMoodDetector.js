/**
 * @file GenreMoodDetector.js
 * @description Content-analysis utilities for detecting genre, mood, and filtering non-music content.
 * Extracted from RecommendationEngine.js for single-responsibility principle.
 * @version 1.9.0
 */

/**
 * Genre patterns for detection
 * Maps canonical genre names to keyword arrays
 * @type {Object.<string, string[]>}
 */
export const GENRE_PATTERNS = {
    kpop: [
        'kpop',
        'k-pop',
        'korean',
        'bts',
        'blackpink',
        'twice',
        'exo',
        'nct',
        'aespa',
        'stray kids',
        'itzy',
        'ive',
        'newjeans',
        '아이돌',
        '케이팝'
    ],
    vpop: ['vpop', 'v-pop', 'việt', 'vietnamese', 'nhạc việt', 'nhạc trẻ', 'bolero'],
    jpop: ['jpop', 'j-pop', 'japanese', 'anime', 'アニメ', 'ost'],
    cpop: ['cpop', 'c-pop', 'chinese', 'mandarin', '华语', '中文'],
    pop: ['pop', 'top 40', 'mainstream', 'chart'],
    hiphop: ['hip hop', 'hiphop', 'rap', 'trap', 'drill', 'boom bap', 'mumble'],
    rnb: ['r&b', 'rnb', 'soul', 'neo soul', 'contemporary r&b'],
    rock: ['rock', 'metal', 'punk', 'alternative', 'indie rock', 'grunge', 'hard rock'],
    edm: ['edm', 'electronic', 'house', 'techno', 'dubstep', 'trance', 'bass', 'electro'],
    lofi: ['lofi', 'lo-fi', 'chill', 'relaxing', 'study', 'chillhop'],
    jazz: ['jazz', 'smooth jazz', 'bebop', 'swing'],
    classical: ['classical', 'orchestra', 'symphony', 'piano', 'violin', 'baroque'],
    acoustic: ['acoustic', 'unplugged', 'guitar', 'singer-songwriter'],
    ballad: ['ballad', 'slow', 'romantic', 'love song', 'sad', 'emotional'],
    dance: ['dance', 'club', 'disco', 'party'],
    country: ['country', 'western', 'folk', 'bluegrass'],
    latin: ['latin', 'reggaeton', 'salsa', 'bachata', 'cumbia'],
    indie: ['indie', 'alternative', 'underground', 'independent']
};

/**
 * Mood patterns for detection
 * @type {Object.<string, string[]>}
 */
export const MOOD_PATTERNS = {
    energetic: ['energetic', 'upbeat', 'hype', 'pump', 'power', 'workout', 'gym', 'fast', 'intense'],
    chill: ['chill', 'relaxing', 'calm', 'peaceful', 'mellow', 'easy', 'soft'],
    happy: ['happy', 'cheerful', 'joyful', 'fun', 'feel good', 'positive', 'bright'],
    sad: ['sad', 'emotional', 'heartbreak', 'melancholy', 'cry', 'tear', 'pain', 'lonely'],
    romantic: ['love', 'romantic', 'passion', 'heart', 'together', 'you and me'],
    focus: ['focus', 'study', 'concentration', 'work', 'productivity', 'ambient'],
    party: ['party', 'club', 'dance', 'celebration', 'lit', 'turn up'],
    night: ['night', 'late night', 'midnight', 'dark', 'nocturnal', 'after hours']
};

/**
 * Skip patterns for filtering non-music content
 * @type {RegExp[]}
 */
export const SKIP_PATTERNS = [
    /#shorts?/i,
    /\byoutube shorts?\b/i,
    /compilation/i,
    /mix\s*20\d{2}/i,
    /\d+\s*hour/i,
    /top\s*\d+/i,
    /best\s*of/i,
    /\[playlist\]|playlist mix/i,
    /reaction/i,
    /interview/i,
    /behind\s*the\s*scenes/i,
    /making\s*of/i,
    /tutorial/i,
    /karaoke/i,
    /slowed\s*\+?\s*reverb/i,
    /sped\s*up/i,
    /8d\s*audio/i,
    /bass\s*boosted/i
];

/**
 * Stop words for keyword extraction (English + Vietnamese)
 * @type {Set<string>}
 */
const STOP_WORDS = new Set([
    'official',
    'video',
    'audio',
    'lyrics',
    'mv',
    'hd',
    '4k',
    'ft',
    'feat',
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'it',
    'this',
    'that',
    'từ',
    'và',
    'của',
    'music',
    'song',
    'track',
    'single',
    'album',
    'new',
    'version'
]);

/**
 * GenreMoodDetector — stateless content analysis for track metadata
 * Uses LRU-like caches for performance (capped at configurable sizes)
 */
export class GenreMoodDetector {
    /**
     * @param {Object} [options]
     * @param {number} [options.genreCacheMax=1000] - Max genre cache entries
     * @param {number} [options.moodCacheMax=1000] - Max mood cache entries
     * @param {number} [options.artistCacheMax=500] - Max artist cache entries
     * @param {number} [options.minTrackDuration=60000] - Min track duration (ms)
     * @param {number} [options.maxTrackDuration=900000] - Max track duration (ms)
     */
    constructor(options = {}) {
        this._genreCache = new Map();
        this._moodCache = new Map();
        this._artistCache = new Map();

        this._genreCacheMax = options.genreCacheMax || 1000;
        this._moodCacheMax = options.moodCacheMax || 1000;
        this._artistCacheMax = options.artistCacheMax || 500;
        this._minTrackDuration = options.minTrackDuration || 60000;
        this._maxTrackDuration = options.maxTrackDuration || 15 * 60 * 1000;
    }

    /**
     * Detect genre from track title and artist
     * @param {string} title - Track title
     * @param {string} artist - Track artist
     * @returns {string|null} Detected genre or null
     */
    detectGenre(title, artist) {
        const cacheKey = `${title}|${artist}`.toLowerCase();
        if (this._genreCache.has(cacheKey)) {
            // LRU: move to tail by delete + re-insert
            const value = this._genreCache.get(cacheKey);
            this._genreCache.delete(cacheKey);
            this._genreCache.set(cacheKey, value);
            return value;
        }

        const combined = `${title} ${artist}`.toLowerCase();

        for (const [genre, patterns] of Object.entries(GENRE_PATTERNS)) {
            if (patterns.some(p => combined.includes(p))) {
                this._genreCache.set(cacheKey, genre);
                if (this._genreCache.size > this._genreCacheMax) {
                    const firstKey = this._genreCache.keys().next().value;
                    this._genreCache.delete(firstKey);
                }
                return genre;
            }
        }

        this._genreCache.set(cacheKey, null);
        return null;
    }

    /**
     * Detect mood from track title
     * @param {string} title - Track title
     * @returns {string|null} Detected mood or null
     */
    detectMood(title) {
        const cacheKey = (title || '').toLowerCase();
        if (this._moodCache.has(cacheKey)) {
            // LRU: move to tail by delete + re-insert
            const value = this._moodCache.get(cacheKey);
            this._moodCache.delete(cacheKey);
            this._moodCache.set(cacheKey, value);
            return value;
        }

        const titleLower = (title || '').toLowerCase();

        for (const [mood, patterns] of Object.entries(MOOD_PATTERNS)) {
            if (patterns.some(p => titleLower.includes(p))) {
                this._moodCache.set(cacheKey, mood);
                if (this._moodCache.size > this._moodCacheMax) {
                    const firstKey = this._moodCache.keys().next().value;
                    this._moodCache.delete(firstKey);
                }
                return mood;
            }
        }

        this._moodCache.set(cacheKey, null);
        return null;
    }

    /**
     * Clean artist name for comparison (removes "-Topic", "VEVO", etc.)
     * @param {string} artist - Raw artist name
     * @returns {string} Cleaned artist name
     */
    cleanArtistName(artist) {
        if (!artist) return '';

        if (this._artistCache.has(artist)) {
            // LRU: move to tail by delete + re-insert
            const value = this._artistCache.get(artist);
            this._artistCache.delete(artist);
            this._artistCache.set(artist, value);
            return value;
        }

        const cleaned = artist
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .replace(/\s*(Official|Channel|Music|Records|Entertainment)$/gi, '')
            .replace(/\s*\(.*?\)/g, '')
            .trim();

        this._artistCache.set(artist, cleaned);
        if (this._artistCache.size > this._artistCacheMax) {
            const firstKey = this._artistCache.keys().next().value;
            this._artistCache.delete(firstKey);
        }

        return cleaned;
    }

    /**
     * Check if track should be skipped (non-music content, invalid duration)
     * @param {Object} track - Track object with info property
     * @returns {boolean} True if should skip
     */
    shouldSkipTrack(track) {
        if (!track?.info) return true;

        const { title, length, isStream } = track.info;

        if (isStream) return true;

        if (!length || length < this._minTrackDuration || length > this._maxTrackDuration) {
            return true;
        }

        if (title && SKIP_PATTERNS.some(pattern => pattern.test(title))) {
            return true;
        }

        return false;
    }

    /**
     * Extract meaningful keywords from title
     * @param {string} title - Track title
     * @returns {string[]} Keywords
     */
    extractTitleKeywords(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !STOP_WORDS.has(word))
            .slice(0, 5);
    }

    /**
     * Clear all caches (for memory management)
     */
    clearCaches() {
        this._genreCache.clear();
        this._moodCache.clear();
        this._artistCache.clear();
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache sizes
     */
    getCacheStats() {
        return {
            genreCacheSize: this._genreCache.size,
            moodCacheSize: this._moodCache.size,
            artistCacheSize: this._artistCache.size
        };
    }
}

export default GenreMoodDetector;
