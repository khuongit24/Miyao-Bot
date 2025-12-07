/**
 * Mobile Optimization Utilities
 * Helper functions for optimizing Discord UI for mobile devices
 * Version: 1.6.0
 */

import { EmbedBuilder } from 'discord.js';

/**
 * Maximum character limits for Discord embeds
 */
export const DISCORD_LIMITS = {
    EMBED_DESCRIPTION: 4096,
    EMBED_FIELD_VALUE: 1024,
    EMBED_TITLE: 256,
    EMBED_FOOTER: 2048,
    EMBED_AUTHOR: 256,
    EMBED_TOTAL: 6000,
    BUTTON_LABEL: 80,
    SELECT_MENU_OPTION_LABEL: 100,
    SELECT_MENU_OPTION_DESCRIPTION: 100
};

/**
 * Safe limits for mobile devices (more conservative)
 */
export const MOBILE_LIMITS = {
    EMBED_DESCRIPTION: 2000, // Split at 2000 chars for mobile
    EMBED_FIELD_VALUE: 500,
    BUTTON_LABEL: 15,
    SELECT_MENU_OPTION_LABEL: 70,
    SELECT_MENU_OPTION_DESCRIPTION: 60
};

/**
 * Split a long embed description into multiple embeds
 * @param {EmbedBuilder|Object} embed - The embed to split
 * @param {number} maxLength - Maximum length per embed (default: 2000 for mobile)
 * @returns {EmbedBuilder[]} Array of embed builders
 */
export function splitEmbedDescription(embed, maxLength = MOBILE_LIMITS.EMBED_DESCRIPTION) {
    const description = embed.data?.description || embed.description || '';

    if (description.length <= maxLength) {
        return [new EmbedBuilder(embed)];
    }

    const embeds = [];
    let partIndex = 1;
    const estimatedParts = Math.ceil(description.length / maxLength);

    // Check if description has newlines
    if (description.includes('\n')) {
        // Split by newlines
        const lines = description.split('\n');
        let currentDesc = '';

        for (const line of lines) {
            const testDesc = currentDesc ? currentDesc + '\n' + line : line;

            // If adding this line would exceed the limit
            if (testDesc.length > maxLength && currentDesc) {
                // Save current embed
                const newEmbed = new EmbedBuilder(embed).setDescription(currentDesc);

                // Update title to show part number
                if (embed.data?.title || embed.title) {
                    const originalTitle = embed.data?.title || embed.title;
                    newEmbed.setTitle(`${originalTitle} (${partIndex}/${estimatedParts})`);
                }

                embeds.push(newEmbed);
                partIndex++;

                // Start new embed with current line
                currentDesc = line;
            } else {
                // Add line to current embed
                currentDesc = testDesc;
            }
        }

        // Add remaining content
        if (currentDesc) {
            const newEmbed = new EmbedBuilder(embed).setDescription(currentDesc);

            if (embed.data?.title || embed.title) {
                const originalTitle = embed.data?.title || embed.title;
                newEmbed.setTitle(`${originalTitle} (${partIndex}/${estimatedParts})`);
            }

            embeds.push(newEmbed);
        }
    } else {
        // No newlines - split by maxLength chunks
        for (let i = 0; i < description.length; i += maxLength) {
            const chunk = description.slice(i, i + maxLength);
            const newEmbed = new EmbedBuilder(embed).setDescription(chunk);

            // Update title to show part number
            if (embed.data?.title || embed.title) {
                const originalTitle = embed.data?.title || embed.title;
                newEmbed.setTitle(`${originalTitle} (${partIndex}/${estimatedParts})`);
            }

            embeds.push(newEmbed);
            partIndex++;
        }
    }

    return embeds.length > 0 ? embeds : [new EmbedBuilder(embed)];
}

/**
 * Truncate text to fit within mobile limits
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add when truncated (default: '...')
 * @returns {string} Truncated text
 */
export function truncateForMobile(text, maxLength, suffix = '...') {
    if (!text) return '';
    if (text.length <= maxLength) return text;

    return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Shorten button label for mobile display
 * @param {string} label - Original label
 * @param {number} maxLength - Maximum length (default: 15)
 * @returns {string} Shortened label
 */
export function shortenButtonLabel(label, maxLength = MOBILE_LIMITS.BUTTON_LABEL) {
    if (!label || label.length <= maxLength) return label;

    // Common abbreviations
    const abbreviations = {
        Volume: 'Vol',
        Previous: 'Prev',
        Playlist: 'List',
        Shuffle: 'Shuf',
        Repeat: 'Rep',
        Forward: 'Fwd',
        Backward: 'Back',
        Settings: 'Set',
        History: 'Hist',
        Favorites: 'Fav',
        Download: 'DL'
    };

    // Try to abbreviate
    for (const [full, abbr] of Object.entries(abbreviations)) {
        if (label.includes(full)) {
            label = label.replace(full, abbr);
            if (label.length <= maxLength) return label;
        }
    }

    // If still too long, truncate
    return truncateForMobile(label, maxLength, '');
}

/**
 * Optimize embed for mobile display
 * - Shortens descriptions if too long
 * - Limits number of fields
 * - Ensures all text fits within mobile limits
 * @param {EmbedBuilder} embed - Embed to optimize
 * @param {Object} options - Optimization options
 * @returns {EmbedBuilder} Optimized embed
 */
export function optimizeEmbedForMobile(embed, options = {}) {
    const {
        maxDescription = MOBILE_LIMITS.EMBED_DESCRIPTION,
        maxFields = 10,
        maxFieldValue = MOBILE_LIMITS.EMBED_FIELD_VALUE
    } = options;

    const data = embed.data || {};
    const optimized = new EmbedBuilder(embed);

    // Truncate description if needed
    if (data.description && data.description.length > maxDescription) {
        optimized.setDescription(truncateForMobile(data.description, maxDescription));
    }

    // Limit and truncate fields
    if (data.fields && data.fields.length > 0) {
        const limitedFields = data.fields.slice(0, maxFields).map(field => ({
            ...field,
            value: truncateForMobile(field.value, maxFieldValue)
        }));

        optimized.setFields(limitedFields);
    }

    return optimized;
}

/**
 * Split a long list into multiple dropdown menus
 * Discord allows max 25 options per select menu
 * @param {Array} items - Array of items to split
 * @param {number} itemsPerMenu - Items per menu (default: 10 for better mobile UX)
 * @returns {Array[]} Array of item chunks
 */
export function splitDropdownOptions(items, itemsPerMenu = 10) {
    const chunks = [];
    for (let i = 0; i < items.length; i += itemsPerMenu) {
        chunks.push(items.slice(i, i + itemsPerMenu));
    }
    return chunks;
}

/**
 * Create pagination info text for mobile
 * @param {number} current - Current page
 * @param {number} total - Total pages
 * @param {number} itemsPerPage - Items per page
 * @param {number} totalItems - Total items
 * @returns {string} Pagination text
 */
export function createMobilePaginationText(current, total, itemsPerPage, totalItems) {
    const start = (current - 1) * itemsPerPage + 1;
    const end = Math.min(current * itemsPerPage, totalItems);

    return `📄 ${start}-${end}/${totalItems} • Trang ${current}/${total}`;
}

/**
 * Format duration for mobile display (shorter format)
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDurationMobile(ms) {
    // Guard against invalid input (negative, null, undefined, 0)
    if (!ms || ms < 0) return '0:00';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Check if text exceeds mobile-safe limits
 * @param {string} text - Text to check
 * @param {string} type - Type of content ('description', 'field', 'button')
 * @returns {boolean} True if text is too long for mobile
 */
export function exceedsMobileLimits(text, type = 'description') {
    if (!text) return false;

    const limits = {
        description: MOBILE_LIMITS.EMBED_DESCRIPTION,
        field: MOBILE_LIMITS.EMBED_FIELD_VALUE,
        button: MOBILE_LIMITS.BUTTON_LABEL,
        label: MOBILE_LIMITS.SELECT_MENU_OPTION_LABEL,
        option: MOBILE_LIMITS.SELECT_MENU_OPTION_DESCRIPTION
    };

    return text.length > (limits[type] || MOBILE_LIMITS.EMBED_DESCRIPTION);
}

/**
 * Wrap long content in a code block with line numbers for better mobile readability
 * @param {string} content - Content to wrap
 * @param {string} lang - Language for syntax highlighting (default: '')
 * @returns {string} Formatted code block
 */
export function wrapInCodeBlock(content, lang = '') {
    // Discord code block limit is ~2000 chars
    const maxLength = 1900;

    if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '\n... (nội dung bị cắt)';
    }

    return `\`\`\`${lang}\n${content}\n\`\`\``;
}

export default {
    DISCORD_LIMITS,
    MOBILE_LIMITS,
    splitEmbedDescription,
    truncateForMobile,
    shortenButtonLabel,
    optimizeEmbedForMobile,
    splitDropdownOptions,
    createMobilePaginationText,
    formatDurationMobile,
    exceedsMobileLimits,
    wrapInCodeBlock
};
