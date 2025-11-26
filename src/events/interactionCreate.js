import logger from '../utils/logger.js';
import { handleMusicButton, handleQueueButton, handleSearchSelect, handleHistoryReplaySelect, handleDiscoverySelect, handleQueueRemoveTrackModalSubmit } from './buttonHandler.js';
import { handleHelpCategory, handleFeedback, handleBugReport, handleFeedbackSubmit, handleBugReportSubmit } from './helpHandler.js';
import { handlePlaylistButton, handlePlaylistModalSubmit } from './playlistHandler.js';
import { commandRateLimiter } from '../utils/rate-limiter.js';
import Playlist from '../database/models/Playlist.js';
import { getEventQueue, Priority } from '../utils/EventQueue.js';

// Commands that are CPU/IO intensive and should be queued
const HEAVY_COMMANDS = new Set([
    'play', 'playlist', 'discover', 'similar', 'trending', 
    'lyrics', 'history', 'stats', 'mystats', 'serverstats', 'leaderboard'
]);

// Commands that need immediate response (user-facing controls)
const INSTANT_COMMANDS = new Set([
    'pause', 'resume', 'skip', 'stop', 'volume', 'nowplaying', 
    'queue', 'shuffle', 'loop', 'seek'
]);

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
            logger.debug(`Interaction is not a chat input command or button, ignoring`);
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
        if (interaction.commandName === 'playlist') {
            const focusedOption = interaction.options.getFocused(true);
            
            if (focusedOption.name === 'name') {
                const query = focusedOption.value.toLowerCase();
                
                // Get user's own playlists
                const userPlaylists = Playlist.getByOwner(interaction.user.id, interaction.guildId);
                
                // Get public playlists in the guild (from other users/bot)
                const publicPlaylists = Playlist.getPublic(interaction.guildId);
                
                // Combine and deduplicate (user's own playlists take priority)
                const userPlaylistNames = new Set(userPlaylists.map(p => p.name));
                const combinedPlaylists = [
                    ...userPlaylists,
                    ...publicPlaylists.filter(p => !userPlaylistNames.has(p.name))
                ];
                
                // Filter by search query
                const filtered = combinedPlaylists.filter(p => 
                    p.name.toLowerCase().includes(query)
                );
                
                // Create choices with indicator for public vs own playlists
                const choices = filtered.slice(0, 25).map(p => {
                    const isOwn = p.owner_id === interaction.user.id;
                    const prefix = isOwn ? '📁' : '🌐';
                    return {
                        name: `${prefix} ${p.name} (${p.track_count || 0} bài hát)`,
                        value: p.name
                    };
                });
                
                await interaction.respond(choices);
            }
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
        } else if (interaction.customId.startsWith('playlist_') || 
                   interaction.customId.startsWith('add_current_track_to_playlist') ||
                   interaction.customId.startsWith('add_queue_to_playlist')) {
            await handlePlaylistModalSubmit(interaction, client);
        } else if (interaction.customId === 'queue_remove_track_modal') {
            await handleQueueRemoveTrackModalSubmit(interaction, client);
        }
        
        logger.info(`Modal handled successfully: ${interaction.customId}`);
    } catch (error) {
        logger.error(`Error handling modal ${interaction.customId}`, error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xử lý form!',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle string select menu interactions
 */
async function handleSelectMenu(interaction, client) {
    logger.debug(`Select menu used: ${interaction.customId}`);
    
    try {
        if (interaction.customId === 'help_category') {
            await handleHelpCategory(interaction, client);
        } else if (interaction.customId === 'search_select') {
            await handleSearchSelect(interaction, client);
        } else if (interaction.customId === 'history_replay_select') {
            await handleHistoryReplaySelect(interaction, client);
        } else if (interaction.customId.startsWith('discover_select_')) {
            await handleDiscoverySelect(interaction, client, 'discover');
        } else if (interaction.customId.startsWith('similar_select_')) {
            await handleDiscoverySelect(interaction, client, 'similar');
        } else if (interaction.customId.startsWith('trending_select_')) {
            await handleDiscoverySelect(interaction, client, 'trending');
        }
        
        logger.info(`Select menu handled successfully: ${interaction.customId}`);
    } catch (error) {
        logger.error(`Error handling select menu ${interaction.customId}`, error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xử lý menu!',
                ephemeral: true
            });
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
        }
        
        // Playlist management buttons
        if (interaction.customId.startsWith('playlist_')) {
            await handlePlaylistButton(interaction, client);
        }
        // Queue navigation buttons (pagination only)
        else if (interaction.customId.startsWith('queue_') && 
                 ['queue_first', 'queue_previous', 'queue_refresh', 'queue_next', 'queue_last'].includes(interaction.customId)) {
            await handleQueueButton(interaction, client.musicManager.getQueue(interaction.guildId), client);
        }
        // Queue action buttons (add to playlist, remove track) - route to music button handler
        else if (interaction.customId === 'queue_add_to_playlist' || interaction.customId === 'queue_remove_track') {
            await handleMusicButton(interaction, client);
        }
        // Music control buttons, search selection, or history replay
        else if (interaction.customId.startsWith('music_') || interaction.customId.startsWith('search_') || interaction.customId.startsWith('history_replay_')) {
            await handleMusicButton(interaction, client);
        }
        
        logger.info(`Button handled successfully: ${interaction.customId}`);
    } catch (error) {
        logger.error(`Error handling button ${interaction.customId}`, error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xử lý nút này!',
                ephemeral: true
            });
        }
    }
}

/**
 * Handle context menu commands
 */
async function handleContextMenu(interaction, client) {
    logger.debug(`Context menu command: ${interaction.commandName}`);
    
    try {
        const contextMenus = await import('../commands/social/context-menus.js');
        
        if (interaction.commandName === 'Thêm vào Queue') {
            await contextMenus.addToQueueContextMenu.execute(interaction, client);
        } else if (interaction.commandName === 'Thêm vào Playlist') {
            await contextMenus.addToPlaylistContextMenu.execute(interaction, client);
        }
        
        logger.info(`Context menu handled successfully: ${interaction.commandName}`);
    } catch (error) {
        logger.error(`Error handling context menu ${interaction.commandName}`, error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi thực thi context menu!',
                ephemeral: true
            });
        }
    }
}

/**
 * Process slash command with queueing for heavy commands
 */
async function processSlashCommand(interaction, client) {
    logger.info(`Command received: /${interaction.commandName} from ${interaction.user.tag} in ${interaction.guild?.name || 'DM'}`);
    
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
    
    // Determine if command should be queued
    const commandName = interaction.commandName;
    const shouldQueue = HEAVY_COMMANDS.has(commandName);
    const isInstant = INSTANT_COMMANDS.has(commandName);
    
    // Get event queue
    const eventQueue = getEventQueue();
    
    // Check backpressure - if critical, defer heavy commands
    if (shouldQueue && eventQueue.isCritical) {
        logger.warn(`EventQueue critical - deferring heavy command: ${commandName}`);
        
        // Show backpressure message
        await interaction.reply({
            content: '⏳ Server đang xử lý nhiều request. Lệnh của bạn đang được xếp hàng, vui lòng đợi...',
            ephemeral: true
        });
        
        // Queue with normal priority
        const enqueued = await eventQueue.enqueue(
            async (ctx) => {
                try {
                    await executeCommand(ctx.interaction, ctx.client, ctx.command);
                    // Edit the reply to show completion
                    await ctx.interaction.editReply({
                        content: '✅ Đã xử lý xong!'
                    }).catch(() => {});
                } catch (error) {
                    logger.error(`Queued command error: ${ctx.commandName}`, error);
                }
            },
            { interaction, client, command, commandName },
            Priority.NORMAL
        );
        
        if (!enqueued) {
            await interaction.editReply({
                content: '❌ Server quá tải! Vui lòng thử lại sau vài giây.'
            }).catch(() => {});
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
        logger.error(`Error executing command ${interaction.commandName}`, error);
        
        // Track error
        if (client.metrics) {
            client.metrics.trackCommand(interaction.commandName, false);
            client.metrics.trackError(error, 'command');
        }
        
        const errorMessage = {
            content: '❌ Đã xảy ra lỗi khi thực thi lệnh này!',
            ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}
