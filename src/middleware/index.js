/**
 * @file index.js
 * @description Central export for all middleware modules
 * @version 1.8.0 - New middleware system
 * 
 * Usage:
 * ```javascript
 * import { requireVoiceChannel, requireQueue } from '../../middleware/index.js';
 * // or
 * import { voiceCheck, queueCheck } from '../../middleware/index.js';
 * ```
 */

// Voice channel middleware
export { 
    requireVoiceChannel,
    checkVoicePermissions,
    requireSameVoiceChannel,
    requireVoiceWithQueue,
    fullVoiceCheck
} from './voiceCheck.js';

// Queue middleware
export {
    requireQueue,
    requireCurrentTrack,
    requireQueueTracks,
    requireAnyTrack,
    getQueueOrNull,
    validateQueuePosition
} from './queueCheck.js';

// Named exports for grouped access
import * as voiceCheck from './voiceCheck.js';
import * as queueCheck from './queueCheck.js';

export { voiceCheck, queueCheck };

/**
 * Combined middleware helper for common patterns
 */
export const middleware = {
    /**
     * Full check for playback commands (voice + queue + current track)
     * @param {CommandInteraction} interaction 
     * @param {Client} client 
     * @returns {{ voiceChannel, member, queue, current }}
     */
    playbackCommand(interaction, client) {
        const { voiceChannel, member, queue } = voiceCheck.fullVoiceCheck(
            interaction, 
            client.musicManager
        );
        
        if (!queue || !queue.current) {
            const { NothingPlayingError } = require('../utils/errors.js');
            throw new NothingPlayingError();
        }
        
        return { voiceChannel, member, queue, current: queue.current };
    },
    
    /**
     * Check for queue commands (voice + same channel + queue exists)
     * @param {CommandInteraction} interaction 
     * @param {Client} client 
     * @returns {{ voiceChannel, member, queue }}
     */
    queueCommand(interaction, client) {
        const { voiceChannel, member } = voiceCheck.requireVoiceChannel(interaction);
        const queue = queueCheck.requireQueue(client.musicManager, interaction.guildId);
        voiceCheck.requireSameVoiceChannel(interaction, queue);
        
        return { voiceChannel, member, queue };
    },
    
    /**
     * Check for join/play commands (voice + permissions, queue optional)
     * @param {CommandInteraction} interaction 
     * @param {Client} client 
     * @returns {{ voiceChannel, member, queue }}
     */
    joinCommand(interaction, client) {
        return voiceCheck.fullVoiceCheck(interaction, client.musicManager);
    }
};

export default middleware;
