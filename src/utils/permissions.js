/**
 * Permission System
 * Handles user permission checks including admin roles, DJ roles,
 * and server-specific permission configurations.
 *
 * @module permissions
 * @version 1.9.0 - Extracted from helpers.js for better separation of concerns
 */

import { EmbedBuilder } from 'discord.js';
import GuildSettings from '../database/models/GuildSettings.js';
import logger from './logger.js';
import { COLORS } from '../config/design-system.js';

/**
 * Check if a guild member has permission based on config roles.
 * Checks in order: Administrator → Admin Roles → allowEveryone.
 *
 * @param {import('discord.js').GuildMember} member - Discord guild member
 * @param {Object} config - Bot configuration object
 * @param {Object} config.permissions - Permission configuration
 * @param {string[]} [config.permissions.adminRoles] - Array of admin role IDs
 * @param {boolean} [config.permissions.allowEveryone] - Whether to allow all users
 * @returns {boolean} Whether the member has permission
 *
 * @example
 * const allowed = hasPermission(interaction.member, client.config);
 * if (!allowed) return interaction.reply('No permission!');
 */
export function hasPermission(member, config) {
    // Check if admin
    if (member.permissions.has('Administrator')) {
        return true;
    }

    // Check admin roles
    if (config.permissions.adminRoles?.length > 0) {
        const hasAdminRole = member.roles.cache.some(role => config.permissions.adminRoles.includes(role.id));
        if (hasAdminRole) return true;
    }

    // Allow everyone if configured
    return config.permissions.allowEveryone || false;
}

/**
 * Check if a guild member has DJ permissions for a specific server.
 * Uses server-specific DJ role from GuildSettings database.
 *
 * **Security Note (H1 fix):** On database error, defaults to `allowed: false`
 * to prevent unauthorized access. Previously defaulted to `allowed: true`.
 *
 * @param {import('discord.js').GuildMember} member - Discord guild member
 * @param {string} guildId - Guild ID to check DJ role for
 * @returns {{allowed: boolean, reason: string, roleId?: string}}
 *
 * @example
 * const { allowed, reason } = checkDJPermission(member, guildId);
 * if (!allowed) return interaction.reply(`Denied: ${reason}`);
 */
export function checkDJPermission(member, guildId) {
    // Admin always allowed
    if (member.permissions.has('Administrator')) {
        return { allowed: true, reason: 'admin' };
    }

    // Get guild settings for DJ role
    try {
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
        // Security fix H1: Default to DENY on error instead of allow
        logger.error('Error checking DJ permission', error);
        return { allowed: false, reason: 'error_default_deny' };
    }
}

/**
 * Check if a command requires DJ role and verify the user's permission.
 * Returns an embed with a denial message if the user lacks permission.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction
 * @param {string[]} [djCommands=[]] - List of command names that require DJ role
 * @returns {Promise<{allowed: boolean, embed?: import('discord.js').EmbedBuilder}>}
 *
 * @example
 * const DJ_COMMANDS = ['skip', 'stop', 'volume'];
 * const { allowed, embed } = await checkDJCommandPermission(interaction, DJ_COMMANDS);
 * if (!allowed) return interaction.reply({ embeds: [embed], ephemeral: true });
 */
export async function checkDJCommandPermission(interaction, djCommands = []) {
    const commandName = interaction.commandName;

    // If command is not in DJ commands list, allow
    if (!djCommands.includes(commandName)) {
        return { allowed: true };
    }

    const permission = await checkDJPermission(interaction.member, interaction.guildId);

    if (permission.allowed) {
        return { allowed: true };
    }

    // User doesn't have permission - build denial embed
    const embed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle('❌ Không có quyền')
        .setDescription(
            `Lệnh \`/${commandName}\` yêu cầu vai trò DJ!\n\n` +
                '• Liên hệ admin để được cấp vai trò DJ\n' +
                '• Hoặc admin có thể tắt yêu cầu DJ role trong `/settings server dj-role`'
        )
        .setTimestamp();

    return { allowed: false, embed };
}

export default {
    hasPermission,
    checkDJPermission,
    checkDJCommandPermission
};
