import logger from '../utils/logger.js';

export default {
    name: 'ready',
    once: true,
    async execute(client) {
        try {
            // Validate client and user
            if (!client || !client.user) {
                logger.error('Client or user object is missing');
                return;
            }

            logger.info(`Bot logged in as ${client.user.tag}`);
            logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
            
            // Note: In Shoukaku v4, connection happens automatically when Shoukaku is initialized
            // No need to call connect() - it's done in the MusicManager constructor
            
            // Set bot status with error handling
            try {
                client.user.setPresence({
                    activities: [{
                        name: '/play | Miyao Music Bot',
                        type: 2 // LISTENING
                    }],
                    status: 'online'
                });
            } catch (presenceError) {
                logger.error('Failed to set presence:', presenceError);
                // Continue execution even if presence fails
            }
            
            logger.info('Bot is ready!');
        } catch (error) {
            logger.error('Error in ready event:', error);
        }
    }
};
