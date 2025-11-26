/**
 * Centralized Version Management
 * This file contains all version-related information for Miyao Bot
 */

export const VERSION = {
    // Main version
    major: 1,
    minor: 8,
    patch: 0,
    
    // Build info
    build: '2025.11.26',
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
    date: '2025-10-07',
    changes: [
        {
            type: 'fixed',
            description: 'Playlist "Phát Playlist" button now works correctly in search results'
        },
        {
            type: 'added',
            description: 'Playlist track removal - "Xóa Bài Hát" button in playlist detail view'
        },
        {
            type: 'added',
            description: 'Queue track removal - "Xóa Bài Nhạc" button in queue view'
        },
        {
            type: 'improved',
            description: 'Track removal supports both position numbers and song name search'
        },
        {
            type: 'improved',
            description: 'Enhanced playlist playback with parallel track resolution and progress logging'
        }
    ]
};

// Feature flags
export const FEATURES = {
    // Core features
    PLAYLIST_SUPPORT: true,
    HISTORY_TRACKING: true,
    ADVANCED_FILTERS: true,
    AUTO_PROGRESS_UPDATE: true,
    
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
