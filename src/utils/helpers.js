import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { VERSION } from './version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load configuration from config file
 */
export function loadConfig() {
    try {
        // Config is now inside src/config
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
 * Enhanced with better visual representation and smooth animations
 */
export function getProgressBar(current, total, length = 30) {
    if (total === 0 || isNaN(total)) return '▬'.repeat(length);
    
    const progress = Math.min(Math.max(current / total, 0), 1);
    const filled = Math.round(length * progress);
    const empty = length - filled;
    
    // Use better characters for enhanced visual experience
    const filledChar = '━';  // Thick horizontal line
    const emptyChar = '─';   // Thin horizontal line
    const pointer = '🔘';    // Position indicator
    
    if (filled === 0) {
        return pointer + emptyChar.repeat(Math.max(0, length));
    } else if (filled >= length) {
        return filledChar.repeat(length) + pointer;
    } else {
        return filledChar.repeat(Math.max(0, filled)) + pointer + emptyChar.repeat(Math.max(0, empty));
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
 * Check if user has DJ permissions (for server-specific DJ role or admin)
 * @param {GuildMember} member - Discord guild member
 * @param {string} guildId - Guild ID
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
export async function checkDJPermission(member, guildId) {
    // Admin always allowed
    if (member.permissions.has('Administrator')) {
        return { allowed: true, reason: 'admin' };
    }
    
    // Get guild settings for DJ role
    try {
        const GuildSettings = (await import('../database/models/GuildSettings.js')).default;
        const settings = GuildSettings.get(guildId);
        
        // If no DJ role is set, everyone is allowed
        if (!settings.djRoleId) {
            return { allowed: true, reason: 'no_dj_role_set' };
        }
        
        // Check if user has DJ role
        if (member.roles.cache.has(settings.djRoleId)) {
            return { allowed: true, reason: 'has_dj_role' };
        }
        
        // User doesn't have DJ role
        return { 
            allowed: false, 
            reason: 'missing_dj_role',
            roleId: settings.djRoleId 
        };
    } catch (error) {
        // If error checking, allow by default
        logger.error('Error checking DJ permission', error);
        return { allowed: true, reason: 'error_default_allow' };
    }
}

/**
 * Check if command requires DJ role and verify permission
 * @param {Interaction} interaction - Discord interaction
 * @param {string[]} djCommands - List of commands that require DJ role
 * @returns {Promise<{allowed: boolean, embed?: EmbedBuilder}>}
 */
export async function checkDJCommandPermission(interaction, djCommands = []) {
    const { EmbedBuilder } = await import('discord.js');
    
    const commandName = interaction.commandName;
    
    // If command is not in DJ commands list, allow
    if (!djCommands.includes(commandName)) {
        return { allowed: true };
    }
    
    const permission = await checkDJPermission(interaction.member, interaction.guildId);
    
    if (permission.allowed) {
        return { allowed: true };
    }
    
    // User doesn't have permission
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Không có quyền')
        .setDescription(
            `Lệnh \`/${commandName}\` yêu cầu vai trò DJ!\n\n` +
            `• Liên hệ admin để được cấp vai trò DJ\n` +
            `• Hoặc admin có thể tắt yêu cầu DJ role trong \`/settings server dj-role\``
        )
        .setTimestamp();
    
    return { allowed: false, embed };
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
        deezer: '🎶',
        applemusic: '🍎',
        jiosaavn: '🇮🇳',
        yandexmusic: '🔵',
        http: '🌐'
    };
    
    // Handle source name variations
    const normalizedSource = (sourceName || '').toLowerCase();
    
    // Check for spotify variants
    if (normalizedSource.includes('spotify')) return '🎵';
    if (normalizedSource.includes('youtube')) return '🎥';
    if (normalizedSource.includes('soundcloud')) return '🔊';
    if (normalizedSource.includes('deezer')) return '🎶';
    if (normalizedSource.includes('apple')) return '🍎';
    
    return icons[normalizedSource] || '🎵';
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
    checkDJPermission,
    checkDJCommandPermission,
    truncate,
    getPlatformIcon,
    sleep
};
