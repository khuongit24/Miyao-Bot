/**
 * @file EmbedUtils.js
 * @description Shared embed utility helpers
 */

import logger from '../../utils/logger.js';

/**
 * Safely add fields to an embed, respecting Discord's 25-field limit.
 * @param {import('discord.js').EmbedBuilder} embed - The embed to add fields to
 * @param {Array<{name: string, value: string, inline?: boolean}>} fields - Fields to add
 * @returns {import('discord.js').EmbedBuilder} The embed (for chaining)
 */
export function safeAddFields(embed, fields) {
    const currentCount = embed.data.fields?.length || 0;
    const remaining = 25 - currentCount;
    if (remaining <= 0) {
        logger.warn('Embed field limit reached (25), skipping additional fields');
        return embed;
    }

    const toAdd = fields.slice(0, remaining);
    if (toAdd.length < fields.length) {
        logger.warn(`Truncated ${fields.length - toAdd.length} embed fields due to 25-field limit`);
    }

    return embed.addFields(toAdd);
}

export default {
    safeAddFields
};
