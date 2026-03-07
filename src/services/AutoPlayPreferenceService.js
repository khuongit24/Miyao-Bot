/**
 * AutoPlayPreferenceService
 *
 * Manages the full lifecycle of user auto-play preferences:
 *   1. Tracking — count per-user per-track confirmations within a 30-day window
 *   2. Suggestion — detect "stable intent" (≥5 confirms) and propose auto-play
 *   3. Execution — auto-play tracks the user opted into, detect instant rejection
 *   4. Preferences — CRUD for user auto-play entries, confidence decay
 *
 * Storage: SQLite tables created by migration 009_autoplay_preferences.sql
 *   - user_track_confirmations  (user_id, track_url) → confirm_count, timestamps
 *   - autoplay_preferences      (user_id, track_url) → confidence, counters
 *   - autoplay_suggestion_dismissals (user_id, track_url) → dismissed_at
 *
 * @module AutoPlayPreferenceService
 */

import { getDatabaseManager } from '../database/DatabaseManager.js';
import logger from '../utils/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of confirmations required before suggesting auto-play */
const CONFIRM_THRESHOLD = 5;

/** Time window for confirmation counting (30 days in seconds for SQL) */
const WINDOW_DAYS = 30;

/** Confidence increase when user listens to the full track */
const CONFIDENCE_BOOST_FULL_LISTEN = 0.1;

/** Confidence decrease on instant skip (< 3 s) */
const CONFIDENCE_PENALTY_INSTANT_SKIP = 0.25;

/** Confidence floor — below this, auto-play is auto-disabled */
const CONFIDENCE_FLOOR = 0.3;

/** Maximum confidence value */
const CONFIDENCE_CEILING = 2.0;

/** Daily decay factor applied when a track hasn't been played */
const DAILY_DECAY_FACTOR = 0.02;

/** Instant-skip detection threshold in milliseconds */
const INSTANT_SKIP_THRESHOLD_MS = 3000;

/** Cooldown: don't re-suggest a track within this many hours after being dismissed */
const SUGGESTION_COOLDOWN_HOURS = 720; // 30 days

/** Maximum auto-play preferences per user (storage cap) */
const MAX_PREFERENCES_PER_USER = 50;

/** Page size for /mypreferences pagination */
const PREFERENCES_PAGE_SIZE = 5;

// ─── SQL-safe constant validation ────────────────────────────────────────────
// These numeric constants are interpolated into SQL strings at module load time.
// We validate once here so that no code path can inject non-numeric values.
for (const [name, value] of Object.entries({
    WINDOW_DAYS,
    CONFIDENCE_BOOST_FULL_LISTEN,
    CONFIDENCE_CEILING,
    CONFIDENCE_FLOOR,
    SUGGESTION_COOLDOWN_HOURS
})) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(
            `AutoPlayPreferenceService: constant ${name} must be a finite number, got ${typeof value}: ${value}`
        );
    }
}

// Pre-built safe SQL interval strings (validated above, never user-controlled)
const SQL_WINDOW_INTERVAL = `'-${WINDOW_DAYS} days'`;
const SQL_COOLDOWN_INTERVAL = `'-${SUGGESTION_COOLDOWN_HOURS} hours'`;

// ─── Service ────────────────────────────────────────────────────────────────

class AutoPlayPreferenceService {
    constructor() {
        this._db = null;
    }

    /**
     * Lazily get the database manager (already initialized by bot startup).
     * @returns {import('../database/DatabaseManager.js').default}
     */
    get db() {
        if (!this._db) {
            this._db = getDatabaseManager();
        }
        return this._db;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 1 — TRACKING (Confirmation Counter)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Record that a user confirmed (played) a specific track.
     * Increments the counter if within the 30-day window, otherwise resets it.
     *
     * @param {string} userId
     * @param {{ url: string, title: string, author?: string }} track
     * @returns {{ confirmCount: number, isCandidate: boolean }}
     */
    recordConfirmation(userId, track) {
        if (!userId || !track?.url) return { confirmCount: 0, isCandidate: false };

        try {
            const trackUrl = track.url;
            const trackTitle = track.title || 'Unknown';
            const trackAuthor = track.author || null;
            const now = new Date().toISOString();

            // P1-04: Atomic upsert — eliminates TOCTOU race between SELECT and INSERT/UPDATE.
            // If no row exists, INSERT with confirm_count = 1.
            // On conflict, increment if within the 30-day window, otherwise reset to 1.
            this.db.execute(
                `INSERT INTO user_track_confirmations
                     (user_id, track_url, track_title, track_author, confirm_count, first_confirmed_at, last_confirmed_at)
                 VALUES (?, ?, ?, ?, 1, ?, ?)
                 ON CONFLICT(user_id, track_url) DO UPDATE SET
                     confirm_count = CASE
                         WHEN last_confirmed_at >= datetime('now', ${SQL_WINDOW_INTERVAL})
                         THEN confirm_count + 1
                         ELSE 1
                     END,
                     first_confirmed_at = CASE
                         WHEN last_confirmed_at >= datetime('now', ${SQL_WINDOW_INTERVAL})
                         THEN first_confirmed_at
                         ELSE excluded.first_confirmed_at
                     END,
                     last_confirmed_at = excluded.last_confirmed_at,
                     track_title = excluded.track_title,
                     track_author = excluded.track_author`,
                [userId, trackUrl, trackTitle, trackAuthor, now, now]
            );

            // Read back the authoritative count after the atomic upsert
            const row = this.db.queryOne(
                `SELECT confirm_count FROM user_track_confirmations
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );
            const confirmCount = row?.confirm_count ?? 1;

            const isCandidate = confirmCount >= CONFIRM_THRESHOLD;

            logger.debug('Recorded track confirmation', {
                userId,
                trackUrl: trackUrl.substring(0, 60),
                confirmCount,
                isCandidate
            });

            return { confirmCount, isCandidate };
        } catch (error) {
            logger.error('Failed to record confirmation', { userId, error: error.message });
            return { confirmCount: 0, isCandidate: false };
        }
    }

    /**
     * Get the current confirmation count for a user+track pair.
     * Returns 0 if outside the time window or not found.
     *
     * @param {string} userId
     * @param {string} trackUrl
     * @returns {number}
     */
    getConfirmationCount(userId, trackUrl) {
        try {
            const row = this.db.queryOne(
                `SELECT confirm_count, last_confirmed_at
                 FROM user_track_confirmations
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );

            if (!row) return 0;

            // Check window validity
            const lastConfirmed = new Date(row.last_confirmed_at);
            const windowStart = new Date();
            windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

            return lastConfirmed >= windowStart ? row.confirm_count : 0;
        } catch (error) {
            logger.error('Failed to get confirmation count', { userId, error: error.message });
            return 0;
        }
    }

    /**
     * Cleanup stale confirmation rows (older than 30 days).
     * Called periodically by the bot's maintenance cycle.
     *
     * @returns {number} Number of rows deleted
     */
    cleanupStaleConfirmations() {
        try {
            const result = this.db.execute(
                `DELETE FROM user_track_confirmations
                 WHERE last_confirmed_at < datetime('now', ${SQL_WINDOW_INTERVAL})`
            );
            if (result.changes > 0) {
                logger.info(`Cleaned up ${result.changes} stale track confirmations`);
            }
            return result.changes;
        } catch (error) {
            logger.error('Failed to cleanup stale confirmations', error);
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 2 — SUGGESTION (Stable Intent Detection)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Determine whether a suggestion should be shown for this user+track.
     *
     * Returns `true` only when ALL of:
     *   - confirm_count ≥ CONFIRM_THRESHOLD
     *   - User has NOT already enabled auto-play for this track
     *   - User has NOT dismissed the suggestion for this track (or cooldown expired)
     *
     * @param {string} userId
     * @param {string} trackUrl
     * @returns {boolean}
     */
    shouldSuggestAutoPlay(userId, trackUrl) {
        try {
            // 1. Check confirmation count
            const confirmCount = this.getConfirmationCount(userId, trackUrl);
            if (confirmCount < CONFIRM_THRESHOLD) return false;

            // 2. Check if already has an active preference
            const existing = this.db.queryOne(
                `SELECT enabled FROM autoplay_preferences
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );
            if (existing?.enabled) return false;

            // 3. Check if dismissed (with cooldown)
            const dismissal = this.db.queryOne(
                `SELECT dismissed_at FROM autoplay_suggestion_dismissals
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );
            if (dismissal) {
                const dismissedAt = new Date(dismissal.dismissed_at);
                const cooldownEnd = new Date(dismissedAt);
                cooldownEnd.setHours(cooldownEnd.getHours() + SUGGESTION_COOLDOWN_HOURS);
                if (new Date() < cooldownEnd) return false;
            }

            return true;
        } catch (error) {
            logger.error('Failed to check suggestion eligibility', { userId, error: error.message });
            return false;
        }
    }

    /**
     * Record that the user dismissed the auto-play suggestion for a track.
     * This prevents re-suggesting for SUGGESTION_COOLDOWN_HOURS.
     *
     * @param {string} userId
     * @param {string} trackUrl
     */
    recordSuggestionDismissal(userId, trackUrl) {
        try {
            this.db.execute(
                `INSERT INTO autoplay_suggestion_dismissals (user_id, track_url, dismissed_at)
                 VALUES (?, ?, datetime('now'))
                 ON CONFLICT(user_id, track_url) DO UPDATE SET dismissed_at = datetime('now')`,
                [userId, trackUrl]
            );
            // BUG-016: Reset confirmation count so re-suggestion doesn't fire immediately after cooldown
            this.db.execute(
                `UPDATE user_track_confirmations SET confirm_count = 0
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );
            logger.debug('Recorded suggestion dismissal', { userId, trackUrl: trackUrl.substring(0, 60) });
        } catch (error) {
            logger.error('Failed to record suggestion dismissal', { userId, error: error.message });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 3 — AUTO-PLAY PREFERENCE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Enable auto-play for a specific user+track.
     * Enforces MAX_PREFERENCES_PER_USER by removing lowest-confidence entries.
     *
     * @param {string} userId
     * @param {{ url: string, title: string, author?: string }} track
     * @returns {boolean} success
     */
    enableAutoPlay(userId, track) {
        try {
            const trackUrl = track.url;
            const trackTitle = track.title || 'Unknown';
            const trackAuthor = track.author || null;

            this.db.transaction(() => {
                // Upsert preference
                this.db.execute(
                    `INSERT INTO autoplay_preferences
                     (user_id, track_url, track_title, track_author, confidence, enabled, created_at, last_confidence_update_at)
                     VALUES (?, ?, ?, ?, 1.0, 1, datetime('now'), datetime('now'))
                     ON CONFLICT(user_id, track_url) DO UPDATE SET
                         enabled = 1,
                         confidence = MAX(confidence, 1.0),
                         track_title = excluded.track_title,
                         track_author = excluded.track_author,
                         last_confidence_update_at = datetime('now')`,
                    [userId, trackUrl, trackTitle, trackAuthor]
                );

                // Enforce per-user cap — remove lowest confidence if over limit
                const count = this.db.queryOne(
                    `SELECT COUNT(*) as cnt FROM autoplay_preferences
                     WHERE user_id = ? AND enabled = 1`,
                    [userId]
                );

                if (count && count.cnt > MAX_PREFERENCES_PER_USER) {
                    const excess = count.cnt - MAX_PREFERENCES_PER_USER;
                    this.db.execute(
                        `DELETE FROM autoplay_preferences
                         WHERE rowid IN (
                             SELECT rowid FROM autoplay_preferences
                             WHERE user_id = ? AND enabled = 1
                             ORDER BY confidence ASC, last_auto_played_at ASC NULLS FIRST
                             LIMIT ?
                         )`,
                        [userId, excess]
                    );
                }
            });

            // Remove any dismissal record so the flow is clean
            this.db.execute(
                `DELETE FROM autoplay_suggestion_dismissals
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );

            logger.info('Auto-play enabled', { userId, trackUrl: trackUrl.substring(0, 60) });
            return true;
        } catch (error) {
            logger.error('Failed to enable auto-play', { userId, error: error.message });
            return false;
        }
    }

    /**
     * Disable auto-play for a specific user+track.
     *
     * @param {string} userId
     * @param {string} trackUrl
     * @returns {boolean} success
     */
    disableAutoPlay(userId, trackUrl) {
        try {
            this.db.execute(
                `UPDATE autoplay_preferences
                 SET enabled = 0
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );
            // BUG-014: Record dismissal to prevent re-suggestion loop
            this.recordSuggestionDismissal(userId, trackUrl);
            logger.info('Auto-play disabled', { userId, trackUrl: trackUrl.substring(0, 60) });
            return true;
        } catch (error) {
            logger.error('Failed to disable auto-play', { userId, error: error.message });
            return false;
        }
    }

    /**
     * Disable all auto-play preferences for a user.
     *
     * @param {string} userId
     * @returns {number} Number of preferences disabled
     */
    disableAllAutoPlay(userId) {
        try {
            const result = this.db.execute(
                `UPDATE autoplay_preferences
                 SET enabled = 0
                 WHERE user_id = ? AND enabled = 1`,
                [userId]
            );
            const count = result?.changes ?? 0;
            logger.info('All auto-play disabled', { userId, count });
            return count;
        } catch (error) {
            logger.error('Failed to disable all auto-play', { userId, error: error.message });
            return 0;
        }
    }

    /**
     * Check whether auto-play is enabled for a user+track.
     * Also applies time-based confidence decay before answering.
     *
     * @param {string} userId
     * @param {string} trackUrl
     * @returns {{ enabled: boolean, confidence: number } | null}
     */
    getAutoPlayStatus(userId, trackUrl) {
        try {
            const row = this.db.queryOne(
                `SELECT enabled, confidence, last_confidence_update_at
                 FROM autoplay_preferences
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );

            if (!row) return null;

            // FIX-SVC-H01: Pure read — calculate decay without persisting
            const decayed = this._calculateDecay(row);
            return { enabled: !!decayed.enabled, confidence: decayed.confidence };
        } catch (error) {
            logger.error('Failed to get auto-play status', { userId, error: error.message });
            return null;
        }
    }

    /**
     * Check if a specific search query should be auto-played for a user.
     * Matches by track_url (exact). Returns the preference row or null.
     *
     * @param {string} userId
     * @param {string} trackUrl
     * @returns {{ trackUrl: string, trackTitle: string, confidence: number } | null}
     */
    findAutoPlayMatch(userId, trackUrl) {
        try {
            const row = this.db.queryOne(
                `SELECT track_url, track_title, track_author, confidence, last_confidence_update_at
                 FROM autoplay_preferences
                 WHERE user_id = ? AND track_url = ? AND enabled = 1`,
                [userId, trackUrl]
            );

            if (!row) return null;

            // FIX-SVC-H01: Pure read — calculate decay without persisting
            const decayed = this._calculateDecay(row);
            if (!decayed.enabled) return null;

            return {
                trackUrl: row.track_url,
                trackTitle: row.track_title,
                trackAuthor: row.track_author,
                confidence: decayed.confidence
            };
        } catch (error) {
            logger.error('Failed to find auto-play match', { userId, error: error.message });
            return null;
        }
    }

    /**
     * Check multiple track URLs against the user's auto-play preferences.
     * Returns the highest-confidence match found among the given URLs, or null.
     *
     * This solves the case where a user saved a preference for a specific version
     * (e.g., OST lyrics) but the search returns the MV version as the top result.
     * By checking ALL search results, we can find and auto-play the preferred version.
     *
     * @param {string} userId
     * @param {string[]} trackUrls - Array of track URLs from search results
     * @returns {{ trackUrl: string, trackTitle: string, trackAuthor: string|null, confidence: number, matchIndex: number } | null}
     */
    findAutoPlayMatchFromResults(userId, trackUrls) {
        if (!userId || !trackUrls || trackUrls.length === 0) return null;

        try {
            // Filter out empty/invalid URLs
            const validUrls = trackUrls.filter(url => url && typeof url === 'string');
            if (validUrls.length === 0) return null;

            // Use parameterized IN clause for safety
            const placeholders = validUrls.map(() => '?').join(',');
            const rows = this.db.query(
                `SELECT track_url, track_title, track_author, confidence, last_confidence_update_at
                 FROM autoplay_preferences
                 WHERE user_id = ? AND track_url IN (${placeholders}) AND enabled = 1
                 ORDER BY confidence DESC`,
                [userId, ...validUrls]
            );

            if (!rows || rows.length === 0) return null;

            // FIX-SVC-H01: Pure read — calculate decay without persisting
            for (const row of rows) {
                const decayed = this._calculateDecay(row);
                if (!decayed.enabled) continue;

                // Find the index in the original search results
                const matchIndex = trackUrls.indexOf(row.track_url);

                return {
                    trackUrl: row.track_url,
                    trackTitle: row.track_title,
                    trackAuthor: row.track_author,
                    confidence: decayed.confidence,
                    matchIndex
                };
            }

            return null;
        } catch (error) {
            logger.error('Failed to find auto-play match from results', { userId, error: error.message });
            return null;
        }
    }

    /**
     * Get the confirmation progress for a user+track pair.
     * Returns how many confirmations they have and how many are needed.
     *
     * @param {string} userId
     * @param {string} trackUrl
     * @returns {{ current: number, threshold: number } | null}
     */
    getConfirmationProgress(userId, trackUrl) {
        try {
            const count = this.getConfirmationCount(userId, trackUrl);
            // Only return progress if user has at least 2 confirmations (avoid noise on first play)
            if (count < 2) return null;

            // Don't show progress if auto-play is already enabled
            const existing = this.db.queryOne(
                `SELECT enabled FROM autoplay_preferences
                 WHERE user_id = ? AND track_url = ? AND enabled = 1`,
                [userId, trackUrl]
            );
            if (existing) return null;

            return { current: count, threshold: CONFIRM_THRESHOLD };
        } catch {
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 4 — AUTO-PLAY EXECUTION FEEDBACK
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Record that a track was auto-played for the user.
     *
     * @param {string} userId
     * @param {string} trackUrl
     */
    recordAutoPlay(userId, trackUrl) {
        try {
            this.db.execute(
                `UPDATE autoplay_preferences
                 SET times_auto_played = times_auto_played + 1,
                     last_auto_played_at = datetime('now')
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );
        } catch (error) {
            logger.error('Failed to record auto-play', { userId, error: error.message });
        }
    }

    /**
     * Record that the user listened to the full auto-played track.
     * Increases confidence.
     *
     * @param {string} userId
     * @param {string} trackUrl
     */
    recordFullListen(userId, trackUrl) {
        try {
            this.db.execute(
                `UPDATE autoplay_preferences
                 SET times_listened_full = times_listened_full + 1,
                     confidence = MIN(confidence + ?, ?),
                     last_confidence_update_at = datetime('now')
                 WHERE user_id = ? AND track_url = ?`,
                [CONFIDENCE_BOOST_FULL_LISTEN, CONFIDENCE_CEILING, userId, trackUrl]
            );
            logger.debug('Recorded full listen', { userId, trackUrl: trackUrl.substring(0, 60) });
        } catch (error) {
            logger.error('Failed to record full listen', { userId, error: error.message });
        }
    }

    /**
     * Record an instant skip (user skipped within INSTANT_SKIP_THRESHOLD_MS).
     * Decreases confidence significantly.
     *
     * @param {string} userId
     * @param {string} trackUrl
     * @returns {{ confidence: number, autoDisabled: boolean }}
     */
    recordInstantSkip(userId, trackUrl) {
        try {
            // P1-04: Atomic update — apply penalty and auto-disable in a single statement,
            // eliminating the TOCTOU race between SELECT confidence and UPDATE.
            this.db.execute(
                `UPDATE autoplay_preferences
                 SET times_instant_skipped = times_instant_skipped + 1,
                     confidence = MAX(0, confidence - ?),
                     enabled = CASE WHEN MAX(0, confidence - ?) < ? THEN 0 ELSE enabled END,
                     last_confidence_update_at = datetime('now')
                 WHERE user_id = ? AND track_url = ? AND enabled = 1`,
                [CONFIDENCE_PENALTY_INSTANT_SKIP, CONFIDENCE_PENALTY_INSTANT_SKIP, CONFIDENCE_FLOOR, userId, trackUrl]
            );

            // Read back authoritative state after the atomic update
            const row = this.db.queryOne(
                `SELECT confidence, enabled FROM autoplay_preferences
                 WHERE user_id = ? AND track_url = ?`,
                [userId, trackUrl]
            );

            if (!row) return { confidence: 0, autoDisabled: false };

            const newConfidence = row.confidence;
            const autoDisabled = !row.enabled;

            logger.debug('Recorded instant skip', {
                userId,
                trackUrl: trackUrl.substring(0, 60),
                newConfidence,
                autoDisabled
            });

            return { confidence: newConfidence, autoDisabled };
        } catch (error) {
            logger.error('Failed to record instant skip', { userId, error: error.message });
            return { confidence: 0, autoDisabled: false };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 5 — PREFERENCES LISTING (for /mypreferences)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get paginated list of a user's auto-play preferences.
     *
     * @param {string} userId
     * @param {number} [page=1] 1-based page number
     * @returns {{ items: Array, page: number, totalPages: number, totalItems: number }}
     */
    getUserPreferences(userId, page = 1) {
        try {
            const countRow = this.db.queryOne(
                `SELECT COUNT(*) as cnt FROM autoplay_preferences
                 WHERE user_id = ? AND enabled = 1`,
                [userId]
            );
            const totalItems = countRow?.cnt || 0;
            const totalPages = Math.max(1, Math.ceil(totalItems / PREFERENCES_PAGE_SIZE));
            const safePage = Math.max(1, Math.min(page, totalPages));
            const offset = (safePage - 1) * PREFERENCES_PAGE_SIZE;

            const items = this.db.query(
                `SELECT track_url, track_title, track_author, confidence,
                        times_auto_played, times_listened_full, times_instant_skipped,
                        created_at, last_auto_played_at
                 FROM autoplay_preferences
                 WHERE user_id = ? AND enabled = 1
                 ORDER BY confidence DESC, last_auto_played_at DESC NULLS LAST
                 LIMIT ? OFFSET ?`,
                [userId, PREFERENCES_PAGE_SIZE, offset]
            );

            return { items, page: safePage, totalPages, totalItems };
        } catch (error) {
            logger.error('Failed to get user preferences', { userId, error: error.message });
            return { items: [], page: 1, totalPages: 1, totalItems: 0 };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 6 — DECAY & MAINTENANCE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Pure calculation of time-based confidence decay for a single row.
     * Does NOT persist — caller decides whether to write.
     * FIX-DB-H03: Extracted from _applyDecay to enable batch persistence.
     *
     * @private
     * @param {{ confidence: number, last_confidence_update_at: string, enabled?: number }} row
     * @returns {{ confidence: number, enabled: number, shouldPersist: boolean }}
     */
    _calculateDecay(row) {
        // BUG-021: Guard against NaN/corrupted confidence values
        let confidence = row.confidence;
        if (typeof confidence !== 'number' || isNaN(confidence)) {
            confidence = 0;
        }

        const lastUpdate = new Date(row.last_confidence_update_at);
        // Guard against null/invalid dates (would create epoch → massive decay)
        if (isNaN(lastUpdate.getTime())) {
            return { confidence, enabled: row.enabled ?? 1, shouldPersist: false };
        }

        const now = new Date();
        const daysSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60 * 24);

        // Only decay if more than 1 day has passed
        if (daysSinceUpdate < 1) {
            return { confidence, enabled: row.enabled ?? 1, shouldPersist: false };
        }

        const decayAmount = Math.floor(daysSinceUpdate) * DAILY_DECAY_FACTOR;
        const newConfidence = Math.max(0, confidence - decayAmount);
        const enabled = newConfidence >= CONFIDENCE_FLOOR ? (row.enabled ?? 1) : 0;
        const delta = Math.abs(confidence - newConfidence);
        const shouldPersist = delta > 0.01 || enabled !== (row.enabled ?? 1);

        return { confidence: newConfidence, enabled, shouldPersist };
    }

    /**
     * Apply time-based confidence decay to a single preference row.
     * If confidence drops below the floor, auto-disables the preference.
     *
     * @private
     * @param {string} userId
     * @param {string} trackUrl
     * @param {{ confidence: number, last_confidence_update_at: string, enabled?: number }} row
     * @returns {{ confidence: number, enabled: number }}
     */
    _applyDecay(userId, trackUrl, row) {
        const decayed = this._calculateDecay(row);

        // Persist the decayed value (single-row path, used by getAutoPlayStatus etc.)
        if (decayed.shouldPersist) {
            try {
                this.db.execute(
                    `UPDATE autoplay_preferences
                     SET confidence = ?, enabled = ?, last_confidence_update_at = datetime('now')
                     WHERE user_id = ? AND track_url = ?`,
                    [decayed.confidence, decayed.enabled, userId, trackUrl]
                );
            } catch {
                // Non-critical — stale decay is acceptable
            }
        }

        return { confidence: decayed.confidence, enabled: decayed.enabled };
    }

    /**
     * Batch decay for all preferences that haven't been updated recently.
     * Called by the bot's maintenance cycle (e.g., daily).
     *
     * FIX-DB-H03: Collect all decay updates and execute them in a single transaction
     * instead of 10+ individual DB writes per call.
     *
     * @returns {number} Number of rows updated
     */
    runBatchDecay() {
        try {
            // Only decay rows that haven't been updated in the last day
            const staleRows = this.db.query(
                `SELECT user_id, track_url, confidence, last_confidence_update_at, enabled
                 FROM autoplay_preferences
                 WHERE enabled = 1
                   AND last_confidence_update_at < datetime('now', '-1 day')
                 LIMIT 500`
            );

            // Phase 1: Calculate all decayed values (pure computation, no DB writes)
            const pendingUpdates = [];
            for (const row of staleRows) {
                const decayed = this._calculateDecay(row);
                if (decayed.shouldPersist) {
                    pendingUpdates.push({
                        userId: row.user_id,
                        trackUrl: row.track_url,
                        confidence: decayed.confidence,
                        enabled: decayed.enabled
                    });
                }
            }

            // Phase 2: Batch-write all updates in a single transaction
            if (pendingUpdates.length > 0) {
                this.db.transaction(() => {
                    const stmt = this.db.db.prepare(
                        `UPDATE autoplay_preferences
                         SET confidence = ?, enabled = ?, last_confidence_update_at = datetime('now')
                         WHERE user_id = ? AND track_url = ?`
                    );
                    for (const update of pendingUpdates) {
                        stmt.run(update.confidence, update.enabled, update.userId, update.trackUrl);
                    }
                });
                logger.info(
                    `Batch decay applied to ${pendingUpdates.length} auto-play preferences (single transaction)`
                );
            }

            return pendingUpdates.length;
        } catch (error) {
            logger.error('Failed to run batch decay', error);
            return 0;
        }
    }

    /**
     * Full maintenance: cleanup stale confirmations + run decay + prune disabled prefs.
     * Intended to be called once per day.
     *
     * @returns {{ confirmationsDeleted: number, decayed: number, pruned: number }}
     */
    runMaintenance() {
        const confirmationsDeleted = this.cleanupStaleConfirmations();
        const decayed = this.runBatchDecay();

        // Prune disabled preferences older than 60 days
        let pruned = 0;
        try {
            const result = this.db.execute(
                `DELETE FROM autoplay_preferences
                 WHERE enabled = 0
                   AND last_confidence_update_at < datetime('now', '-60 days')`
            );
            pruned = result.changes;

            // Also prune old dismissals (older than cooldown period)
            this.db.execute(
                `DELETE FROM autoplay_suggestion_dismissals
                 WHERE dismissed_at < datetime('now', ${SQL_COOLDOWN_INTERVAL})`
            );
        } catch (error) {
            logger.error('Failed to prune old preferences', error);
        }

        logger.info('Auto-play maintenance complete', { confirmationsDeleted, decayed, pruned });
        return { confirmationsDeleted, decayed, pruned };
    }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let instance = null;

/**
 * Get the singleton AutoPlayPreferenceService instance.
 * @returns {AutoPlayPreferenceService}
 */
export function getAutoPlayPreferenceService() {
    if (!instance) {
        instance = new AutoPlayPreferenceService();
    }
    return instance;
}

export function resetAutoPlayPreferenceService() {
    instance = null;
}

// Export constants for testing / external use
export {
    CONFIRM_THRESHOLD,
    WINDOW_DAYS,
    INSTANT_SKIP_THRESHOLD_MS,
    CONFIDENCE_FLOOR,
    CONFIDENCE_CEILING,
    PREFERENCES_PAGE_SIZE,
    MAX_PREFERENCES_PER_USER
};

export default AutoPlayPreferenceService;
