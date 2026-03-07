/**
 * @file FilterManager.js
 * @description Manages audio filters for the music player (equalizer, nightcore, vaporwave, 8D, etc.)
 * Extracted from EnhancedQueue.js for single-responsibility principle.
 * @version 1.9.0
 */

import logger from '../utils/logger.js';

/**
 * EQ presets for different music styles
 * @type {Object.<string, Array<{band: number, gain: number}>>}
 */
const EQ_PRESETS = {
    flat: [],
    bass: [
        { band: 0, gain: 0.6 },
        { band: 1, gain: 0.67 },
        { band: 2, gain: 0.67 },
        { band: 3, gain: 0 },
        { band: 4, gain: -0.5 },
        { band: 5, gain: 0.15 },
        { band: 6, gain: -0.45 },
        { band: 7, gain: 0.23 },
        { band: 8, gain: 0.35 },
        { band: 9, gain: 0.45 },
        { band: 10, gain: 0.55 },
        { band: 11, gain: 0.6 },
        { band: 12, gain: 0.55 },
        { band: 13, gain: 0 }
    ],
    rock: [
        { band: 0, gain: 0.3 },
        { band: 1, gain: 0.25 },
        { band: 2, gain: 0.2 },
        { band: 3, gain: 0.1 },
        { band: 4, gain: 0.05 },
        { band: 5, gain: -0.05 },
        { band: 6, gain: -0.15 },
        { band: 7, gain: -0.2 },
        { band: 8, gain: -0.1 },
        { band: 9, gain: -0.05 },
        { band: 10, gain: 0.05 },
        { band: 11, gain: 0.1 },
        { band: 12, gain: 0.15 },
        { band: 13, gain: 0.2 }
    ],
    jazz: [
        { band: 0, gain: 0.3 },
        { band: 1, gain: 0.3 },
        { band: 2, gain: 0.2 },
        { band: 3, gain: 0.2 },
        { band: 4, gain: -0.2 },
        { band: 5, gain: -0.2 },
        { band: 6, gain: 0 },
        { band: 7, gain: 0.2 },
        { band: 8, gain: 0.25 },
        { band: 9, gain: 0.3 },
        { band: 10, gain: 0.3 },
        { band: 11, gain: 0.3 },
        { band: 12, gain: 0.3 },
        { band: 13, gain: 0.3 }
    ],
    pop: [
        { band: 0, gain: -0.25 },
        { band: 1, gain: -0.2 },
        { band: 2, gain: -0.15 },
        { band: 3, gain: -0.1 },
        { band: 4, gain: -0.05 },
        { band: 5, gain: 0.05 },
        { band: 6, gain: 0.15 },
        { band: 7, gain: 0.2 },
        { band: 8, gain: 0.25 },
        { band: 9, gain: 0.25 },
        { band: 10, gain: 0.25 },
        { band: 11, gain: 0.25 },
        { band: 12, gain: 0.25 },
        { band: 13, gain: 0.25 }
    ]
};

// FM-M01: Removed COMPATIBLE_FILTERS dead code — it was never referenced anywhere.
// Only CONFLICTING_FILTERS is used for actual filter conflict resolution.

/**
 * Filters that CONFLICT and will be cleared (inverse of compatibility)
 * @type {Object.<string, string[]>}
 */
const CONFLICTING_FILTERS = {
    timescale: ['equalizer'],
    equalizer: ['timescale']
};

/**
 * Manages audio filters for the music player
 */
export class FilterManager {
    /**
     * @param {string} guildId - Guild ID for logging context
     */
    constructor(guildId) {
        this.guildId = guildId;

        /** @type {Object} Current filter states */
        this.filters = {
            equalizer: [],
            karaoke: null,
            timescale: null,
            tremolo: null,
            vibrato: null,
            rotation: null,
            distortion: null,
            channelMix: null,
            lowPass: null
        };
    }

    /**
     * Apply current filters to the Lavalink player
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async applyFilters(player) {
        if (!player) {
            logger.warn('Cannot apply filters: player not connected', { guildId: this.guildId });
            return false;
        }

        try {
            const filters = {};

            if (this.filters.equalizer.length > 0) filters.equalizer = this.filters.equalizer;
            if (this.filters.karaoke) filters.karaoke = this.filters.karaoke;
            if (this.filters.timescale) filters.timescale = this.filters.timescale;
            if (this.filters.tremolo) filters.tremolo = this.filters.tremolo;
            if (this.filters.vibrato) filters.vibrato = this.filters.vibrato;
            if (this.filters.rotation) filters.rotation = this.filters.rotation;
            if (this.filters.distortion) filters.distortion = this.filters.distortion;
            if (this.filters.channelMix) filters.channelMix = this.filters.channelMix;
            if (this.filters.lowPass) filters.lowPass = this.filters.lowPass;

            // CRITICAL: Always call setFilters, even with empty object
            // Lavalink v4: "filters overrides all previously applied filters"
            await player.setFilters(filters);

            const filterCount = Object.keys(filters).length;
            if (filterCount > 0) {
                logger.info(`Applied ${filterCount} filter(s) to player`, {
                    guildId: this.guildId,
                    filters: Object.keys(filters)
                });
            } else {
                logger.info('Cleared all filters from player', { guildId: this.guildId });
            }

            return true;
        } catch (error) {
            logger.error('Failed to apply filters', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Clear only conflicting filters when applying a new filter type
     * @param {string} newFilterType - The type of filter being applied
     * @returns {string[]} Array of filter types that were cleared
     * @private
     */
    _clearConflictingFilters(newFilterType) {
        const clearedFilters = [];
        const conflicts = CONFLICTING_FILTERS[newFilterType] || [];

        for (const conflictType of conflicts) {
            if (conflictType === 'equalizer' && this.filters.equalizer.length > 0) {
                this.filters.equalizer = [];
                clearedFilters.push('equalizer');
                logger.debug(`Cleared conflicting filter: equalizer (due to ${newFilterType})`, {
                    guildId: this.guildId
                });
            } else if (conflictType !== 'equalizer' && this.filters[conflictType]) {
                this.filters[conflictType] = null;
                clearedFilters.push(conflictType);
                logger.debug(`Cleared conflicting filter: ${conflictType} (due to ${newFilterType})`, {
                    guildId: this.guildId
                });
            }
        }

        return clearedFilters;
    }

    /**
     * Get filters that would conflict with a new filter type
     * @param {string} filterType - The type of filter to check
     * @returns {string[]} Array of currently active conflicting filter names
     */
    getConflictingActiveFilters(filterType) {
        const conflicts = CONFLICTING_FILTERS[filterType] || [];
        const activeConflicts = [];

        for (const conflictType of conflicts) {
            if (conflictType === 'equalizer' && this.filters.equalizer.length > 0) {
                activeConflicts.push('equalizer');
            } else if (conflictType !== 'equalizer' && this.filters[conflictType]) {
                activeConflicts.push(conflictType);
            }
        }

        return activeConflicts;
    }

    /**
     * Clear all filters and reset to default state
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async clearFilters(player) {
        try {
            this.filters = {
                equalizer: [],
                karaoke: null,
                timescale: null,
                tremolo: null,
                vibrato: null,
                rotation: null,
                distortion: null,
                channelMix: null,
                lowPass: null
            };

            const success = await this.applyFilters(player);
            if (success) {
                logger.info('Successfully cleared all filters', { guildId: this.guildId });
            }
            return success;
        } catch (error) {
            logger.error('Failed to clear filters', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Get active filter names
     * @returns {string[]} Array of active filter names
     */
    getActiveFilters() {
        const active = [];

        if (this.filters.equalizer.length > 0) active.push('equalizer');
        if (this.filters.karaoke) active.push('karaoke');
        if (this.filters.timescale) active.push('timescale');
        if (this.filters.tremolo) active.push('tremolo');
        if (this.filters.vibrato) active.push('vibrato');
        if (this.filters.rotation) active.push('rotation');
        if (this.filters.distortion) active.push('distortion');
        if (this.filters.channelMix) active.push('channelMix');
        if (this.filters.lowPass) active.push('lowPass');

        return active;
    }

    /**
     * Set equalizer preset
     * @param {string} preset - Preset name (flat, bass, rock, jazz, pop)
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async setEqualizer(preset, player) {
        if (!EQ_PRESETS[preset]) {
            logger.warn(`Unknown equalizer preset: ${preset}`, { guildId: this.guildId });
            return false;
        }

        const clearedFilters = this._clearConflictingFilters('equalizer');
        this.filters.equalizer = EQ_PRESETS[preset];

        const success = await this.applyFilters(player);
        if (success) {
            const activeFilters = this.getActiveFilters();
            logger.info(`Applied equalizer preset: ${preset}`, {
                guildId: this.guildId,
                clearedFilters,
                activeFilters
            });
        }

        return success;
    }

    /**
     * Set nightcore filter (timescale: speed 1.1, pitch 1.1)
     * @param {boolean} enabled - Enable/disable nightcore
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async setNightcore(enabled, player) {
        try {
            if (enabled) {
                const clearedFilters = this._clearConflictingFilters('timescale');
                this.filters.timescale = { speed: 1.1, pitch: 1.1, rate: 1 };

                const activeFilters = this.getActiveFilters();
                logger.info('Enabled nightcore filter', {
                    guildId: this.guildId,
                    clearedFilters,
                    activeFilters
                });
            } else {
                this.filters.timescale = null;
                logger.info('Disabled nightcore filter', { guildId: this.guildId });
            }

            return await this.applyFilters(player);
        } catch (error) {
            logger.error('Failed to set nightcore filter', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Set vaporwave filter (timescale: speed 0.8, pitch 0.8)
     * @param {boolean} enabled - Enable/disable vaporwave
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async setVaporwave(enabled, player) {
        try {
            if (enabled) {
                const clearedFilters = this._clearConflictingFilters('timescale');
                this.filters.timescale = { speed: 0.8, pitch: 0.8, rate: 1 };

                const activeFilters = this.getActiveFilters();
                logger.info('Enabled vaporwave filter', {
                    guildId: this.guildId,
                    clearedFilters,
                    activeFilters
                });
            } else {
                this.filters.timescale = null;
                logger.info('Disabled vaporwave filter', { guildId: this.guildId });
            }

            return await this.applyFilters(player);
        } catch (error) {
            logger.error('Failed to set vaporwave filter', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Set 8D audio filter (rotation: 0.2Hz)
     * @param {boolean} enabled - Enable/disable 8D
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async set8D(enabled, player) {
        try {
            if (enabled) {
                this.filters.rotation = { rotationHz: 0.2 };

                const activeFilters = this.getActiveFilters();
                logger.info('Enabled 8D audio filter', {
                    guildId: this.guildId,
                    activeFilters
                });
            } else {
                this.filters.rotation = null;
                logger.info('Disabled 8D audio filter', { guildId: this.guildId });
            }

            return await this.applyFilters(player);
        } catch (error) {
            logger.error('Failed to set 8D filter', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Set karaoke filter
     * @param {boolean} enabled - Enable/disable karaoke
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async setKaraoke(enabled, player) {
        try {
            if (enabled) {
                this.filters.karaoke = {
                    level: 1.0,
                    monoLevel: 1.0,
                    filterBand: 220.0,
                    filterWidth: 100.0
                };
                logger.info('Enabled karaoke filter', { guildId: this.guildId });
            } else {
                this.filters.karaoke = null;
                logger.info('Disabled karaoke filter', { guildId: this.guildId });
            }

            return await this.applyFilters(player);
        } catch (error) {
            logger.error('Failed to set karaoke filter', error, { guildId: this.guildId });
            return false;
        }
    }

    /**
     * Set custom timescale (speed, pitch, rate)
     * @param {Object} options - Timescale options
     * @param {number} [options.speed] - Playback speed (0.0 < x)
     * @param {number} [options.pitch] - Pitch (0.0 < x)
     * @param {number} [options.rate] - Rate (0.0 < x)
     * @param {Object} player - Shoukaku player instance
     * @returns {Promise<boolean>} Success status
     */
    async setTimescale({ speed, pitch, rate }, player) {
        try {
            const defaults = { speed: 1.0, pitch: 1.0, rate: 1.0 };
            const currentTimescale = this.filters.timescale || defaults;

            // Merge provided values with current timescale (preserve unset values)
            const merged = {
                speed: speed !== undefined ? speed : currentTimescale.speed,
                pitch: pitch !== undefined ? pitch : currentTimescale.pitch,
                rate: rate !== undefined ? rate : currentTimescale.rate
            };

            // FM-M03: Use epsilon comparison for floats instead of strict === 1.0
            const isDefault = v => Math.abs(v - 1.0) < 0.001;
            if (isDefault(merged.speed) && isDefault(merged.pitch) && isDefault(merged.rate)) {
                this.filters.timescale = null;
                logger.info('Reset timescale filter', { guildId: this.guildId });
            } else {
                const clearedFilters = this._clearConflictingFilters('timescale');

                this.filters.timescale = merged;

                logger.info(`Set timescale: speed=${merged.speed}, pitch=${merged.pitch}, rate=${merged.rate}`, {
                    guildId: this.guildId,
                    clearedFilters
                });
            }

            return await this.applyFilters(player);
        } catch (error) {
            logger.error('Failed to set timescale', error, { guildId: this.guildId });
            return false;
        }
    }
}

// Export constants for backward compatibility
export { EQ_PRESETS, CONFLICTING_FILTERS };
export default FilterManager;
