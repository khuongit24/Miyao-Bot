import logger from '../utils/logger.js';

export default {
    name: 'clientReady',
    once: true,
    async execute(client) {
        logger.info(`Bot logged in as ${client.user.tag}`);
        logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
        
        // Note: In Shoukaku v4, connection happens automatically when Shoukaku is initialized
        // No need to call connect() - it's done in the MusicManager constructor
        
        // Set bot status
        client.user.setPresence({
            activities: [{
                name: '/play | Miyao Music Bot',
                type: 2 // LISTENING
            }],
            status: 'online'
        });
        
        logger.info('Bot is ready!');
    }
};
