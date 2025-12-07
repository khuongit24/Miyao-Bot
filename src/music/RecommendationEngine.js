/**
 * @file RecommendationEngine.js
 * @description Unified recommendation system for music discovery
 *
 * Features:
 * - Collaborative filtering (users who listened to X also listened to Y)
 * - Content-based filtering (genre, mood, artist similarity)
 * - Hybrid approach combining multiple signals
 * - Diversity and serendipity control
 * - Cold-start handling for new users/guilds
 *
 * Based on research from:
 * - Spotify Engineering (dense retrieval, semantic search)
 * - YouTube Music recommendations (session-based, personalized)
 * - Netflix hybrid approach (collaborative + content-based)
 *
 * @version 1.0.0
 */

import { getDatabaseManager } from '../database/DatabaseManager.js';
import History from '../database/models/History.js';
import logger from '../utils/logger.js';

/**
 * Genre patterns for detection
 * Maps keywords to canonical genre names
 */
const GENRE_PATTERNS = {
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
        'kpop',
        '케이팝'
    ],
    vpop: ['vpop', 'v-pop', 'việt', 'vietnamese', 'nhạc việt', 'nhạc trẻ', 'bolero'],
    jpop: ['jpop', 'j-pop', 'japanese', 'anime', 'アニメ', 'jpop', 'j-pop', 'ost'],
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
 */
const MOOD_PATTERNS = {
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
 * Recommendation scoring weights
 */
const SCORING_WEIGHTS = {
    COLLABORATIVE_OVERLAP: 15, // Users who listened together
    COLLABORATIVE_PLAY_COUNT: 2, // Total plays by similar users
    GENRE_MATCH: 10, // Same genre
    MOOD_MATCH: 8, // Same mood
    ARTIST_SAME: 12, // Same artist
    ARTIST_SIMILAR: 6, // Similar artist name
    POPULARITY: 1, // Global popularity
    RECENCY: 0.5, // Recent plays boost
    DIVERSITY_PENALTY: -5, // Penalty for same artist in results
    SERENDIPITY_BONUS: 3 // Bonus for unexpected discovery
};

/**
 * Configuration
 */
const CONFIG = {
    MAX_HISTORY_DAYS: 30, // Consider last 30 days of history
    MIN_LISTENERS_FOR_COLLAB: 1, // Minimum listeners overlap
    MAX_TRACKS_PER_ARTIST: 2, // Diversity: max tracks per artist
    SERENDIPITY_THRESHOLD: 0.15, // 15% chance for serendipity picks
    COLD_START_THRESHOLD: 5, // Less than 5 plays = cold start
    MIN_TRACK_DURATION: 60000, // 1 minute minimum
    MAX_TRACK_DURATION: 15 * 60 * 1000 // 15 minutes maximum
};

/**
 * Skip patterns for filtering non-music content
 */
const SKIP_PATTERNS = [
    /#shorts?/i,
    /\bshorts?\b/i,
    /compilation/i,
    /mix\s*20\d{2}/i,
    /\d+\s*hour/i,
    /top\s*\d+/i,
    /best\s*of/i,
    /playlist/i,
    /reaction/i,
    /interview/i,
    /behind\s*the\s*scenes/i,
    /making\s*of/i,
    /tutorial/i,
    /karaoke/i,
    /slowed\s*\+?\s*reverb/i,
    /sped\s*up/i,
    /8d\s*audio/i,
    /bass\s*boosted/i,
    /nightcore/i
];

/**
 * RecommendationEngine class
 * Provides unified recommendation logic for autoplay, similar, and discover features
 */
class RecommendationEngine {
    constructor() {
        this._genreCache = new Map();
        this._moodCache = new Map();
        this._artistCache = new Map();
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
            return this._genreCache.get(cacheKey);
        }

        const combined = `${title} ${artist}`.toLowerCase();

        for (const [genre, patterns] of Object.entries(GENRE_PATTERNS)) {
            if (patterns.some(p => combined.includes(p))) {
                this._genreCache.set(cacheKey, genre);
                // Keep cache size manageable
                if (this._genreCache.size > 1000) {
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
        if (this._moodCache.has(title)) {
            return this._moodCache.get(title);
        }

        const titleLower = title.toLowerCase();

        for (const [mood, patterns] of Object.entries(MOOD_PATTERNS)) {
            if (patterns.some(p => titleLower.includes(p))) {
                this._moodCache.set(title, mood);
                if (this._moodCache.size > 1000) {
                    const firstKey = this._moodCache.keys().next().value;
                    this._moodCache.delete(firstKey);
                }
                return mood;
            }
        }

        this._moodCache.set(title, null);
        return null;
    }

    /**
     * Clean artist name for comparison
     * @param {string} artist - Raw artist name
     * @returns {string} Cleaned artist name
     */
    cleanArtistName(artist) {
        if (!artist) return '';

        const cacheKey = artist;
        if (this._artistCache.has(cacheKey)) {
            return this._artistCache.get(cacheKey);
        }

        const cleaned = artist
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .replace(/\s*(Official|Channel|Music|Records|Entertainment)$/gi, '')
            .replace(/\s*\(.*?\)/g, '')
            .trim();

        this._artistCache.set(cacheKey, cleaned);
        if (this._artistCache.size > 500) {
            const firstKey = this._artistCache.keys().next().value;
            this._artistCache.delete(firstKey);
        }

        return cleaned;
    }

    /**
     * Check if track should be skipped
     * @param {Object} track - Track object with info property
     * @returns {boolean} True if should skip
     */
    shouldSkipTrack(track) {
        if (!track?.info) return true;

        const { title, length, isStream } = track.info;

        // Skip streams
        if (isStream) return true;

        // Skip invalid duration
        if (!length || length < CONFIG.MIN_TRACK_DURATION || length > CONFIG.MAX_TRACK_DURATION) {
            return true;
        }

        // Skip non-music content
        if (title && SKIP_PATTERNS.some(pattern => pattern.test(title))) {
            return true;
        }

        return false;
    }

    /**
     * Get collaborative filtering recommendations
     * "Users who listened to X also listened to Y"
     *
     * @param {string} guildId - Discord guild ID
     * @param {string} trackUrl - Reference track URL
     * @param {string} trackTitle - Reference track title
     * @param {Set<string>} seenUrls - Already seen URLs to exclude
     * @param {number} limit - Maximum results
     * @returns {Array} Recommended tracks with scores
     */
    getCollaborativeRecommendations(guildId, trackUrl, trackTitle, seenUrls = new Set(), limit = 10) {
        try {
            const db = getDatabaseManager();

            // Find users who played this track or similar title
            const usersWhoPlayed = db.query(
                `SELECT DISTINCT user_id FROM history
                 WHERE guild_id = ?
                 AND (track_url = ? OR track_title LIKE ?)
                 AND played_at > datetime('now', '-${CONFIG.MAX_HISTORY_DAYS} days')
                 LIMIT 100`,
                [guildId, trackUrl, `%${trackTitle.substring(0, 20)}%`]
            );

            if (usersWhoPlayed.length === 0) {
                return [];
            }

            const userIds = usersWhoPlayed.map(u => u.user_id);
            const placeholders = userIds.map(() => '?').join(',');

            // Find other tracks these users played, ranked by listener overlap
            const similarTracks = db.query(
                `SELECT 
                    track_title, track_author, track_url, track_duration,
                    COUNT(DISTINCT user_id) as listener_overlap,
                    COUNT(*) as play_count,
                    MAX(played_at) as last_played
                 FROM history
                 WHERE guild_id = ?
                 AND user_id IN (${placeholders})
                 AND track_url != ?
                 AND played_at > datetime('now', '-${CONFIG.MAX_HISTORY_DAYS} days')
                 GROUP BY track_url
                 HAVING listener_overlap >= ${CONFIG.MIN_LISTENERS_FOR_COLLAB}
                 ORDER BY listener_overlap DESC, play_count DESC
                 LIMIT ?`,
                [guildId, ...userIds, trackUrl, limit * 3]
            );

            const results = [];
            const seenTitles = new Set();

            for (const track of similarTracks) {
                if (seenUrls.has(track.track_url)) continue;

                const titleKey = track.track_title.toLowerCase().substring(0, 30);
                if (seenTitles.has(titleKey)) continue;

                // Calculate score
                const score =
                    track.listener_overlap * SCORING_WEIGHTS.COLLABORATIVE_OVERLAP +
                    Math.min(track.play_count, 50) * SCORING_WEIGHTS.COLLABORATIVE_PLAY_COUNT;

                seenUrls.add(track.track_url);
                seenTitles.add(titleKey);

                results.push({
                    info: {
                        title: track.track_title,
                        author: track.track_author,
                        uri: track.track_url,
                        length: track.track_duration || 0
                    },
                    source: 'collaborative',
                    score,
                    metadata: {
                        listenerOverlap: track.listener_overlap,
                        playCount: track.play_count
                    }
                });

                if (results.length >= limit) break;
            }

            return results;
        } catch (error) {
            logger.warn('Collaborative filtering failed', { error: error.message });
            return [];
        }
    }

    /**
     * Get genre profile for a guild based on listening history
     * @param {string} guildId - Discord guild ID
     * @returns {Object} Genre counts and percentages
     */
    getGuildGenreProfile(guildId) {
        try {
            const recentHistory = History.getMostPlayed(guildId, 50, 'month');

            const genreCounts = {};
            let totalDetected = 0;

            for (const track of recentHistory) {
                const genre = this.detectGenre(track.track_title, track.track_author);
                if (genre) {
                    genreCounts[genre] = (genreCounts[genre] || 0) + track.play_count;
                    totalDetected += track.play_count;
                }
            }

            // Convert to percentages
            const profile = {};
            for (const [genre, count] of Object.entries(genreCounts)) {
                profile[genre] = {
                    count,
                    percentage: totalDetected > 0 ? ((count / totalDetected) * 100).toFixed(1) : 0
                };
            }

            // Sort by count descending
            const sorted = Object.entries(profile).sort((a, b) => b[1].count - a[1].count);

            return {
                genres: Object.fromEntries(sorted),
                topGenre: sorted.length > 0 ? sorted[0][0] : null,
                totalTracks: recentHistory.length,
                totalDetected
            };
        } catch (error) {
            logger.warn('Failed to get guild genre profile', { guildId, error: error.message });
            return { genres: {}, topGenre: null, totalTracks: 0, totalDetected: 0 };
        }
    }

    /**
     * Get user's listening profile for personalization
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Discord guild ID (optional)
     * @returns {Object} User listening profile
     */
    getUserProfile(userId, guildId = null) {
        try {
            const db = getDatabaseManager();
            const guildFilter = guildId ? 'AND guild_id = ?' : '';
            const params = guildId ? [userId, guildId] : [userId];

            // Get user's top tracks
            const topTracks = db.query(
                `SELECT track_title, track_author, track_url, COUNT(*) as play_count
                 FROM history
                 WHERE user_id = ? ${guildFilter}
                 AND played_at > datetime('now', '-${CONFIG.MAX_HISTORY_DAYS} days')
                 GROUP BY track_url
                 ORDER BY play_count DESC
                 LIMIT 20`,
                params
            );

            // Analyze genres
            const genreCounts = {};
            const artistCounts = {};

            for (const track of topTracks) {
                const genre = this.detectGenre(track.track_title, track.track_author);
                if (genre) {
                    genreCounts[genre] = (genreCounts[genre] || 0) + track.play_count;
                }

                const artist = this.cleanArtistName(track.track_author);
                if (artist) {
                    artistCounts[artist] = (artistCounts[artist] || 0) + track.play_count;
                }
            }

            const topGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([genre]) => genre);

            const topArtists = Object.entries(artistCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([artist]) => artist);

            return {
                totalPlays: topTracks.reduce((sum, t) => sum + t.play_count, 0),
                topGenres,
                topArtists,
                isNewUser: topTracks.length < CONFIG.COLD_START_THRESHOLD
            };
        } catch (error) {
            logger.warn('Failed to get user profile', { userId, error: error.message });
            return { totalPlays: 0, topGenres: [], topArtists: [], isNewUser: true };
        }
    }

    /**
     * Find similar users in the guild
     * Users with overlapping listening history
     *
     * @param {string} guildId - Discord guild ID
     * @param {string} userId - Target user ID
     * @param {number} limit - Maximum similar users
     * @returns {Array} Similar user IDs with similarity scores
     */
    getSimilarUsers(guildId, userId, limit = 10) {
        try {
            const db = getDatabaseManager();

            // Get tracks this user has played
            const userTracks = db.query(
                `SELECT DISTINCT track_url FROM history
                 WHERE guild_id = ? AND user_id = ?
                 AND played_at > datetime('now', '-${CONFIG.MAX_HISTORY_DAYS} days')
                 LIMIT 100`,
                [guildId, userId]
            );

            if (userTracks.length === 0) {
                return [];
            }

            const trackUrls = userTracks.map(t => t.track_url);
            const placeholders = trackUrls.map(() => '?').join(',');

            // Find other users who played these tracks
            const similarUsers = db.query(
                `SELECT user_id, COUNT(DISTINCT track_url) as overlap_count
                 FROM history
                 WHERE guild_id = ?
                 AND user_id != ?
                 AND track_url IN (${placeholders})
                 AND played_at > datetime('now', '-${CONFIG.MAX_HISTORY_DAYS} days')
                 GROUP BY user_id
                 HAVING overlap_count >= 2
                 ORDER BY overlap_count DESC
                 LIMIT ?`,
                [guildId, userId, ...trackUrls, limit]
            );

            return similarUsers.map(u => ({
                userId: u.user_id,
                overlapCount: u.overlap_count,
                similarity: u.overlap_count / userTracks.length
            }));
        } catch (error) {
            logger.warn('Failed to find similar users', { guildId, userId, error: error.message });
            return [];
        }
    }

    /**
     * Build smart search strategies for autoplay
     * Based on current track, history, and guild preferences
     *
     * @param {Object} currentTrack - Currently playing track
     * @param {string} guildId - Discord guild ID
     * @param {Object} _options - Additional options (reserved for future use)
     * @returns {Array} Search strategies with names and queries
     */
    buildAutoplayStrategies(currentTrack, guildId, _options = {}) {
        const { title, author } = currentTrack.info;
        const cleanAuthor = this.cleanArtistName(author);
        const genre = this.detectGenre(title, author);
        const mood = this.detectMood(title);
        const year = new Date().getFullYear();

        const strategies = [];

        // Strategy 1: Same artist, different song
        if (cleanAuthor && cleanAuthor.length > 2) {
            strategies.push({
                name: 'artist_tracks',
                query: `${cleanAuthor} official music video`,
                priority: 1
            });
            strategies.push({
                name: 'artist_popular',
                query: `${cleanAuthor} best songs`,
                priority: 2
            });
        }

        // Strategy 2: Genre-based if detected
        if (genre) {
            strategies.push({
                name: 'genre_trending',
                query: `${genre} music ${year} official`,
                priority: 3
            });
            strategies.push({
                name: 'genre_popular',
                query: `best ${genre} songs official mv`,
                priority: 4
            });
        }

        // Strategy 3: Similar title keywords
        const keywords = this.extractTitleKeywords(title);
        if (keywords.length > 0) {
            strategies.push({
                name: 'similar_keywords',
                query: `${keywords.slice(0, 3).join(' ')} music official`,
                priority: 5
            });
        }

        // Strategy 4: Mood-based if detected
        if (mood) {
            strategies.push({
                name: 'mood_match',
                query: `${mood} music ${year}`,
                priority: 6
            });
        }

        // Strategy 5: Guild genre preference
        const guildProfile = this.getGuildGenreProfile(guildId);
        if (guildProfile.topGenre && guildProfile.topGenre !== genre) {
            strategies.push({
                name: 'guild_preference',
                query: `${guildProfile.topGenre} trending ${year}`,
                priority: 7
            });
        }

        // Strategy 6: Trending fallback
        strategies.push({
            name: 'trending_global',
            query: `trending music ${year} official mv`,
            priority: 8
        });

        // Sort by priority
        strategies.sort((a, b) => a.priority - b.priority);

        return strategies;
    }

    /**
     * Extract meaningful keywords from title
     * @param {string} title - Track title
     * @returns {Array} Keywords
     */
    extractTitleKeywords(title) {
        const stopWords = new Set([
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

        return title
            .toLowerCase()
            .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word))
            .slice(0, 5);
    }

    /**
     * Apply diversity to recommendation results
     * Limits tracks per artist, adds serendipity
     *
     * @param {Array} tracks - Track results
     * @param {Object} options - Diversity options
     * @returns {Array} Diversified tracks
     */
    applyDiversity(tracks, options = {}) {
        const maxPerArtist = options.maxPerArtist || CONFIG.MAX_TRACKS_PER_ARTIST;
        const serendipityChance = options.serendipity || CONFIG.SERENDIPITY_THRESHOLD;

        const artistCounts = new Map();
        const diversified = [];
        const serendipityCandidates = [];

        for (const track of tracks) {
            const artist = this.cleanArtistName(track.info?.author || '');
            const artistKey = artist.toLowerCase();
            const count = artistCounts.get(artistKey) || 0;

            if (count < maxPerArtist) {
                diversified.push(track);
                artistCounts.set(artistKey, count + 1);
            } else {
                // Save for potential serendipity pick
                serendipityCandidates.push(track);
            }
        }

        // Add serendipity picks
        if (serendipityCandidates.length > 0 && Math.random() < serendipityChance) {
            const serendipityPick = serendipityCandidates[Math.floor(Math.random() * serendipityCandidates.length)];
            serendipityPick.isSerendipity = true;
            diversified.push(serendipityPick);
        }

        return diversified;
    }

    /**
     * Score and rank tracks based on multiple signals
     * @param {Array} tracks - Tracks to score
     * @param {Object} context - Scoring context (reference track, user profile, etc.)
     * @returns {Array} Scored and sorted tracks
     */
    scoreAndRank(tracks, context = {}) {
        const { referenceTrack, userProfile, guildProfile: _guildProfile } = context;
        const refGenre = referenceTrack
            ? this.detectGenre(referenceTrack.info?.title, referenceTrack.info?.author)
            : null;
        const refMood = referenceTrack ? this.detectMood(referenceTrack.info?.title) : null;
        const refArtist = referenceTrack ? this.cleanArtistName(referenceTrack.info?.author) : null;

        const scoredTracks = tracks.map(track => {
            let score = track.score || 0;
            const trackGenre = this.detectGenre(track.info?.title, track.info?.author);
            const trackMood = this.detectMood(track.info?.title);
            const trackArtist = this.cleanArtistName(track.info?.author);

            // Genre match bonus
            if (refGenre && trackGenre === refGenre) {
                score += SCORING_WEIGHTS.GENRE_MATCH;
            }

            // Mood match bonus
            if (refMood && trackMood === refMood) {
                score += SCORING_WEIGHTS.MOOD_MATCH;
            }

            // Artist similarity
            if (refArtist && trackArtist) {
                if (refArtist.toLowerCase() === trackArtist.toLowerCase()) {
                    score += SCORING_WEIGHTS.ARTIST_SAME;
                } else if (trackArtist.toLowerCase().includes(refArtist.toLowerCase().split(' ')[0])) {
                    score += SCORING_WEIGHTS.ARTIST_SIMILAR;
                }
            }

            // User preference bonus
            if (userProfile?.topGenres?.includes(trackGenre)) {
                score += SCORING_WEIGHTS.GENRE_MATCH * 0.5;
            }
            if (
                userProfile?.topArtists?.some(a =>
                    a.toLowerCase().includes(trackArtist?.toLowerCase().split(' ')[0] || '')
                )
            ) {
                score += SCORING_WEIGHTS.ARTIST_SIMILAR;
            }

            // Serendipity bonus for unexpected discoveries
            if (track.isSerendipity) {
                score += SCORING_WEIGHTS.SERENDIPITY_BONUS;
            }

            return {
                ...track,
                score,
                detectedGenre: trackGenre,
                detectedMood: trackMood
            };
        });

        // Sort by score descending
        return scoredTracks.sort((a, b) => b.score - a.score);
    }

    /**
     * Get recommendations combining all strategies
     * Main entry point for recommendation
     *
     * @param {Object} options - Recommendation options
     * @returns {Promise<Array>} Recommended tracks
     */
    async getRecommendations(options = {}) {
        const {
            guildId,
            userId,
            referenceTrack,
            limit = 10,
            source = 'all', // 'collaborative', 'content', 'hybrid', 'all'
            seenUrls = new Set()
        } = options;

        const allRecommendations = [];
        const localSeenUrls = new Set(seenUrls);

        // Exclude reference track
        if (referenceTrack?.info?.uri) {
            localSeenUrls.add(referenceTrack.info.uri);
        }

        // Get user profile for personalization
        const userProfile = userId ? this.getUserProfile(userId, guildId) : null;
        const guildProfile = guildId ? this.getGuildGenreProfile(guildId) : null;

        // 1. Collaborative filtering (if source allows)
        if (source === 'collaborative' || source === 'hybrid' || source === 'all') {
            if (referenceTrack?.info?.uri) {
                const collabResults = this.getCollaborativeRecommendations(
                    guildId,
                    referenceTrack.info.uri,
                    referenceTrack.info.title || '',
                    localSeenUrls,
                    limit
                );
                allRecommendations.push(...collabResults);
            }
        }

        // 2. Context for scoring
        const scoringContext = {
            referenceTrack,
            userProfile,
            guildProfile
        };

        // 3. Score and rank
        const scoredResults = this.scoreAndRank(allRecommendations, scoringContext);

        // 4. Apply diversity
        const diversifiedResults = this.applyDiversity(scoredResults, {
            maxPerArtist: CONFIG.MAX_TRACKS_PER_ARTIST,
            serendipity: CONFIG.SERENDIPITY_THRESHOLD
        });

        // 5. Return limited results
        return diversifiedResults.slice(0, limit);
    }

    /**
     * Get genre-specific search queries
     * @param {string} genre - Genre name
     * @returns {Array} Search queries
     */
    getGenreQueries(genre) {
        const year = new Date().getFullYear();
        const queries = {
            kpop: [`kpop ${year} official mv`, 'best kpop songs official', 'kpop new release'],
            vpop: [`nhạc việt ${year} official mv`, 'vpop hay nhất', 'nhạc trẻ official'],
            jpop: [`anime opening ${year}`, 'jpop popular songs', 'anime ost official'],
            pop: [`top pop songs ${year}`, 'pop hits official mv', 'best pop music'],
            hiphop: [`hip hop ${year} official`, 'best rap songs', 'rap official mv'],
            edm: [`edm ${year} official`, 'electronic dance music', 'edm hits'],
            rock: [`rock songs ${year}`, 'best rock music official', 'rock anthems'],
            lofi: ['lofi hip hop chill', 'lofi beats study', 'chillhop mix'],
            ballad: [`ballad songs ${year}`, 'romantic songs official', 'love songs mv']
        };

        return queries[genre] || [`${genre} music ${year} official`, `best ${genre} songs`];
    }

    /**
     * Clear caches (for memory management)
     */
    clearCaches() {
        this._genreCache.clear();
        this._moodCache.clear();
        this._artistCache.clear();
        logger.debug('RecommendationEngine caches cleared');
    }

    /**
     * Get engine statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        return {
            genreCacheSize: this._genreCache.size,
            moodCacheSize: this._moodCache.size,
            artistCacheSize: this._artistCache.size
        };
    }
}

// Singleton instance
let recommendationEngine = null;

/**
 * Get the singleton RecommendationEngine instance
 * @returns {RecommendationEngine}
 */
export function getRecommendationEngine() {
    if (!recommendationEngine) {
        recommendationEngine = new RecommendationEngine();
    }
    return recommendationEngine;
}

export { RecommendationEngine, GENRE_PATTERNS, MOOD_PATTERNS, SCORING_WEIGHTS, CONFIG as RECOMMENDATION_CONFIG };

export default getRecommendationEngine;
