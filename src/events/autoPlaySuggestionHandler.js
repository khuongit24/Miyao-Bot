/**
 * Auto-Play Suggestion Handler
 *
 * Handles the UX flow for suggesting auto-play and processing user responses:
 *   - Sends non-intrusive suggestion messages after a track starts playing
 *   - Processes "Enable" / "No thanks" button clicks
 *   - Handles instant-skip detection and disable prompt
 *   - Auto-dismisses unresponded suggestions after a timeout
 *
 * Anti-spam rules:
 *   - Only one suggestion per user per session (Map-based dedup)
 *   - Suggestions are sent as follow-up messages, not modifying the current embed
 *   - Auto-deleted after SUGGESTION_TIMEOUT_MS
 *
 * @module AutoPlaySuggestionHandler
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAutoPlayPreferenceService, INSTANT_SKIP_THRESHOLD_MS } from '../services/AutoPlayPreferenceService.js';
import { AUTOPLAY_PREF_BUTTONS } from '../utils/button-ids.js';
import { COLORS, ICONS } from '../config/design-system.js';
import { AUTOPLAY_PREF, AUTOPLAY_SUGGESTION } from '../utils/constants.js';
import logger from '../utils/logger.js';

// ─── Anti-spam: track active suggestions per user ────────────────────────────

/** Map<userId, { trackUrl, messageId, timeout }> — one suggestion at a time per user */
const activeSuggestions = new Map();

/** Maximum concurrent active suggestions per type (BUG-006: prevent unbounded growth) */
const MAX_AUTOPLAY_SUGGESTIONS = AUTOPLAY_SUGGESTION.MAX_AUTOPLAY_SUGGESTIONS;
const MAX_SKIP_PROMPTS = AUTOPLAY_SUGGESTION.MAX_SKIP_PROMPTS;

/**
 * Count active suggestions by type.
 * Keys starting with 'skip:' are skip prompts; all others are auto-play suggestions.
 * @returns {{ autoplaySuggestions: number, skipPrompts: number }}
 */
function countSuggestionsByType() {
    let autoplaySuggestions = 0;
    let skipPrompts = 0;
    for (const [key] of activeSuggestions) {
        if (key.startsWith('skip:')) {
            skipPrompts++;
        } else {
            autoplaySuggestions++;
        }
    }
    return { autoplaySuggestions, skipPrompts };
}

/** Map<`${userId}:${trackUrl}`, timestamp> — tracks auto-played this session for skip detection */
const autoPlayedTracks = new Map();

// Periodically clean up old entries (every 5 minutes)
// BUG-005: Store interval reference for clean shutdown
const cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of autoPlayedTracks) {
        if (now - ts > AUTOPLAY_SUGGESTION.TRACK_TTL_MS) autoPlayedTracks.delete(key);
    }
}, AUTOPLAY_SUGGESTION.TRACK_CLEANUP_INTERVAL_MS);
cleanupIntervalId.unref();

// ─── Suggestion Flow ─────────────────────────────────────────────────────────

/**
 * Check if a suggestion should be shown and send it.
 * Called after a track starts playing via search confirmation.
 *
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {string} userId
 * @param {{ url: string, title: string, author?: string }} track
 * @param {object} config - client.config
 */
export async function maybeSendAutoPlaySuggestion(channel, userId, track, config) {
    try {
        // Anti-spam: skip if user already has an active suggestion
        if (activeSuggestions.has(userId)) return;

        // BUG-006: Cap auto-play suggestions independently from skip prompts
        const { autoplaySuggestions } = countSuggestionsByType();
        if (autoplaySuggestions >= MAX_AUTOPLAY_SUGGESTIONS) return;

        const service = getAutoPlayPreferenceService();
        if (!service.shouldSuggestAutoPlay(userId, track.url)) return;

        // Build suggestion message (lightweight — no embed, just text + 2 buttons)
        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setDescription(
                `${ICONS.AUTOPLAY || '🔄'} Bạn đã nghe **${truncate(track.title, 40)}** nhiều lần.\n` +
                    'Bật auto-play để lần sau bot phát luôn nhé?'
            )
            .setFooter({ text: config.bot.footer })
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(AUTOPLAY_PREF_BUTTONS.SUGGESTION_ACCEPT)
                .setLabel('Bật Auto-Play')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(AUTOPLAY_PREF_BUTTONS.SUGGESTION_DISMISS)
                .setLabel('Không, cảm ơn')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary)
        );

        const message = await channel.send({ embeds: [embed], components: [buttons] });

        // Store active suggestion state
        const timeout = setTimeout(async () => {
            activeSuggestions.delete(userId);
            try {
                await message.delete().catch(() => {});
            } catch {
                // Message may already be deleted
            }
        }, AUTOPLAY_PREF.SUGGESTION_TIMEOUT_MS);

        activeSuggestions.set(userId, {
            trackUrl: track.url,
            track,
            messageId: message.id,
            timeout
        });

        logger.debug('Sent auto-play suggestion', { userId, trackUrl: track.url.substring(0, 60) });
    } catch (error) {
        logger.error('Failed to send auto-play suggestion', { userId, error: error.message });
    }
}

/**
 * Handle the "Enable Auto-Play" button click.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} client
 */
export async function handleSuggestionAccept(interaction, client) {
    const userId = interaction.user.id;
    const suggestion = activeSuggestions.get(userId);

    if (!suggestion) {
        await interaction
            .reply({
                content: '⏰ Đề nghị này đã hết hạn.',
                ephemeral: true
            })
            .catch(() => {});
        return;
    }

    // Clear the timeout and remove from active
    clearTimeout(suggestion.timeout);
    activeSuggestions.delete(userId);

    const service = getAutoPlayPreferenceService();
    const success = service.enableAutoPlay(userId, suggestion.track);

    if (success) {
        await interaction
            .update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.SUCCESS)
                        .setDescription(
                            `${ICONS.SUCCESS || '✅'} Đã bật auto-play cho **${truncate(suggestion.track.title, 40)}**!\n` +
                                'Lần sau bạn tìm bài này, bot sẽ phát luôn.'
                        )
                        .setFooter({ text: client.config.bot.footer })
                        .setTimestamp()
                ],
                components: []
            })
            .catch(() => {});

        // Auto-delete after 10s to keep chat clean
        setTimeout(async () => {
            try {
                const msg = await interaction.message?.fetch().catch(() => null);
                await msg?.delete().catch(() => {});
            } catch {
                // Ignore
            }
        }, AUTOPLAY_SUGGESTION.ACCEPT_MESSAGE_DELETE_DELAY_MS);
    } else {
        await interaction
            .update({
                content: '❌ Không thể bật auto-play. Thử lại sau nhé!',
                embeds: [],
                components: []
            })
            .catch(() => {});
    }
}

/**
 * Handle the "No thanks" button click.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleSuggestionDismiss(interaction) {
    const userId = interaction.user.id;
    const suggestion = activeSuggestions.get(userId);

    if (!suggestion) {
        await interaction
            .reply({
                content: '⏰ Đề nghị này đã hết hạn.',
                ephemeral: true
            })
            .catch(() => {});
        return;
    }

    clearTimeout(suggestion.timeout);
    activeSuggestions.delete(userId);

    const service = getAutoPlayPreferenceService();
    service.recordSuggestionDismissal(userId, suggestion.trackUrl);

    await interaction
        .update({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.MUTED)
                    .setDescription(`${ICONS.INFO || 'ℹ️'} Đã ghi nhận. Sẽ không hỏi lại trong 30 ngày.`)
                    .setFooter({ text: interaction.client?.config?.bot?.footer || 'Miyao Music Bot' })
                    .setTimestamp()
            ],
            components: []
        })
        .catch(() => {});

    // Auto-delete after 5s
    setTimeout(async () => {
        try {
            const msg = await interaction.message?.fetch().catch(() => null);
            await msg?.delete().catch(() => {});
        } catch {
            // Ignore
        }
    }, AUTOPLAY_SUGGESTION.DISMISS_MESSAGE_DELETE_DELAY_MS);
}

// ─── Auto-Play Execution ─────────────────────────────────────────────────────

/**
 * Check if a track should be auto-played for the user.
 * Returns the matched preference or null.
 *
 * @param {string} userId
 * @param {string} trackUrl
 * @returns {{ trackUrl: string, trackTitle: string, confidence: number } | null}
 */
export function checkAutoPlay(userId, trackUrl) {
    try {
        const service = getAutoPlayPreferenceService();
        return service.findAutoPlayMatch(userId, trackUrl);
    } catch {
        return null;
    }
}

/**
 * Check ALL search result tracks against auto-play preferences.
 * Returns the highest-confidence match and its index in the results array.
 *
 * This fixes the bug where a user saved a preference for a specific version
 * (e.g., OST lyrics version) but the search always shows the MV version first.
 * By scanning all results, the system can find and auto-play the preferred version.
 *
 * @param {string} userId
 * @param {Array<{ info?: { uri?: string }, uri?: string, url?: string }>} tracks - Search result tracks
 * @returns {{ trackUrl: string, trackTitle: string, trackAuthor: string|null, confidence: number, matchIndex: number } | null}
 */
export function checkAutoPlayFromResults(userId, tracks) {
    if (!userId || !tracks || tracks.length === 0) return null;

    try {
        const trackUrls = tracks.map(t => t.info?.uri || t.uri || t.url || '').filter(Boolean);
        if (trackUrls.length === 0) return null;

        const service = getAutoPlayPreferenceService();
        return service.findAutoPlayMatchFromResults(userId, trackUrls);
    } catch {
        return null;
    }
}

/**
 * Get the confirmation progress for showing user feedback.
 * Returns null if not enough confirmations to be meaningful (< 2).
 *
 * @param {string} userId
 * @param {string} trackUrl
 * @returns {{ current: number, threshold: number } | null}
 */
export function getConfirmationProgress(userId, trackUrl) {
    try {
        const service = getAutoPlayPreferenceService();
        return service.getConfirmationProgress(userId, trackUrl);
    } catch {
        return null;
    }
}

/**
 * Mark a track as auto-played for skip detection.
 *
 * @param {string} userId
 * @param {string} trackUrl
 */
export function markAutoPlayed(userId, trackUrl) {
    const key = `${userId}:${trackUrl}`;
    autoPlayedTracks.set(key, Date.now());

    const service = getAutoPlayPreferenceService();
    service.recordAutoPlay(userId, trackUrl);
}

/**
 * Check if a skip event is an "instant rejection" of an auto-played track.
 * Returns the track info if it was an instant skip, or null otherwise.
 *
 * @param {string} userId
 * @param {string} trackUrl
 * @returns {{ trackUrl: string, elapsedMs: number } | null}
 */
export function detectInstantSkip(userId, trackUrl) {
    const key = `${userId}:${trackUrl}`;
    const startTime = autoPlayedTracks.get(key);

    if (!startTime) return null;

    const elapsedMs = Date.now() - startTime;
    autoPlayedTracks.delete(key);

    if (elapsedMs <= INSTANT_SKIP_THRESHOLD_MS) {
        return { trackUrl, elapsedMs };
    }

    return null;
}

/**
 * Send the "disable auto-play?" prompt after an instant skip.
 *
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {string} userId
 * @param {{ url: string, title: string }} track
 * @param {object} config
 */
export async function sendInstantSkipPrompt(channel, userId, track, config) {
    try {
        // Budget check: cap skip prompts independently from auto-play suggestions
        const { skipPrompts } = countSuggestionsByType();
        if (skipPrompts >= MAX_SKIP_PROMPTS) return;

        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setDescription(
                `⚡ Bạn đã skip nhanh bài **${truncate(track.title, 40)}** (auto-play).\n` +
                    'Tắt auto-play cho bài này?'
            )
            .setFooter({ text: config.bot.footer })
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(AUTOPLAY_PREF_BUTTONS.DISABLE_CONFIRM)
                .setLabel('Tắt Auto-Play')
                .setEmoji('🚫')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(AUTOPLAY_PREF_BUTTONS.DISABLE_CANCEL)
                .setLabel('Giữ lại')
                .setEmoji('👍')
                .setStyle(ButtonStyle.Secondary)
        );

        const message = await channel.send({ embeds: [embed], components: [buttons] });

        // Store context for the button handler
        activeSuggestions.set(`skip:${userId}`, {
            trackUrl: track.url,
            track,
            messageId: message.id,
            timeout: setTimeout(async () => {
                activeSuggestions.delete(`skip:${userId}`);
                try {
                    await message.delete().catch(() => {});
                } catch {
                    /* ignore */
                }
            }, 60_000) // 1 minute timeout
        });
    } catch (error) {
        logger.error('Failed to send instant skip prompt', { userId, error: error.message });
    }
}

/**
 * Handle "Disable auto-play" confirmation after instant skip.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} client
 */
export async function handleDisableConfirm(interaction, client) {
    const userId = interaction.user.id;
    const key = `skip:${userId}`;
    const context = activeSuggestions.get(key);

    if (!context) {
        await interaction.reply({ content: '⏰ Đề nghị này đã hết hạn.', ephemeral: true }).catch(() => {});
        return;
    }

    clearTimeout(context.timeout);
    activeSuggestions.delete(key);

    const service = getAutoPlayPreferenceService();
    service.disableAutoPlay(userId, context.trackUrl);

    await interaction
        .update({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.MUTED)
                    .setDescription(`🚫 Đã tắt auto-play cho **${truncate(context.track.title, 40)}**.`)
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp()
            ],
            components: []
        })
        .catch(() => {});

    setTimeout(async () => {
        try {
            const msg = await interaction.message?.fetch().catch(() => null);
            await msg?.delete().catch(() => {});
        } catch {
            /* ignore */
        }
    }, 5_000);
}

/**
 * Handle "Keep auto-play" choice after instant skip.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} client
 */
export async function handleDisableCancel(interaction, client) {
    const userId = interaction.user.id;
    const key = `skip:${userId}`;
    const context = activeSuggestions.get(key);

    if (!context) {
        await interaction.reply({ content: '⏰ Đề nghị này đã hết hạn.', ephemeral: true }).catch(() => {});
        return;
    }

    clearTimeout(context.timeout);
    activeSuggestions.delete(key);

    // BUG-015: Do NOT penalize confidence when user explicitly chooses "Keep"
    // Previously called recordInstantSkip() which would silently auto-disable after 3 "Keep" clicks

    await interaction
        .update({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setDescription(`👍 Auto-play cho **${truncate(context.track.title, 40)}** vẫn được giữ.`)
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp()
            ],
            components: []
        })
        .catch(() => {});

    setTimeout(async () => {
        try {
            const msg = await interaction.message?.fetch().catch(() => null);
            await msg?.delete().catch(() => {});
        } catch {
            /* ignore */
        }
    }, 5_000);
}

/**
 * Record that the user listened to the full track (track ended naturally).
 * Called from the track-end event handler.
 *
 * @param {string} userId - The requester's user ID
 * @param {string} trackUrl
 */
export function recordTrackEndFullListen(userId, trackUrl) {
    const key = `${userId}:${trackUrl}`;
    const startTime = autoPlayedTracks.get(key);

    // Only record if this was an auto-played track
    if (!startTime) return;

    autoPlayedTracks.delete(key);

    // If they listened more than 30 seconds, count as full listen
    const elapsed = Date.now() - startTime;
    if (elapsed > 30_000) {
        const service = getAutoPlayPreferenceService();
        service.recordFullListen(userId, trackUrl);
    }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
}

// ─── Cleanup API (for destroyQueue and shutdown) ─────────────────────────────

/**
 * Clean up auto-play suggestion state for a specific guild.
 * Called from MusicManager.destroyQueue() to prevent stale Map entries.
 * BUG-004: Exported for external cleanup.
 *
 * @param {string} userId - User ID whose suggestion should be cleaned
 */
export function cleanupSuggestionsForUser(userId) {
    // Clean regular suggestion
    const suggestion = activeSuggestions.get(userId);
    if (suggestion) {
        clearTimeout(suggestion.timeout);
        activeSuggestions.delete(userId);
    }

    // Clean skip prompt
    const skipKey = `skip:${userId}`;
    const skipSuggestion = activeSuggestions.get(skipKey);
    if (skipSuggestion) {
        clearTimeout(skipSuggestion.timeout);
        activeSuggestions.delete(skipKey);
    }

    // Clean autoPlayedTracks entries for this user
    for (const [key] of autoPlayedTracks) {
        if (key.startsWith(`${userId}:`)) {
            autoPlayedTracks.delete(key);
        }
    }
}

/**
 * Shut down the auto-play suggestion handler.
 * Clears all timers and Maps for clean process exit.
 * BUG-005: Called from gracefulShutdown in index.js.
 */
export function shutdownAutoPlayHandler() {
    clearInterval(cleanupIntervalId);

    // Clear all active suggestion timeouts
    for (const [, suggestion] of activeSuggestions) {
        if (suggestion.timeout) clearTimeout(suggestion.timeout);
    }
    activeSuggestions.clear();
    autoPlayedTracks.clear();
}
