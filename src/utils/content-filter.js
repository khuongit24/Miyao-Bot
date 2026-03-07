/**
 * Content Filter
 * Filters inappropriate content and provides content moderation capabilities
 */

import logger from './logger.js';

/**
 * Module-level RegExp cache to avoid recompiling the same pattern on every call.
 * Key: pattern string, Value: compiled RegExp
 */
const _regexpCache = new Map();
const MAX_REGEXP_CACHE_SIZE = 500;

/**
 * Get a cached RegExp, compiling and storing it on first use.
 * @param {string} source - RegExp source string
 * @param {string} flags  - RegExp flags
 * @returns {RegExp}
 */
function getCachedRegExp(source, flags) {
    const key = `${source}|||${flags}`;
    let re = _regexpCache.get(key);
    if (re) return re;

    // Evict oldest half when cache is full
    if (_regexpCache.size >= MAX_REGEXP_CACHE_SIZE) {
        const toRemove = Math.floor(_regexpCache.size / 2);
        let removed = 0;
        for (const k of _regexpCache.keys()) {
            if (removed >= toRemove) break;
            _regexpCache.delete(k);
            removed++;
        }
    }

    re = new RegExp(source, flags);
    _regexpCache.set(key, re);
    return re;
}

/**
 * Content categories that can be filtered
 */
export const ContentCategory = {
    NSFW: 'nsfw',
    VIOLENCE: 'violence',
    HATE_SPEECH: 'hate_speech',
    PROFANITY: 'profanity',
    SPAM: 'spam'
};

/**
 * Blacklisted keywords by category
 * These are common patterns - can be extended via database
 */
const BLACKLISTED_KEYWORDS = {
    [ContentCategory.NSFW]: [
        // Common NSFW terms (basic filtering)
        'porn',
        'xxx',
        'sex',
        'nude',
        'naked',
        'nsfw',
        'hentai',
        'adult',
        'erotic',
        '18+',
        'mature content'
    ],
    [ContentCategory.VIOLENCE]: ['gore', 'violent', 'killing', 'murder', 'torture', 'blood', 'brutal'],
    [ContentCategory.HATE_SPEECH]: ['hate', 'racist', 'nazi', 'kkk', 'supremacist'],
    [ContentCategory.PROFANITY]: ['fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard', 'crap'],
    [ContentCategory.SPAM]: [
        'free money',
        'click here',
        'buy now',
        'limited offer',
        'act now',
        'congratulations you won',
        'claim your prize'
    ]
};

/**
 * Content filter configuration per guild
 * Stored in memory - should be persisted to database in production
 */
const MAX_GUILD_CONFIGS = 1000;

class ContentFilterConfig {
    constructor() {
        // guildId -> { enabled: boolean, categories: Set, blacklist: Set, whitelist: Set }
        this.guildConfigs = new Map();
    }

    /**
     * Evict oldest entries when map exceeds max size (LRU-style)
     * @private
     */
    _evictIfNeeded() {
        if (this.guildConfigs.size <= MAX_GUILD_CONFIGS) return;

        // Remove the oldest half of entries (Map iterates in insertion order)
        const toRemove = Math.floor(this.guildConfigs.size / 2);
        let removed = 0;
        for (const key of this.guildConfigs.keys()) {
            if (removed >= toRemove) break;
            this.guildConfigs.delete(key);
            removed++;
        }
        logger.info(`ContentFilter: Evicted ${removed} guild configs (LRU)`, {
            remaining: this.guildConfigs.size
        });
    }

    /**
     * Get configuration for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Configuration
     */
    getConfig(guildId) {
        if (!this.guildConfigs.has(guildId)) {
            this._evictIfNeeded();
            // Default configuration: disabled with no filtering
            this.guildConfigs.set(guildId, {
                enabled: false,
                categories: new Set(),
                blacklist: new Set(),
                whitelist: new Set()
            });
        } else {
            // Move to end of Map to mark as recently used (LRU)
            const config = this.guildConfigs.get(guildId);
            this.guildConfigs.delete(guildId);
            this.guildConfigs.set(guildId, config);
        }
        return this.guildConfigs.get(guildId);
    }

    /**
     * Enable content filtering for guild
     * @param {string} guildId - Guild ID
     * @param {string[]} categories - Categories to filter
     */
    enable(guildId, categories = []) {
        const config = this.getConfig(guildId);
        config.enabled = true;
        config.categories = new Set(categories);
        logger.info(`Content filter enabled for guild ${guildId}`, { categories });
    }

    /**
     * Disable content filtering for guild
     * @param {string} guildId - Guild ID
     */
    disable(guildId) {
        const config = this.getConfig(guildId);
        config.enabled = false;
        logger.info(`Content filter disabled for guild ${guildId}`);
    }

    /**
     * Add term to blacklist
     * @param {string} guildId - Guild ID
     * @param {string} term - Term to blacklist
     */
    addToBlacklist(guildId, term) {
        const config = this.getConfig(guildId);
        config.blacklist.add(term.toLowerCase());
        logger.info(`Added to blacklist for guild ${guildId}`, { term });
    }

    /**
     * Remove term from blacklist
     * @param {string} guildId - Guild ID
     * @param {string} term - Term to remove
     */
    removeFromBlacklist(guildId, term) {
        const config = this.getConfig(guildId);
        config.blacklist.delete(term.toLowerCase());
        logger.info(`Removed from blacklist for guild ${guildId}`, { term });
    }

    /**
     * Add term to whitelist (bypasses all filters)
     * @param {string} guildId - Guild ID
     * @param {string} term - Term to whitelist
     */
    addToWhitelist(guildId, term) {
        const config = this.getConfig(guildId);
        config.whitelist.add(term.toLowerCase());
        logger.info(`Added to whitelist for guild ${guildId}`, { term });
    }

    /**
     * Remove term from whitelist
     * @param {string} guildId - Guild ID
     * @param {string} term - Term to remove
     */
    removeFromWhitelist(guildId, term) {
        const config = this.getConfig(guildId);
        config.whitelist.delete(term.toLowerCase());
        logger.info(`Removed from whitelist for guild ${guildId}`, { term });
    }

    /**
     * Get blacklist for guild
     * @param {string} guildId - Guild ID
     * @returns {string[]} Blacklisted terms
     */
    getBlacklist(guildId) {
        const config = this.getConfig(guildId);
        return Array.from(config.blacklist);
    }

    /**
     * Get whitelist for guild
     * @param {string} guildId - Guild ID
     * @returns {string[]} Whitelisted terms
     */
    getWhitelist(guildId) {
        const config = this.getConfig(guildId);
        return Array.from(config.whitelist);
    }
}

// Singleton instance
const filterConfig = new ContentFilterConfig();

/**
 * Check if content contains inappropriate material
 * @param {string} query - Search query
 * @param {string} title - Track title
 * @param {string} author - Track author
 * @param {string} guildId - Guild ID
 * @returns {Object} { safe: boolean, reason?: string, category?: string }
 */
export function checkContent(query, title, author, guildId) {
    const config = filterConfig.getConfig(guildId);

    // If filtering is disabled, allow everything
    if (!config.enabled) {
        return { safe: true };
    }

    // Combine all text to check
    const textToCheck = [query, title, author].filter(Boolean).join(' ').toLowerCase();

    // BUG-U07: Add input length limit before regex matching to prevent ReDoS
    if (textToCheck.length > 1000) {
        logger.warn('Content check input too long, skipping regex matching', { guildId, length: textToCheck.length });
        return { safe: true };
    }

    // Check whitelist first (bypasses all filters)
    for (const whitelisted of config.whitelist) {
        // Use word boundary matching to prevent partial matches (e.g. "art" matching "fart")
        const escapedTerm = whitelisted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = getCachedRegExp(`\\b${escapedTerm}\\b`, 'i');
        if (pattern.test(textToCheck)) {
            logger.debug('Content allowed via whitelist', { guildId, term: whitelisted });
            return { safe: true };
        }
    }

    // Check guild-specific blacklist
    for (const blacklisted of config.blacklist) {
        if (textToCheck.includes(blacklisted)) {
            logger.warn('Content blocked by guild blacklist', { guildId, term: blacklisted });
            return {
                safe: false,
                reason: 'Nội dung chứa từ ngữ bị cấm trong server này',
                category: 'blacklist'
            };
        }
    }

    // Check category-specific blacklists
    for (const category of config.categories) {
        const keywords = BLACKLISTED_KEYWORDS[category];
        if (!keywords) continue;

        for (const keyword of keywords) {
            // Escape regex metacharacters to prevent crashes on special characters
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Use word boundaries to avoid false positives
            const pattern = getCachedRegExp(`\\b${escapedKeyword}\\b`, 'i');
            if (pattern.test(textToCheck)) {
                logger.warn('Content blocked by category filter', {
                    guildId,
                    category,
                    keyword
                });
                return {
                    safe: false,
                    reason: getCategoryMessage(category),
                    category
                };
            }
        }
    }

    return { safe: true };
}

/**
 * Get user-friendly message for blocked category
 * @param {string} category - Content category
 * @returns {string} Message
 */
function getCategoryMessage(category) {
    const messages = {
        [ContentCategory.NSFW]: 'Nội dung không phù hợp (NSFW) bị chặn',
        [ContentCategory.VIOLENCE]: 'Nội dung bạo lực bị chặn',
        [ContentCategory.HATE_SPEECH]: 'Nội dung kích động thù hận bị chặn',
        [ContentCategory.PROFANITY]: 'Nội dung có từ ngữ thô tục bị chặn',
        [ContentCategory.SPAM]: 'Nội dung spam/quảng cáo bị chặn'
    };
    return messages[category] || 'Nội dung không phù hợp bị chặn';
}

/**
 * Analyze content and return detailed report
 * @param {string} text - Text to analyze
 * @returns {Object} Analysis report
 */
export function analyzeContent(text) {
    if (!text) {
        return {
            analyzed: false,
            categories: [],
            score: 1.0,
            flagged: []
        };
    }

    // BUG-U07: Add input length limit before regex matching to prevent ReDoS
    if (text.length > 1000) {
        logger.warn('Content analysis input too long, skipping regex matching', { length: text.length });
        return {
            analyzed: false,
            categories: [],
            score: 1.0,
            flagged: []
        };
    }

    const lowerText = text.toLowerCase();
    const flagged = [];
    const categoryScores = {};

    // Check each category
    for (const [category, keywords] of Object.entries(BLACKLISTED_KEYWORDS)) {
        const matches = [];

        for (const keyword of keywords) {
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = getCachedRegExp(`\\b${escapedKeyword}\\b`, 'gi');
            pattern.lastIndex = 0; // reset stateful /g regex before reuse
            const found = lowerText.match(pattern);
            if (found) {
                matches.push(...found);
            }
        }

        if (matches.length > 0) {
            categoryScores[category] = matches.length;
            flagged.push({
                category,
                matches: [...new Set(matches)], // Remove duplicates
                count: matches.length
            });
        }
    }

    // Calculate overall safety score (0-1, higher is safer)
    const totalFlags = Object.values(categoryScores).reduce((a, b) => a + b, 0);
    const score = Math.max(0, 1 - totalFlags * 0.2); // Each flag reduces score by 0.2

    return {
        analyzed: true,
        categories: Object.keys(categoryScores),
        score,
        flagged,
        safe: score > 0.5
    };
}

/**
 * Check if URL is safe (basic check)
 * @param {string} url - URL to check
 * @returns {Object} { safe: boolean, reason?: string }
 */
export function checkURL(url) {
    if (!url) return { safe: true };

    const lowerURL = url.toLowerCase();

    // Check for known malicious patterns
    const maliciousPatterns = [
        /phishing/i,
        /malware/i,
        /virus/i,
        /scam/i,
        /bit\.ly/i, // Shortened URLs can be suspicious
        /tinyurl/i,
        /goo\.gl/i
    ];

    for (const pattern of maliciousPatterns) {
        if (pattern.test(lowerURL)) {
            logger.warn('Suspicious URL detected', { url });
            return {
                safe: false,
                reason: 'URL này có thể không an toàn'
            };
        }
    }

    return { safe: true };
}

/**
 * Export configuration manager for commands to use
 */
export const contentFilterConfig = filterConfig;

/**
 * Get filter statistics for a guild
 * @param {string} guildId - Guild ID
 * @returns {Object} Statistics
 */
export function getFilterStats(guildId) {
    const config = filterConfig.getConfig(guildId);
    return {
        enabled: config.enabled,
        activeCategories: Array.from(config.categories),
        blacklistSize: config.blacklist.size,
        whitelistSize: config.whitelist.size
    };
}

export default {
    ContentCategory,
    checkContent,
    analyzeContent,
    checkURL,
    contentFilterConfig,
    getFilterStats
};
