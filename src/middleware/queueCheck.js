/**
 * @file queueCheck.js
 * @description Middleware for queue related checks
 * @version 1.8.0 - New middleware system
 *
 * This middleware provides reusable queue validation functions
 * that can be applied to commands that require an active queue or current track.
 */

import { NothingPlayingError, EmptyQueueError } from '../utils/errors.js';

/**
 * Check if there's an active queue for the guild
 * @param {MusicManager} musicManager - Music manager instance
 * @param {string} guildId - Guild ID
 * @throws {NothingPlayingError} If no queue exists
 * @returns {EnhancedQueue}
 */
export function requireQueue(musicManager, guildId) {
    const queue = musicManager.getQueue(guildId);

    if (!queue) {
        throw new NothingPlayingError();
    }

    return queue;
}

/**
 * Check if there's a track currently playing
 * @param {MusicManager} musicManager - Music manager instance
 * @param {string} guildId - Guild ID
 * @throws {NothingPlayingError} If no track is playing
 * @returns {{ queue: EnhancedQueue, current: Track }}
 */
export function requireCurrentTrack(musicManager, guildId) {
    const queue = requireQueue(musicManager, guildId);

    if (!queue.current) {
        throw new NothingPlayingError();
    }

    return { queue, current: queue.current };
}

/**
 * Check if the queue has upcoming tracks
 * @param {MusicManager} musicManager - Music manager instance
 * @param {string} guildId - Guild ID
 * @throws {EmptyQueueError} If queue is empty
 * @returns {{ queue: EnhancedQueue, tracks: Track[] }}
 */
export function requireQueueTracks(musicManager, guildId) {
    const queue = requireQueue(musicManager, guildId);

    if (!queue.tracks || queue.tracks.length === 0) {
        throw new EmptyQueueError();
    }

    return { queue, tracks: queue.tracks };
}

/**
 * Check if queue has at least one track (current or upcoming)
 * @param {MusicManager} musicManager - Music manager instance
 * @param {string} guildId - Guild ID
 * @throws {NothingPlayingError} If no tracks at all
 * @returns {{ queue: EnhancedQueue, hasCurrentTrack: boolean, hasUpcomingTracks: boolean }}
 */
export function requireAnyTrack(musicManager, guildId) {
    const queue = requireQueue(musicManager, guildId);

    const hasCurrentTrack = !!queue.current;
    const hasUpcomingTracks = queue.tracks && queue.tracks.length > 0;

    if (!hasCurrentTrack && !hasUpcomingTracks) {
        throw new NothingPlayingError();
    }

    return { queue, hasCurrentTrack, hasUpcomingTracks };
}

/**
 * Get queue if exists, otherwise return null (no error)
 * Useful for commands that work differently when no queue exists
 * @param {MusicManager} musicManager - Music manager instance
 * @param {string} guildId - Guild ID
 * @returns {EnhancedQueue|null}
 */
export function getQueueOrNull(musicManager, guildId) {
    return musicManager.getQueue(guildId) || null;
}

/**
 * Check queue position is valid
 * @param {EnhancedQueue} queue - Music queue
 * @param {number} position - 1-based position
 * @param {string} action - Action name for error message
 * @throws {Error} If position is invalid
 * @returns {number} 0-based index
 */
export function validateQueuePosition(queue, position, action = 'perform action') {
    if (!Number.isInteger(position) || position < 1) {
        throw new Error('Invalid position: must be a positive integer');
    }

    if (position > queue.tracks.length) {
        throw new Error(`Position ${position} is out of range (max: ${queue.tracks.length})`);
    }

    return position - 1; // Convert to 0-based index
}

export default {
    requireQueue,
    requireCurrentTrack,
    requireQueueTracks,
    requireAnyTrack,
    getQueueOrNull,
    validateQueuePosition
};
