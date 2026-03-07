/**
 * My Preferences Command
 * Shows the user's auto-play preferences and allows toggling them off.
 * Optimized for mobile Discord view — compact, paginated, minimal embeds.
 *
 * @version 1.10.2
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAutoPlayPreferenceService, PREFERENCES_PAGE_SIZE } from '../../services/AutoPlayPreferenceService.js';
import { AUTOPLAY_PREF_BUTTONS } from '../../utils/button-ids.js';
import { COLORS, ICONS } from '../../config/design-system.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mypreferences')
        .setDescription('Xem và quản lý danh sách bài hát auto-play của bạn'),

    async execute(interaction, client) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const service = getAutoPlayPreferenceService();
            const result = service.getUserPreferences(interaction.user.id, 1);

            if (result.totalItems === 0) {
                const emptyEmbed = new EmbedBuilder()
                    .setColor(COLORS.MUTED)
                    .setDescription(
                        `${ICONS.INFO || 'ℹ️'} Bạn chưa có bài hát auto-play nào.\n\n` +
                            'Khi bạn nghe cùng một bài nhiều lần, bot sẽ đề nghị bật auto-play.'
                    )
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp();

                return interaction.editReply({ embeds: [emptyEmbed] });
            }

            const { embed, components } = buildPreferencesPage(result, client.config);
            await interaction.editReply({ embeds: [embed], components });

            logger.command('mypreferences', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Build the preferences page embed and button components.
 *
 * @param {{ items: Array, page: number, totalPages: number, totalItems: number }} result
 * @param {object} config
 * @returns {{ embed: EmbedBuilder, components: ActionRowBuilder[] }}
 */
function buildPreferencesPage(result, config) {
    const { items, page, totalPages, totalItems } = result;

    const lines = items.map((item, idx) => {
        const globalIdx = (page - 1) * PREFERENCES_PAGE_SIZE + idx + 1;
        const confidence = Math.round(item.confidence * 100);
        const title = truncate(item.track_title, 35);
        const author = item.track_author ? ` — ${truncate(item.track_author, 20)}` : '';
        return `**${globalIdx}.** ${title}${author}\n` + `   🎯 ${confidence}% · ▶️ ${item.times_auto_played || 0}x`;
    });

    const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`${ICONS.SETTINGS || '⚙️'} Tùy chỉnh Auto-Play`)
        .setDescription(lines.join('\n\n') + `\n\n📊 Tổng: **${totalItems}** bài · Trang ${page}/${totalPages}`)
        .setFooter({ text: config.bot.footer })
        .setTimestamp();

    const components = [];

    // Disable buttons for each track on this page (max 5 buttons per ActionRow)
    if (items.length > 0) {
        const buttons = items.map((item, idx) =>
            new ButtonBuilder()
                .setCustomId(`${AUTOPLAY_PREF_BUTTONS.PREF_DISABLE_PREFIX}${page}_${idx}`)
                .setLabel(`Tắt #${(page - 1) * PREFERENCES_PAGE_SIZE + idx + 1}`)
                .setStyle(ButtonStyle.Secondary)
        );
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
            components.push(row);
        }
    }

    // Pagination buttons (only if multiple pages)
    if (totalPages > 1) {
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(AUTOPLAY_PREF_BUTTONS.PREF_PREV_PAGE)
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(AUTOPLAY_PREF_BUTTONS.PREF_NEXT_PAGE)
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages)
        );
        components.push(navRow);
    }

    // "Disable All" button (only if there are preferences)
    if (totalItems > 0) {
        const disableAllRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(AUTOPLAY_PREF_BUTTONS.PREF_DISABLE_ALL)
                .setLabel('Tắt tất cả')
                .setEmoji('🚫')
                .setStyle(ButtonStyle.Danger)
        );
        components.push(disableAllRow);
    }

    return { embed, components };
}

/**
 * Handle button interactions from /mypreferences.
 * Called by the button router in interactionCreate.js.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} client
 */
export async function handlePreferencesButton(interaction, client) {
    const customId = interaction.customId;
    const service = getAutoPlayPreferenceService();

    try {
        // Parse current page from the message state
        const currentPage = parseCurrentPage(interaction.message);

        if (customId === AUTOPLAY_PREF_BUTTONS.PREF_DISABLE_ALL) {
            service.disableAllAutoPlay(interaction.user.id);
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.MUTED)
                        .setDescription('🚫 Đã tắt tất cả auto-play. Không còn bài auto-play nào.')
                        .setFooter({ text: client.config.bot.footer })
                        .setTimestamp()
                ],
                components: []
            });
            return;
        }

        if (customId === AUTOPLAY_PREF_BUTTONS.PREF_PREV_PAGE) {
            const result = service.getUserPreferences(interaction.user.id, currentPage - 1);
            const { embed, components } = buildPreferencesPage(result, client.config);
            await interaction.update({ embeds: [embed], components });
            return;
        }

        if (customId === AUTOPLAY_PREF_BUTTONS.PREF_NEXT_PAGE) {
            const result = service.getUserPreferences(interaction.user.id, currentPage + 1);
            const { embed, components } = buildPreferencesPage(result, client.config);
            await interaction.update({ embeds: [embed], components });
            return;
        }

        if (customId.startsWith(AUTOPLAY_PREF_BUTTONS.PREF_DISABLE_PREFIX)) {
            // Parse page and index from: `ap_pref_disable_{page}_{idx}`
            const parts = customId.slice(AUTOPLAY_PREF_BUTTONS.PREF_DISABLE_PREFIX.length).split('_');
            const page = parseInt(parts[0], 10);
            const idx = parseInt(parts[1], 10);

            // Re-fetch the current page to get the actual track
            const result = service.getUserPreferences(interaction.user.id, page);
            const item = result.items[idx];

            if (!item) {
                await interaction.reply({ content: '❌ Bài hát không tìm thấy.', ephemeral: true });
                return;
            }

            service.disableAutoPlay(interaction.user.id, item.track_url);

            // Refresh the page
            const refreshed = service.getUserPreferences(interaction.user.id, page);

            if (refreshed.totalItems === 0) {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.MUTED)
                            .setDescription(
                                `🚫 Đã tắt auto-play cho **${truncate(item.track_title, 40)}**.\n\nKhông còn bài auto-play nào.`
                            )
                            .setFooter({ text: client.config.bot.footer })
                            .setTimestamp()
                    ],
                    components: []
                });
            } else {
                // Stay on a valid page
                const safePage = Math.min(page, refreshed.totalPages);
                const pageResult = service.getUserPreferences(interaction.user.id, safePage);
                const { embed, components } = buildPreferencesPage(pageResult, client.config);
                embed.setDescription(`🚫 Đã tắt: **${truncate(item.track_title, 35)}**\n\n` + embed.data.description);
                await interaction.update({ embeds: [embed], components });
            }
            return;
        }
    } catch (error) {
        if (error.code === 10062) {
            logger.debug('Interaction expired (mypreferences button)');
            return;
        }
        logger.error('Error handling preferences button', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Đã xảy ra lỗi.', ephemeral: true }).catch(() => {});
        }
    }
}

/**
 * Parse current page number from the embed description text.
 * Looks for "Trang X/Y" pattern.
 *
 * @param {import('discord.js').Message} message
 * @returns {number}
 */
function parseCurrentPage(message) {
    const desc = message?.embeds?.[0]?.description || '';
    const match = desc.match(/Trang (\d+)\/(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
}

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
}
