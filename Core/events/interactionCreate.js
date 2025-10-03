import logger from '../utils/logger.js';
import { handleMusicButton, handleQueueButton, handleSearchSelect, handleHistoryReplaySelect } from './buttonHandler.js';
import { handleHelpCategory, handleFeedback, handleBugReport, handleFeedbackSubmit, handleBugReportSubmit } from './helpHandler.js';

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {
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
                
                // Check if it's a queue navigation button
                if (interaction.customId.startsWith('queue_')) {
                    await handleQueueButton(interaction, client.musicManager.getQueue(interaction.guildId), client);
                }
                // Check if it's a music control button, search selection, or history replay
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
        
        try {
            await command.execute(interaction, client);
            logger.info(`Command executed successfully: /${interaction.commandName}`);
        } catch (error) {
            logger.error(`Error executing command ${interaction.commandName}`, error);
            
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
