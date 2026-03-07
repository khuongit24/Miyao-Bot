/**
 * Centralized Version Management
 * This file contains all version-related information for Miyao Bot
 */

export const VERSION = {
    // Main version
    major: 1,
    minor: 11,
    patch: 4,

    // Build info
    build: '1.11.4.20260307.build:stable',
    codename: 'Kaizen',

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

/**
 * Release notes cho version hiện tại.
 * Cập nhật mỗi khi bump version.
 */
export const RELEASE_NOTES = {
    version: '1.11.4',
    codename: 'Kaizen',
    date: '2026-03-07',
    highlights: [
        'Updated to latest Shoukaku ^4.3.0 and discord.js ^14.25.1',
        'Fixed Lavalink mock connection state bugs causing test failures',
        'Fixed remaining bugs and security vulnerabilities via npm audit',
        'Enforced strict linting rules and format checks compliance'
    ],
    changes: [
        {
            type: 'improved',
            description: 'Updated package.json format, node engines to >=20.0.0.'
        },
        {
            type: 'fixed',
            description: 'Resolved express-rate-limit audit vulnerabilities through npm audit.'
        },
        {
            type: 'fixed',
            description: 'Adapted test suites and mock states (0, 1, 2, 3) to conform to Shoukaku v4.3.0 exact enum structures.'
        },
        {
            type: 'fixed',
            description: 'Fixed linting issues in commands and corrected tests leaking memory handles.'
        }
    ],
    previousVersion: {
        version: '1.11.1',
        codename: 'Hibana',
        date: '2026-02-28',
        highlights: [
            'Multi-source fallback: YouTube → SoundCloud → Deezer',
            'TVHTML5_SIMPLY client — no OAuth required',
            'Source-aware error recovery with auto-switching',
            'Enhanced Now Playing with platform indicators'
        ]
    }
};

// Export default object with all info
export default {
    VERSION,
    ENVIRONMENT,
    RELEASE_NOTES,
    FEATURES
};
