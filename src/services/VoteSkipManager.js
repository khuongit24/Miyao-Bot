import logger from '../utils/logger.js';

/**
 * Shared VoteSkipManager — singleton service.
 * Centralizes the vote skip session state used by both /skip and /voteskip commands,
 * preventing duplicate independent Maps and ensuring a single vote pool per guild.
 *
 * Session shape:
 *   { trackUri, trackTitle, votes: Set<userId>, requiredVotes, createdAt, messageId, _expiryTimer }
 */

let instance = null;

class VoteSkipManager {
    constructor() {
        /** @type {Map<string, object>} guildId → session */
        // FIX-PB03: Bounded by active guild count (one session per guild) + expiry timers auto-delete
        this.sessions = new Map();
    }

    /**
     * Create a new vote skip session for a guild.
     * Any existing session is cleared first.
     * @param {string} guildId
     * @param {object} options
     * @param {string}  options.trackUri
     * @param {string}  options.trackTitle
     * @param {string}  [options.initiatorId]  — first voter
     * @param {number}  options.requiredVotes
     * @param {number}  [options.expiresIn]    — auto-expire in ms (0 / omitted = no expiry)
     * @returns {object} the created session
     */
    createSession(guildId, options) {
        // Clear any pre-existing session for this guild
        this.clearSession(guildId);

        const session = {
            trackUri: options.trackUri || '',
            trackTitle: options.trackTitle || 'Unknown Track',
            votes: new Set(options.initiatorId ? [options.initiatorId] : []),
            requiredVotes: options.requiredVotes || 1,
            createdAt: Date.now(),
            messageId: null,
            _expiryTimer: null
        };

        this.sessions.set(guildId, session);

        if (options.expiresIn && options.expiresIn > 0) {
            session._expiryTimer = setTimeout(() => {
                // Only delete if the session hasn't been replaced
                if (this.sessions.get(guildId) === session) {
                    this.sessions.delete(guildId);
                    logger.debug('VoteSkipManager', `Session expired for guild ${guildId}`);
                }
            }, options.expiresIn);
        }

        return session;
    }

    /**
     * Add a vote to an existing session.
     * @param {string} guildId
     * @param {string} userId
     * @returns {object|null} the updated session, or null if none exists
     */
    addVote(guildId, userId) {
        const session = this.sessions.get(guildId);
        if (!session) return null;
        session.votes.add(userId);
        return session;
    }

    /**
     * @param {string} guildId
     * @returns {object|null}
     */
    getSession(guildId) {
        return this.sessions.get(guildId) || null;
    }

    /**
     * Clear (delete) a session and cancel its expiry timer.
     * @param {string} guildId
     * @returns {boolean} true if a session was removed
     */
    clearSession(guildId) {
        const session = this.sessions.get(guildId);
        if (session?._expiryTimer) {
            clearTimeout(session._expiryTimer);
        }
        return this.sessions.delete(guildId);
    }

    /**
     * Clear every session (e.g. on graceful shutdown).
     */
    clearAll() {
        for (const [, session] of this.sessions) {
            if (session._expiryTimer) {
                clearTimeout(session._expiryTimer);
            }
        }
        this.sessions.clear();
    }
}

/**
 * Get the singleton VoteSkipManager instance.
 * @returns {VoteSkipManager}
 */
export function getVoteSkipManager() {
    if (!instance) {
        instance = new VoteSkipManager();
    }
    return instance;
}

export function resetVoteSkipManager() {
    if (instance) {
        instance.clearAll();
    }
    instance = null;
}
