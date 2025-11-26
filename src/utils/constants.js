/**
 * Application Constants
 * Centralized constants to avoid magic numbers
 */

// Time constants (in milliseconds)
export const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    
    // Specific intervals
    CACHE_CLEANUP_INTERVAL: 60 * 1000, // 1 minute
    PROGRESS_UPDATE_INTERVAL: 5 * 1000, // 5 seconds (reduced for smoother UI)
    HEALTH_CHECK_INTERVAL: 30 * 1000, // 30 seconds
    MEMORY_CHECK_INTERVAL: 60 * 1000, // 1 minute
    METRICS_LOG_INTERVAL: 60 * 60 * 1000, // 1 hour
    
    // TTL values
    SEARCH_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    HISTORY_RETENTION_DAYS: 30, // 30 days
    CACHE_ENTRY_TTL: 24 * 60 * 60 * 1000 // 24 hours
};

// Memory thresholds (in MB) - Gradient cleanup system
export const MEMORY = {
    // Cleanup levels (gradient approach)
    SOFT_CLEANUP_MB: parseInt(process.env.MEMORY_SOFT_MB) || 500,     // Start soft cleanup
    NORMAL_CLEANUP_MB: parseInt(process.env.MEMORY_NORMAL_MB) || 700, // Normal cleanup
    CRITICAL_CLEANUP_MB: parseInt(process.env.MEMORY_CRITICAL_MB) || 800, // Aggressive cleanup
    
    // Legacy (kept for backward compatibility)
    WARNING_THRESHOLD: 500,
    CRITICAL_THRESHOLD: 800,
    MAX_HEAP_SIZE: 1024,
    CLEANUP_TRIGGER: 800,
    
    // Cleanup percentages (how much to evict at each level)
    SOFT_EVICT_PERCENT: 10,     // Evict 10% of cache
    NORMAL_EVICT_PERCENT: 30,   // Evict 30% of cache
    CRITICAL_EVICT_PERCENT: 50  // Evict 50% of cache
};

// Queue limits
export const QUEUE = {
    MAX_SIZE: 1000, // Maximum tracks in queue
    MAX_HISTORY_SIZE: 100, // Maximum history entries in memory
    MAX_PLAYLIST_SIZE: 500, // Maximum tracks per playlist
    DEFAULT_PAGE_SIZE: 10 // Default pagination size
};

// Volume settings
export const VOLUME = {
    MIN: 0,
    MAX: 100,
    DEFAULT: 50,
    STEP: 5
};

// Music playback
export const PLAYBACK = {
    AUTO_LEAVE_DELAY: 60 * 1000, // 1 minute
    AUTO_LEAVE_EMPTY_DELAY: 5 * 60 * 1000, // 5 minutes
    RECONNECT_TRIES: 3,
    RECONNECT_DELAY: 1000, // 1 second
    SEEK_BACKWARD_STEP: 10 * 1000, // 10 seconds
    SEEK_FORWARD_STEP: 30 * 1000 // 30 seconds
};

// Cache settings
export const CACHE = {
    MAX_SIZE: 100,
    MAX_SEARCH_RESULTS: 5,
    MAX_HISTORY_CACHE: 100
};

// Lavalink settings
export const LAVALINK = {
    DEFAULT_PORT: 2333,
    DEFAULT_HOST: '127.0.0.1',
    RECONNECT_TRIES: 5,
    RECONNECT_DELAY: 5000,
    RESUME_TIMEOUT: 30,
    REST_TIMEOUT: 60,
    VOICE_CONNECTION_TIMEOUT: 15,
    
    // Node health
    HEALTH_CHECK_INTERVAL: 30 * 1000,
    UNHEALTHY_CPU_THRESHOLD: 80, // percent
    UNHEALTHY_MEMORY_THRESHOLD: 90 // percent
};

// Rate limiting
export const RATE_LIMIT = {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100,
    STRICT_WINDOW_MS: 60 * 1000, // 1 minute
    STRICT_MAX_REQUESTS: 10
};

// Database
export const DATABASE = {
    DEFAULT_PATH: './data/miyao.db',
    BACKUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
    VACUUM_INTERVAL: 7 * 24 * 60 * 60 * 1000, // 7 days
    MAX_QUERY_TIME: 100, // milliseconds
    
    // History Batcher settings
    HISTORY_BATCH_SIZE: 100, // Max entries before force flush
    HISTORY_FLUSH_INTERVAL: 5000 // 5 seconds
};

// Discord limits
export const DISCORD = {
    EMBED_TITLE_MAX: 256,
    EMBED_DESCRIPTION_MAX: 4096,
    EMBED_FIELD_NAME_MAX: 256,
    EMBED_FIELD_VALUE_MAX: 1024,
    EMBED_FOOTER_MAX: 2048,
    EMBED_AUTHOR_MAX: 256,
    EMBED_TOTAL_MAX: 6000,
    EMBED_FIELDS_MAX: 25,
    
    MESSAGE_CONTENT_MAX: 2000,
    BUTTON_LABEL_MAX: 80,
    SELECT_OPTION_LABEL_MAX: 100
};

// Progress bar
export const PROGRESS_BAR = {
    LENGTH: 30, // Increased from 24 for better visualization
    FILLED_CHAR: '━',
    EMPTY_CHAR: '─',
    INDICATOR_CHAR: '🔘'
};

// Error codes
export const ERROR_CODES = {
    // User errors (1000-1999)
    USER_NOT_IN_VOICE: 1001,
    BOT_NO_PERMISSIONS: 1002,
    INVALID_INPUT: 1003,
    QUEUE_EMPTY: 1004,
    QUEUE_FULL: 1005,
    
    // Music errors (2000-2999)
    NO_RESULTS_FOUND: 2001,
    TRACK_LOAD_FAILED: 2002,
    PLAYER_ERROR: 2003,
    NODE_UNAVAILABLE: 2004,
    
    // System errors (3000-3999)
    DATABASE_ERROR: 3001,
    NETWORK_ERROR: 3002,
    INTERNAL_ERROR: 3003,
    RATE_LIMITED: 3004
};

// Feature flags
export const FEATURES = {
    DATABASE_ENABLED: true,
    CACHE_PERSISTENCE: true,
    METRICS_ENABLED: true,
    HISTORY_ENABLED: true,
    PLAYLISTS_ENABLED: true,
    AUTO_PLAY: false, // Not implemented yet
    LYRICS: false, // Not implemented yet
    QUIZ_MODE: false // Not implemented yet
};

// Logging
export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    VERBOSE: 'verbose'
};

export default {
    TIME,
    MEMORY,
    QUEUE,
    VOLUME,
    PLAYBACK,
    CACHE,
    LAVALINK,
    RATE_LIMIT,
    DATABASE,
    DISCORD,
    PROGRESS_BAR,
    ERROR_CODES,
    FEATURES,
    LOG_LEVELS
};
