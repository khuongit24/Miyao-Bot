import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './Core/utils/logger.js';
import { loadConfig } from './Core/utils/helpers.js';
import { VERSION } from './Core/utils/version.js';
import metricsTracker from './Core/utils/metrics.js';
import MusicManager from './Core/music/MusicManagerEnhanced.js';
import { startMetricsServer } from './Core/api/metrics-server.js';

// Load environment variables
dotenvConfig();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
if (!process.env.DISCORD_TOKEN) {
    logger.error('DISCORD_TOKEN is not defined in .env file');
    process.exit(1);
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Required for prefix commands
    ]
});

// Load configuration
client.config = loadConfig();

// Initialize commands collection
client.commands = new Collection();

// Attach metrics tracker to client
client.metrics = metricsTracker;

// In-memory cache for ephemeral search results selection
client._lastSearchResults = new Map();
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, value] of client._lastSearchResults.entries()) {
        if (!value?.createdAt || now - value.createdAt > 5 * 60 * 1000) {
            client._lastSearchResults.delete(key);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        logger.debug(`Cleaned ${cleanedCount} expired search cache entries`);
    }
}, 60 * 1000);

/**
 * Load commands
 */
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'Core', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    logger.info(`Loading ${commandFiles.length} commands...`);
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(`file://${filePath}`);
        
        if ('data' in command.default && 'execute' in command.default) {
            client.commands.set(command.default.data.name, command.default);
            logger.debug(`Loaded command: ${command.default.data.name}`);
        } else {
            logger.warn(`Command ${file} is missing required "data" or "execute" property`);
        }
    }
    
    logger.info(`Successfully loaded ${client.commands.size} commands`);
}

/**
 * Load events
 */
async function loadEvents() {
    const eventsPath = path.join(__dirname, 'Core', 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    logger.info(`Loading ${eventFiles.length} events...`);
    
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = await import(`file://${filePath}`);
        
        // Skip helper modules that don't export event structure
        if (!event.default || !event.default.name || !event.default.execute) {
            logger.debug(`Skipped non-event file: ${file}`);
            continue;
        }
        
        if (event.default.once) {
            client.once(event.default.name, (...args) => event.default.execute(...args, client));
        } else {
            client.on(event.default.name, (...args) => event.default.execute(...args, client));
        }
        
        logger.debug(`Loaded event: ${event.default.name}`);
    }
    
    logger.info(`Successfully loaded ${eventFiles.length} events`);
}

/**
 * Initialize Music Manager
 */
function initializeMusicManager() {
    logger.info('Initializing Music Manager...');
    client.musicManager = new MusicManager(client, client.config);
    logger.info('Music Manager initialized successfully');
}

/**
 * Handle errors
 */
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    
    try {
        // Clean up search results cache
        if (client._lastSearchResults) {
            const searchCacheSize = client._lastSearchResults.size;
            client._lastSearchResults.clear();
            logger.info(`Cleared ${searchCacheSize} search cache entries`);
        }
        
        // Clean up history replay cache
        if (client._historyCache) {
            const historyCacheSize = client._historyCache.size;
            client._historyCache.clear();
            logger.info(`Cleared ${historyCacheSize} history cache entries`);
        }
        
        // Use enhanced shutdown method if available
        if (client.musicManager) {
            if (typeof client.musicManager.shutdown === 'function') {
                await client.musicManager.shutdown();
            } else {
                // Fallback for basic manager
                for (const [guildId] of client.musicManager.queues) {
                    client.musicManager.destroyQueue(guildId);
                }
            }
        }
        
        // Destroy client
        client.destroy();
        
        logger.info('Shutdown complete');
    } catch (error) {
        logger.error('Error during shutdown', error);
    } finally {
        process.exit(0);
    }
});

/**
 * Start the bot
 */
async function start() {
    try {
        logger.info('Starting Miyao Music Bot...');
        logger.info(`Version: ${VERSION.fullDisplay}`);
        logger.info(`Node.js version: ${process.version}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        
        // Load commands and events
        await loadCommands();
        await loadEvents();
        
        // Initialize Music Manager
        initializeMusicManager();
        
        // Login to Discord
        logger.info('Logging in to Discord...');
        await client.login(process.env.DISCORD_TOKEN);
        
        // Start metrics API server
        startMetricsServer(client);
        
        // Log metrics summary every hour
        setInterval(() => {
            metricsTracker.logSummary();
        }, 3600000); // 1 hour
        
    } catch (error) {
        logger.error('Failed to start bot', error);
        metricsTracker.trackError(error, 'startup');
        process.exit(1);
    }
}

// Start the bot
start();
