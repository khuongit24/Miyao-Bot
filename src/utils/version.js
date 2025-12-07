/**
 * Centralized Version Management
 * This file contains all version-related information for Miyao Bot
 */

export const VERSION = {
    // Main version
    major: 1,
    minor: 8,
    patch: 5,

    // Build info
    build: '2025.12.04',
    codename: 'Seraphina',

    // Full version string
    get full() {
        return `${this.major}.${this.minor}.${this.patch}`;
    },

    // Version with build
    get withBuild() {
        return `${this.full}-${this.build}`;
    },

    // Display version (for embeds, UI, etc.)
    get display() {
        return `v${this.full}`;
    },

    // Full display with codename
    get fullDisplay() {
        return `v${this.full} "${this.codename}"`;
    },

    // Footer text for embeds
    get footer() {
        return `Miyao Music Bot ${this.display}`;
    },

    // Detailed version info
    get detailed() {
        return {
            version: this.full,
            build: this.build,
            codename: this.codename,
            fullVersion: this.withBuild,
            displayVersion: this.display
        };
    }
};

// Environment info
export const ENVIRONMENT = {
    get nodeVersion() {
        return process.version;
    },

    get platform() {
        return process.platform;
    },

    get env() {
        return process.env.NODE_ENV || 'development';
    },

    get isDevelopment() {
        return this.env === 'development';
    },

    get isProduction() {
        return this.env === 'production';
    }
};

// Release notes for this version
export const RELEASE_NOTES = {
    version: VERSION.full,
    date: '2025-12-02',
    changes: [
        { type: 'fixed', description: 'Seek command now allows seeking to 0:00 (start of track)' },
        { type: 'fixed', description: 'History replay menu validates entries before creating SelectMenu' },
        { type: 'fixed', description: 'Queue commands now handle undefined track info gracefully' },
        { type: 'fixed', description: 'Playlist play command handles connection failures gracefully' },
        { type: 'fixed', description: 'NodeHealthMonitor memory leak prevention' },
        { type: 'fixed', description: 'EventQueue infinite loop prevention' },
        { type: 'improved', description: 'Autoplay error logging shows all strategy errors' }
    ]
};

// Feature flags
export const FEATURES = {
    // Core features
    PLAYLIST_SUPPORT: true,
    HISTORY_TRACKING: true,
    ADVANCED_FILTERS: true,
    AUTO_PROGRESS_UPDATE: true,
    CONTEXT_MENU_PLAYLIST: true, // New: Add to Playlist from context menu

    // UI/UX features
    INTERACTIVE_CONTROLS: true,
    SEARCH_RESULTS: true,
    QUEUE_PAGINATION: true,

    // Performance features
    MEMORY_OPTIMIZATION: true,
    CACHE_MANAGEMENT: true,

    // Debug features
    DEBUG_LOGGING: ENVIRONMENT.isDevelopment,
    VERBOSE_ERRORS: ENVIRONMENT.isDevelopment
};

// Export default object with all info
export default {
    VERSION,
    ENVIRONMENT,
    RELEASE_NOTES,
    FEATURES
};
