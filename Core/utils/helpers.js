import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load configuration from config file
 */
export function loadConfig() {
    try {
        const configPath = path.join(process.cwd(), 'config', 'config.json');
        
        if (!fs.existsSync(configPath)) {
            logger.warn('config.json not found, using example config');
            const examplePath = path.join(process.cwd(), 'config', 'config.example.json');
            const exampleConfig = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
            return exampleConfig;
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        logger.info('Configuration loaded successfully');
        return config;
    } catch (error) {
        logger.error('Failed to load configuration', error);
        process.exit(1);
    }
}

/**
 * Format duration from milliseconds to HH:MM:SS
 */
export function formatDuration(ms) {
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
 * Format number with commas
 */
export function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Get progress bar with animated style
 */
export function getProgressBar(current, total, length = 20) {
    if (total === 0 || isNaN(total)) return '▬'.repeat(length);
    
    const progress = Math.min(Math.max(current / total, 0), 1);
    const filled = Math.round(length * progress);
    const empty = length - filled;
    
    // Use different characters for better visual
    const filledChar = '━';
    const emptyChar = '─';
    const pointer = '🔘';
    
    if (filled === 0) {
        return pointer + emptyChar.repeat(length);
    } else if (filled >= length) {
        return filledChar.repeat(length) + pointer;
    } else {
        return filledChar.repeat(filled) + pointer + emptyChar.repeat(empty);
    }
}

/**
 * Parse time string to milliseconds (e.g., "1:30" -> 90000)
 */
export function parseTime(timeString) {
    const parts = timeString.split(':').map(Number);
    
    if (parts.length === 2) {
        // MM:SS
        return (parts[0] * 60 + parts[1]) * 1000;
    } else if (parts.length === 3) {
        // HH:MM:SS
        return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
    
    return 0;
}

/**
 * Check if user has permission
 */
export function hasPermission(member, config) {
    // Check if admin
    if (member.permissions.has('Administrator')) {
        return true;
    }
    
    // Check admin roles
    if (config.permissions.adminRoles?.length > 0) {
        const hasAdminRole = member.roles.cache.some(role => 
            config.permissions.adminRoles.includes(role.id)
        );
        if (hasAdminRole) return true;
    }
    
    // Check DJ roles
    if (config.permissions.djRoles?.length > 0) {
        const hasDJRole = member.roles.cache.some(role => 
            config.permissions.djRoles.includes(role.id)
        );
        if (hasDJRole) return true;
    }
    
    // Allow everyone if configured
    return config.permissions.allowEveryone || false;
}

/**
 * Truncate string
 */
export function truncate(str, maxLength = 50) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Get platform icon
 */
export function getPlatformIcon(sourceName) {
    const icons = {
        youtube: '🎥',
        spotify: '🎵',
        soundcloud: '🔊',
        twitch: '🎮',
        bandcamp: '🎸',
        http: '🌐'
    };
    
    return icons[sourceName?.toLowerCase()] || '🎵';
}

/**
 * Sleep function
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    loadConfig,
    formatDuration,
    formatNumber,
    getProgressBar,
    parseTime,
    hasPermission,
    truncate,
    getPlatformIcon,
    sleep
};
