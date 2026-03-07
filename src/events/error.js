/**
 * @file error.js
 * @description Handles the Discord client 'error' event
 * BUG-E23: Ensures client errors are logged instead of silently swallowed
 */

import logger from '../utils/logger.js';

export default {
    name: 'error',
    once: false,
    execute(error, client) {
        logger.error('Discord client error', error instanceof Error ? error : new Error(String(error)));

        // Track in metrics if available
        if (client?.metrics) {
            client.metrics.trackError(error, 'discord_client');
        }
    }
};
