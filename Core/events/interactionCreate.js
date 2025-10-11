import logger from '../utils/logger.js';
import { handleMusicButton, handleQueueButton, handleSearchSelect, handleHistoryReplaySelect, handleDiscoverySelect, handleQueueRemoveTrackModalSubmit } from './buttonHandler.js';
import { handleHelpCategory, handleFeedback, handleBugReport, handleFeedbackSubmit, handleBugReportSubmit } from './helpHandler.js';
import { handlePlaylistButton, handlePlaylistModalSubmit } from './playlistHandler.js';
import { commandRateLimiter } from '../utils/rate-limiter.js';
import Playlist from '../database/models/Playlist.js';

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            logger.debug(`Autocomplete requested: ${interaction.commandName}`);
            
            try {
                // Handle playlist name autocomplete
                if (interaction.commandName === 'playlist') {
                    const focusedOption = interaction.options.getFocused(true);
                    
                    if (focusedOption.name === 'name') {
                        const query = focusedOption.value.toLowerCase();
                        
                        // Get user's playlists in this guild
                        const playlists = Playlist.getByOwner(interaction.user.id, interaction.guildId);
                        
                        // Filter by query
                        const filtered = playlists.filter(p => 
                            p.name.toLowerCase().includes(query)
                        );
                        
                        // Limit to 25 (Discord limit)
                        const choices = filtered.slice(0, 25).map(p => ({
                            name: `${p.name} (${p.track_count || 0} bài hát)`,
                            value: p.name
                        }));
                        
                        await interaction.respond(choices);
                    }
                }
            } catch (error) {
                logger.error(`Error handling autocomplete for ${interaction.commandName}`, error);
                // Silently fail autocomplete - just return empty array
                await interaction.respond([]).catch(() => {});
            }
            
            return;
        }
        
        // Log all interactions for debugging
        logger.debug(`Received interaction: ${interaction.type} from ${interaction.user.tag}`);
        
        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            logger.debug(`Modal submitted: ${interaction.customId}`);
            
            try {
                if (interaction.customId === 'feedback_modal') {
                    await handleFeedbackSubmit(interaction, client);
                } else if (interaction.customId === 'bugreport_modal') {
                    await handleBugReportSubmit(interaction, client);
                } else if (interaction.customId.startsWith('playlist_') || 
                           interaction.customId.startsWith('add_current_track_to_playlist') ||
                           interaction.customId.startsWith('add_queue_to_playlist')) {
                    // Handle all playlist modal submissions
                    await handlePlaylistModalSubmit(interaction, client);
                } else if (interaction.customId === 'queue_remove_track_modal') {
                    // Handle queue track removal modal
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
            
            return;
        }
        
        // Handle string select menu
        if (interaction.isStringSelectMenu()) {
            logger.debug(`Select menu used: ${interaction.customId}`);
            
            try {
                if (interaction.customId === 'help_category') {
                    await handleHelpCategory(interaction, client);
                } else if (interaction.customId === 'search_select') {
                    // Handle song selection dropdown
                    await handleSearchSelect(interaction, client);
                } else if (interaction.customId === 'history_replay_select') {
                    // Handle history replay selection dropdown
                    await handleHistoryReplaySelect(interaction, client);
                } else if (interaction.customId.startsWith('discover_select_')) {
                    // Handle discover selection dropdown
                    await handleDiscoverySelect(interaction, client, 'discover');
                } else if (interaction.customId.startsWith('similar_select_')) {
                    // Handle similar selection dropdown
                    await handleDiscoverySelect(interaction, client, 'similar');
                } else if (interaction.customId.startsWith('trending_select_')) {
                    // Handle trending selection dropdown
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
            
            return;
        }
        
        // Handle button interactions
        if (interaction.isButton()) {
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
                
                // Check if it's a playlist management button
                if (interaction.customId.startsWith('playlist_')) {
                    await handlePlaylistButton(interaction, client);
                }
                // Check if it's a queue navigation button
                else if (interaction.customId.startsWith('queue_')) {
                    await handleQueueButton(interaction, client.musicManager.getQueue(interaction.guildId), client);
                }
                // Check if it's a music control button, search selection (including confirm/detailed), or history replay
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
            
            return;
        }
        
        // Handle context menu commands (check for method existence)
        if (interaction.isContextMenuCommand && interaction.isContextMenuCommand()) {
            logger.debug(`Context menu command: ${interaction.commandName}`);
            
            try {
                // Load context menu commands
                const contextMenus = await import('../commands/context-menus.js');
                
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
            
            return;
        }
        
        // Handle slash commands
        if (!interaction.isChatInputCommand()) {
            logger.debug(`Interaction is not a chat input command or button, ignoring`);
            return;
        }
        
        logger.info(`Command received: /${interaction.commandName} from ${interaction.user.tag} in ${interaction.guild?.name || 'DM'}`);
        
        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
            logger.warn(`Unknown command: ${interaction.commandName}`);
            return;
        }
        
        // Check rate limit for commands
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
};
