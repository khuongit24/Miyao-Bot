/**
 * Centralized Version Management
 * This file contains all version-related information for Miyao Bot
 */

export const VERSION = {
    // Main version
    major: 1,
    minor: 6,
    patch: 1,
    
    // Build info
    build: '2025.10.05',
    codename: 'Starfield',
    
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
    date: '2025-10-05',
    changes: [
        {
            type: 'fixed',
            description: 'Fixed ready event name mismatch (clientReady -> ready)'
        },
        {
            type: 'fixed',
            description: 'Fixed Playlist.create() signature in database tests'
        },
        {
            type: 'fixed',
            description: 'Fixed rate limiter tests - corrected method signatures'
        },
        {
            type: 'fixed',
            description: 'Fixed interaction event tests - added missing mock methods'
        },
        {
            type: 'improved',
            description: 'Enhanced error handling in ready event with comprehensive try-catch'
        },
        {
            type: 'improved',
            description: 'Updated test assertions to match current UI text/labels'
        },
        {
            type: 'added',
            description: 'Better defensive programming in autoplay command error handling'
        },
        {
            type: 'fixed',
            description: 'Fixed database index names in integrity tests'
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
