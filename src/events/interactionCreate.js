import logger from '../utils/logger.js';
import {
    handleMusicButton,
    handleQueueButton,
    handleSearchSelect,
    handleHistoryReplaySelect,
    handlePersonalHistorySelect,
    handleDiscoverySelect,
    handleDiscoveryButton,
    handleQueueRemoveTrackModalSubmit
} from './buttons/index.js';
import { handleFilterSelect, handleVolumeSelect } from './menus/MenuHandlers.js';
import {
    handleHelpCategory,
    handleFeedback,
    handleBugReport,
    handleFeedbackSubmit,
    handleBugReportSubmit,
    handleShowHelpMenu,
    handleShowAllCommands
} from './helpHandler.js';
import { handlePlaylistButton, handlePlaylistModalSubmit, handlePlaylistAutocomplete } from './playlists/index.js';
import {
    handleSuggestionAccept,
    handleSuggestionDismiss,
    handleDisableConfirm,
    handleDisableCancel
} from './autoPlaySuggestionHandler.js';
import { handlePreferencesButton } from '../commands/settings/mypreferences.js';
import { commandRateLimiter } from '../utils/rate-limiter.js';
import { getEventQueue, Priority } from '../utils/EventQueue.js';
import * as contextMenusModule from '../commands/social/context-menus.js';

// Commands that are CPU/IO intensive and should be queued
const HEAVY_COMMANDS = new Set([
    'play',
    'playlist',
    'discover',
    'similar',
    'trending',
    'lyrics',
    'history',
    'stats',
    'mystats',
    'serverstats',
    'leaderboard'
]);

// Commands that need immediate response (user-facing controls)
const INSTANT_COMMANDS = new Set([
    'pause',
    'resume',
    'skip',
    'stop',
    'volume',
    'nowplaying',
    'queue',
    'shuffle',
    'loop',
    'seek',
    'mypreferences'
]);

// Button Rate Limiter (10 clicks per 5 seconds)
const BUTTON_RATE_LIMIT = 10;
const BUTTON_WINDOW_MS = 5000;
const buttonUsage = new Map();

// BUG-MW01: Tiered rate limiting for heavy commands (3 per 30s)
const HEAVY_COMMAND_RATE_LIMIT = 3;
const HEAVY_COMMAND_WINDOW_MS = 30000;
const heavyCommandUsage = new Map();

// Periodic cleanup for heavyCommandUsage to prevent unbounded Map growth
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of heavyCommandUsage.entries()) {
        if (now > value.resetAt) heavyCommandUsage.delete(key);
    }
}, HEAVY_COMMAND_WINDOW_MS * 6).unref();

/**
 * BUG-MW01: Check if user exceeded heavy command rate limit
 * @param {string} userId
 * @param {string} commandName
 * @returns {{ allowed: boolean, remaining?: number, resetIn?: number, reason?: string }}
 */
function checkHeavyCommandRateLimit(userId, commandName) {
    if (!HEAVY_COMMANDS.has(commandName)) return { allowed: true };

    const now = Date.now();
    const key = `${userId}:heavy`;
    const usage = heavyCommandUsage.get(key);

    if (!usage || now >= usage.resetAt) {
        heavyCommandUsage.set(key, { count: 1, resetAt: now + HEAVY_COMMAND_WINDOW_MS });
        return { allowed: true, remaining: HEAVY_COMMAND_RATE_LIMIT - 1 };
    }

    if (usage.count < HEAVY_COMMAND_RATE_LIMIT) {
        usage.count++;
        return { allowed: true, remaining: HEAVY_COMMAND_RATE_LIMIT - usage.count };
    }

    return {
        allowed: false,
        remaining: 0,
        resetIn: usage.resetAt - now,
        reason: 'Bạn đang sử dụng quá nhiều lệnh nặng (play, search, lyrics...)! Vui lòng đợi.'
    };
}

/**
 * Check if user exceeded button rate limit
 * @param {string} userId
 * @returns {boolean} True if rate limited
 */
function checkButtonRateLimit(userId) {
    const now = Date.now();
    const userUsage = buttonUsage.get(userId) || { count: 0, resetAt: now + BUTTON_WINDOW_MS };

    if (now > userUsage.resetAt) {
        userUsage.count = 0;
        userUsage.resetAt = now + BUTTON_WINDOW_MS;
    }

    userUsage.count++;
    buttonUsage.set(userId, userUsage);

    if (userUsage.count > BUTTON_RATE_LIMIT) {
        return true;
    }

    // Auto-cleanup
    if (buttonUsage.size > 200) {
        // Simple cleanup of old entries
        for (const [key, value] of buttonUsage.entries()) {
            if (now > value.resetAt) buttonUsage.delete(key);
        }
    }

    return false;
}

// BUG-E09: Periodic proactive cleanup of buttonUsage Map to prevent unbounded growth
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buttonUsage.entries()) {
        if (now > value.resetAt) buttonUsage.delete(key);
    }
}, BUTTON_WINDOW_MS * 6).unref(); // Clean up every 30 seconds

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // Handle autocomplete interactions (always instant)
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction);
            return;
        }

        // Log all interactions for debugging
        logger.debug(`Received interaction: ${interaction.type} from ${interaction.user.tag}`);

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction, client);
            return;
        }

        // Handle string select menu
        if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction, client);
            return;
        }

        // Handle button interactions
        if (interaction.isButton()) {
            // Security H4: Button Interaction Rate Limit
            if (checkButtonRateLimit(interaction.user.id)) {
                await interaction.reply({
                    content: '⚠️ Bạn đang thao tác quá nhanh! Vui lòng đợi một chút.',
                    ephemeral: true
                });
                logger.warn(`Button rate limit hit for user ${interaction.user.id}`);
                return;
            }

            await handleButton(interaction, client);
            return;
        }

        // Handle context menu commands
        if (interaction.isContextMenuCommand && interaction.isContextMenuCommand()) {
            await handleContextMenu(interaction, client);
            return;
        }

        // Handle slash commands
        if (!interaction.isChatInputCommand()) {
            logger.debug('Interaction is not a chat input command or button, ignoring');
            return;
        }

        // Process slash command with potential queueing
        await processSlashCommand(interaction, client);
    }
};

/**
 * Handle autocomplete interactions
 */
async function handleAutocomplete(interaction) {
    logger.debug(`Autocomplete requested: ${interaction.commandName}`);

    try {
        // Handle help command autocomplete
        if (interaction.commandName === 'help') {
            const command = interaction.client.commands.get('help');
            if (command && command.autocomplete) {
                await command.autocomplete(interaction);
            }
            return;
        }

        if (interaction.commandName === 'playlist') {
            await handlePlaylistAutocomplete(interaction);
            return;
        }

        // BUG-E12: Generic fallback — delegate to command.autocomplete() if available
        const command = interaction.client.commands.get(interaction.commandName);
        if (command && typeof command.autocomplete === 'function') {
            await command.autocomplete(interaction);
        } else {
            await interaction.respond([]);
        }
    } catch (error) {
        logger.error(`Error handling autocomplete for ${interaction.commandName}`, error);
        await interaction.respond([]).catch(() => {});
    }
}

/**
 * Handle modal submissions
 */
async function handleModalSubmit(interaction, client) {
    logger.debug(`Modal submitted: ${interaction.customId}`);

    try {
        if (interaction.customId === 'feedback_modal') {
            await handleFeedbackSubmit(interaction, client);
        } else if (interaction.customId === 'bugreport_modal') {
            await handleBugReportSubmit(interaction, client);
        } else if (
            interaction.customId.startsWith('playlist_') ||
            interaction.customId.startsWith('add_current_track_to_playlist') ||
            interaction.customId.startsWith('add_queue_to_playlist')
        ) {
            await handlePlaylistModalSubmit(interaction, client);
        } else if (interaction.customId === 'queue_remove_track_modal') {
            await handleQueueRemoveTrackModalSubmit(interaction, client);
        }

        logger.info(`Modal handled successfully: ${interaction.customId}`);
    } catch (error) {
        if (error.code === 10062) {
            logger.debug(`Interaction expired (modal): ${interaction.customId}`);
            return;
        }
        logger.error(`Error handling modal ${interaction.customId}`, error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    content: '❌ Đã xảy ra lỗi khi xử lý form!',
                    ephemeral: true
                })
                .catch(() => {});
        }
    }
}

/**
 * Handle string select menu interactions
 */
async function handleSelectMenu(interaction, client) {
    logger.debug(`Select menu used: ${interaction.customId}`);

    // BUG-E04: Validate interaction.values before processing
    if (!interaction.values?.length) {
        logger.debug(`Select menu ${interaction.customId} has no values, ignoring`);
        return;
    }

    try {
        if (interaction.customId === 'help_category') {
            await handleHelpCategory(interaction, client);
        } else if (interaction.customId.startsWith('search_select')) {
            await handleSearchSelect(interaction, client);
        } else if (interaction.customId === 'history_replay_select') {
            await handleHistoryReplaySelect(interaction, client);
        } else if (interaction.customId.startsWith('history_personal_select_')) {
            await handlePersonalHistorySelect(interaction, client);
        } else if (interaction.customId.startsWith('discover_select_')) {
            await handleDiscoverySelect(interaction, client, 'discover');
        } else if (interaction.customId.startsWith('similar_select_')) {
            await handleDiscoverySelect(interaction, client, 'similar');
        } else if (interaction.customId.startsWith('trending_select_')) {
            await handleDiscoverySelect(interaction, client, 'trending');
        } else if (interaction.customId === 'context_menu_add_to_playlist') {
            // Handle context menu playlist selection
            await contextMenusModule.handleContextMenuPlaylistSelect(interaction, client);
        } else if (interaction.customId === 'music_filter_select') {
            await handleFilterSelect(interaction, client);
        } else if (interaction.customId === 'music_volume_select') {
            await handleVolumeSelect(interaction, client);
        }

        logger.info(`Select menu handled successfully: ${interaction.customId}`);
    } catch (error) {
        if (error.code === 10062) {
            logger.debug(`Interaction expired (select menu): ${interaction.customId}`);
            return;
        }
        logger.error(`Error handling select menu ${interaction.customId}`, error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    content: '❌ Đã xảy ra lỗi khi xử lý menu!',
                    ephemeral: true
                })
                .catch(() => {});
        }
    }
}

/**
 * Handle button interactions
 */
async function handleButton(interaction, client) {
    logger.debug(`Button pressed: ${interaction.customId}`);

    try {
        // Help system buttons
        if (interaction.customId === 'help_feedback') {
            await handleFeedback(interaction, client);
            return;
        } else if (interaction.customId === 'help_report') {
            await handleBugReport(interaction, client);
            return;
        } else if (interaction.customId === 'help_show_menu') {
            await handleShowHelpMenu(interaction, client);
            return;
        } else if (interaction.customId === 'help_show_all_commands') {
            await handleShowAllCommands(interaction, client);
            return;
        }

        // Playlist management buttons
        if (interaction.customId.startsWith('playlist_')) {
            await handlePlaylistButton(interaction, client);
        }
        // Queue navigation buttons (pagination only)
        else if (
            interaction.customId.startsWith('queue_') &&
            ['queue_first', 'queue_previous', 'queue_refresh', 'queue_next', 'queue_last'].some(prefix =>
                interaction.customId.startsWith(prefix)
            )
        ) {
            await handleQueueButton(interaction, client.musicManager.getQueue(interaction.guildId), client);
        }
        // Queue action buttons (add to playlist, remove track) - route to music button handler
        else if (interaction.customId === 'queue_add_to_playlist' || interaction.customId === 'queue_remove_track') {
            await handleMusicButton(interaction, client);
        }
        // Discovery buttons (similar, trending, discover - play all, shuffle)
        else if (
            interaction.customId.startsWith('similar_play_all_') ||
            interaction.customId.startsWith('trending_play_all_') ||
            interaction.customId.startsWith('trending_shuffle_') ||
            interaction.customId.startsWith('discover_play_all_') ||
            interaction.customId.startsWith('discover_shuffle_all_')
        ) {
            await handleDiscoveryButton(interaction, client);
        }
        // Music control buttons, search selection, or history replay
        else if (
            interaction.customId.startsWith('music_') ||
            interaction.customId.startsWith('search_') ||
            interaction.customId.startsWith('history_replay_')
        ) {
            await handleMusicButton(interaction, client);
        }
        // Auto-play preference buttons (suggestion accept/dismiss, disable confirm/cancel, prefs pagination)
        else if (interaction.customId.startsWith('ap_')) {
            const id = interaction.customId;
            if (id === 'ap_suggest_accept') {
                await handleSuggestionAccept(interaction, client);
            } else if (id === 'ap_suggest_dismiss') {
                await handleSuggestionDismiss(interaction);
            } else if (id === 'ap_disable_confirm') {
                await handleDisableConfirm(interaction, client);
            } else if (id === 'ap_disable_cancel') {
                await handleDisableCancel(interaction, client);
            } else if (id.startsWith('ap_pref_')) {
                await handlePreferencesButton(interaction, client);
            }
        } else {
            // BUG-E03: Unrecognized button - log and skip
            logger.debug(`Unhandled button customId: ${interaction.customId}`);
            return;
        }

        logger.info(`Button handled successfully: ${interaction.customId}`);
    } catch (error) {
        if (error.code === 10062) {
            logger.debug(`Interaction expired (button): ${interaction.customId}`);
            return;
        }
        logger.error(`Error handling button ${interaction.customId}`, error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    content: '❌ Đã xảy ra lỗi khi xử lý nút này!',
                    ephemeral: true
                })
                .catch(() => {});
        }
    }
}

/**
 * Handle context menu commands
 */
async function handleContextMenu(interaction, client) {
    logger.debug(`Context menu command: ${interaction.commandName}`);

    try {
        if (interaction.commandName === 'Thêm vào Queue') {
            await contextMenusModule.addToQueueContextMenu.execute(interaction, client);
        } else if (interaction.commandName === 'Thêm vào Playlist') {
            await contextMenusModule.addToPlaylistContextMenu.execute(interaction, client);
        }

        logger.info(`Context menu handled successfully: ${interaction.commandName}`);
    } catch (error) {
        if (error.code === 10062) {
            logger.debug(`Interaction expired (context menu): ${interaction.commandName}`);
            return;
        }
        logger.error(`Error handling context menu ${interaction.commandName}`, error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    content: '❌ Đã xảy ra lỗi khi thực thi context menu!',
                    ephemeral: true
                })
                .catch(() => {});
        }
    }
}

/**
 * Process slash command with queueing for heavy commands
 */
async function processSlashCommand(interaction, client) {
    logger.info(
        `Command received: /${interaction.commandName} from ${interaction.user.tag} in ${interaction.guild?.name || 'DM'}`
    );

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
    }

    // Check rate limit
    const isAdmin = interaction.member?.permissions?.has('Administrator') || false;
    const rateLimitCheck = commandRateLimiter.check(interaction.user.id, isAdmin);

    if (!rateLimitCheck.allowed) {
        logger.warn(`Rate limit exceeded for user ${interaction.user.id}`, {
            command: interaction.commandName,
            resetIn: rateLimitCheck.resetIn
        });

        await interaction.reply({
            content: `⏱️ ${rateLimitCheck.reason}\n\n**Thông tin:**\n• Còn lại: ${rateLimitCheck.remaining} lệnh\n• Reset sau: ${Math.ceil(rateLimitCheck.resetIn / 1000)} giây`,
            ephemeral: true
        });

        return;
    }

    // BUG-MW01: Tiered rate limiting - stricter limits for heavy/expensive commands
    const commandName = interaction.commandName;
    if (!isAdmin) {
        const heavyCheck = checkHeavyCommandRateLimit(interaction.user.id, commandName);
        if (!heavyCheck.allowed) {
            logger.warn(`Heavy command rate limit exceeded for user ${interaction.user.id}`, {
                command: commandName,
                resetIn: heavyCheck.resetIn
            });

            await interaction.reply({
                content: `⏱️ ${heavyCheck.reason}\n\n• Reset sau: ${Math.ceil(heavyCheck.resetIn / 1000)} giây`,
                ephemeral: true
            });

            return;
        }
    }

    // Determine if command should be queued
    const shouldQueue = HEAVY_COMMANDS.has(commandName);
    const isInstant = INSTANT_COMMANDS.has(commandName);

    // Get event queue
    const eventQueue = getEventQueue();

    // Check backpressure - if critical, defer heavy commands
    if (shouldQueue && eventQueue.isCritical) {
        logger.warn(`EventQueue critical - deferring heavy command: ${commandName}`);

        // Defer immediately to avoid double-reply when queued command executes later
        await interaction.deferReply({ ephemeral: true });
        try {
            await interaction.editReply({
                content: '⏳ Server đang xử lý nhiều request. Lệnh của bạn đang được xếp hàng, vui lòng đợi...'
            });
        } catch {
            // Ignore message update failures (interaction may expire)
        }

        // Queue with normal priority
        const enqueued = await eventQueue.enqueue(
            async ctx => {
                try {
                    // FIX-LB04: Check if interaction has expired before processing
                    // Discord interactions expire after 15 minutes (deferred) or 3 seconds (not deferred)
                    const queueWaitTime = Date.now() - ctx.enqueuedAt;
                    if (queueWaitTime > 14 * 60 * 1000) {
                        logger.debug(
                            `Queued interaction expired after ${Math.round(queueWaitTime / 1000)}s: ${ctx.commandName}`
                        );
                        return;
                    }

                    await executeCommand(ctx.interaction, ctx.client, ctx.command);

                    if (!ctx.interaction.replied && ctx.interaction.deferred) {
                        await ctx.interaction
                            .editReply({
                                content: '✅ Đã xử lý xong!'
                            })
                            .catch(() => {});
                    }
                } catch (error) {
                    if (error.code === 10062) {
                        logger.debug(`Queued interaction expired (10062): ${ctx.commandName}`);
                        return;
                    }
                    logger.error(`Queued command error: ${ctx.commandName}`, error);
                }
            },
            { interaction, client, command, commandName, enqueuedAt: Date.now() },
            Priority.NORMAL
        );

        if (!enqueued) {
            await interaction
                .editReply({
                    content: '❌ Server quá tải! Vui lòng thử lại sau vài giây.'
                })
                .catch(() => {});
        }

        return;
    }

    // Execute command directly (instant commands or non-critical queue state)
    await executeCommand(interaction, client, command);
}

/**
 * Execute a command and track metrics
 */
async function executeCommand(interaction, client, command) {
    try {
        const startTime = Date.now();
        await command.execute(interaction, client);
        const responseTime = Date.now() - startTime;

        // Track metrics
        if (client.metrics) {
            client.metrics.trackCommand(interaction.commandName, true, responseTime);
        }

        logger.info(`Command executed successfully: /${interaction.commandName} (${responseTime}ms)`);
    } catch (error) {
        if (error.code === 10062) {
            logger.debug(`Interaction expired (command): ${interaction.commandName}`);
            return;
        }
        logger.error(`Error executing command ${interaction.commandName}`, error);

        // Track error metrics
        if (client.metrics) {
            client.metrics.trackCommand(interaction.commandName, false);
            client.metrics.trackError(error, 'command');
        }

        // BUG-E01: Emit commandError event for external monitoring/handling
        try {
            client.emit('commandError', {
                command: interaction.commandName,
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                error
            });
        } catch (_) {
            /* never let event emission break error handling */
        }

        const errorMessage = {
            content: '❌ Đã xảy ra lỗi khi thực thi lệnh này!',
            ephemeral: true
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            if (replyError.code === 10062) {
                logger.debug(`Interaction expired while sending error (command): ${interaction.commandName}`);
            } else {
                logger.error(`Failed to send error reply for ${interaction.commandName}`, replyError);
            }
        }
    }
}
