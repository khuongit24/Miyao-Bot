/**
 * Helper Utilities
 * Common utility functions for formatting, parsing, configuration, and display.
 *
 * @module helpers
 * @version 1.9.0 - Permission functions extracted to permissions.js
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { VERSION } from './version.js';
import { hasPermission, checkDJPermission, checkDJCommandPermission } from './permissions.js';
import { PLATFORM_EMOJIS } from './constants.js';

// Re-export permission functions for backward compatibility
export { hasPermission, checkDJPermission, checkDJCommandPermission };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load configuration from config file.
 * Falls back to example config if config.json is not found.
 * Injects version info from the centralized version system.
 *
 * @returns {Object} Parsed configuration object with version info injected
 * @throws {Error} Exits process with code 1 if configuration cannot be loaded
 *
 * @example
 * const config = loadConfig();
 * console.log(config.bot.version); // "1.9.0"
 */
export function loadConfig() {
    try {
        const configPath = path.join(__dirname, '..', 'config', 'config.json');

        let config;
        if (!fs.existsSync(configPath)) {
            logger.warn('config.json not found, using example config');
            const examplePath = path.join(__dirname, '..', 'config', 'config.example.json');
            config = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
        } else {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }

        // Inject version info from centralized version system
        config.bot.version = VERSION.full;
        config.bot.footer = VERSION.footer;
        config.bot.versionDetailed = VERSION.detailed;

        logger.info('Configuration loaded successfully');
        return config;
    } catch (error) {
        logger.error('Failed to load configuration', error);
        process.exit(1);
    }
}

/**
 * Async version of loadConfig for runtime reloads.
 * FIX-UTL-M09: Uses async readFile instead of readFileSync to avoid blocking the event loop.
 * For startup/initial load, use the synchronous loadConfig() instead.
 *
 * @returns {Promise<Object>} Parsed configuration object with version info injected
 * @throws {Error} If configuration cannot be loaded
 *
 * @example
 * const config = await loadConfigAsync();
 */
export async function loadConfigAsync() {
    try {
        const configPath = path.join(__dirname, '..', 'config', 'config.json');

        let config;
        try {
            await fsPromises.access(configPath);
            const raw = await fsPromises.readFile(configPath, 'utf-8');
            config = JSON.parse(raw);
        } catch (accessErr) {
            if (accessErr.code === 'ENOENT' || accessErr.code === 'ERR_FS_FILE_TOO_LARGE') {
                logger.warn('config.json not found, using example config (async)');
                const examplePath = path.join(__dirname, '..', 'config', 'config.example.json');
                const raw = await fsPromises.readFile(examplePath, 'utf-8');
                config = JSON.parse(raw);
            } else {
                throw accessErr;
            }
        }

        // Inject version info from centralized version system
        config.bot.version = VERSION.full;
        config.bot.footer = VERSION.footer;
        config.bot.versionDetailed = VERSION.detailed;

        logger.info('Configuration reloaded successfully (async)');
        return config;
    } catch (error) {
        logger.error('Failed to load configuration (async)', error);
        throw error;
    }
}

/**
 * Format duration from milliseconds to human-readable time string.
 * Uses HH:MM:SS format for durations ≥ 1 hour, MM:SS otherwise.
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string (e.g., "3:45" or "1:02:30")
 *
 * @example
 * formatDuration(90000);    // "1:30"
 * formatDuration(3661000);  // "1:01:01"
 * formatDuration(0);        // "0:00"
 */
export function formatDuration(ms) {
    ms = Math.max(0, ms || 0);
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format a number with comma separators for readability.
 *
 * @param {number} num - Number to format
 * @returns {string} Formatted number string (e.g., "1,234,567")
 *
 * @example
 * formatNumber(1234567); // "1,234,567"
 * formatNumber(-1000);   // "-1,000"
 * formatNumber(null);    // "0"
 */
export function formatNumber(num) {
    if (num === null || num === undefined || Number.isNaN(num)) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Generate a visual progress bar for Discord embeds.
 * Uses Unicode characters for a smooth, animated appearance.
 *
 * @param {number} current - Current position value
 * @param {number} total - Total/maximum value
 * @param {number} [length=30] - Character length of the progress bar
 * @returns {string} Visual progress bar string with position indicator
 *
 * @example
 * getProgressBar(30, 100, 20); // "━━━━━━🔘──────────────"
 * getProgressBar(0, 100, 10);  // "🔘──────────"
 * getProgressBar(0, 0, 10);    // "▬▬▬▬▬▬▬▬▬▬"
 */
export function getProgressBar(current, total, length = 30) {
    if (!Number.isFinite(total) || total <= 0) return '▬'.repeat(length);
    if (!Number.isFinite(current) || current < 0) current = 0;

    const progress = Math.min(Math.max(current / total, 0), 1);
    const filled = Math.round(length * progress);
    const empty = length - filled;

    const filledChar = '━';
    const emptyChar = '─';
    const pointer = '🔘';

    if (filled === 0) {
        return pointer + emptyChar.repeat(Math.max(0, length));
    } else if (filled >= length) {
        return filledChar.repeat(length) + pointer;
    } else {
        return filledChar.repeat(Math.max(0, filled)) + pointer + emptyChar.repeat(Math.max(0, empty));
    }
}

/**
 * Parse a time string (MM:SS or HH:MM:SS) to milliseconds.
 *
 * @param {string} timeString - Time string in MM:SS or HH:MM:SS format
 * @returns {number} Time in milliseconds, or 0 if format is invalid
 *
 * @example
 * parseTime('1:30');    // 90000
 * parseTime('1:00:00'); // 3600000
 * parseTime('invalid'); // 0
 */
export function parseTime(timeString) {
    if (!timeString || typeof timeString !== 'string') return 0;

    const parts = timeString.split(':').map(Number);

    // Guard against NaN parts (e.g. 'abc:def')
    if (parts.some(p => isNaN(p))) return 0;

    let result;
    if (parts.length === 1) {
        // SS (seconds only)
        result = parts[0] * 1000;
    } else if (parts.length === 2) {
        // MM:SS
        result = (parts[0] * 60 + parts[1]) * 1000;
    } else if (parts.length === 3) {
        // HH:MM:SS
        result = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    } else {
        return 0;
    }

    // Guard against NaN or negative results
    return isNaN(result) || result < 0 ? 0 : result;
}

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 *
 * @param {string} str - String to truncate
 * @param {number} [maxLength=50] - Maximum allowed length including ellipsis
 * @returns {string} Original or truncated string
 *
 * @example
 * truncate('Hello World', 8);  // "Hello..."
 * truncate('Short', 50);       // "Short"
 */
export function truncate(str, maxLength = 50) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Get the platform emoji icon for a music source.
 * Handles various source name formats and variations.
 * v1.11.0: Unified with PLATFORM_EMOJIS — YouTube=🔴, Spotify=💚, etc.
 *
 * @param {string|null|undefined} sourceName - Name of the music platform/source
 * @returns {string} Platform emoji icon (defaults to '🎵' for unknown sources)
 *
 * @example
 * getPlatformIcon('youtube');    // '🔴'
 * getPlatformIcon('Spotify');    // '💚'
 * getPlatformIcon(null);         // '🎵'
 */
export function getPlatformIcon(sourceName) {
    const normalizedSource = (sourceName || '').toLowerCase();

    // Check for platform name variations (e.g., "spotify_search" → "spotify")
    for (const [platform, emoji] of Object.entries(PLATFORM_EMOJIS)) {
        if (platform !== 'search' && platform !== 'unknown' && normalizedSource.includes(platform.split('_')[0])) {
            return emoji;
        }
    }

    return PLATFORM_EMOJIS[normalizedSource] || PLATFORM_EMOJIS.unknown || '🎵';
}

/**
 * Async sleep/delay utility.
 *
 * @param {number} ms - Duration to sleep in milliseconds
 * @returns {Promise<void>} Resolves after the specified duration
 *
 * @example
 * await sleep(1000); // Wait 1 second
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    loadConfig,
    loadConfigAsync,
    formatDuration,
    formatNumber,
    getProgressBar,
    parseTime,
    truncate,
    getPlatformIcon,
    sleep,
    // Re-exported from permissions.js for backward compatibility
    hasPermission,
    checkDJPermission,
    checkDJCommandPermission
};
