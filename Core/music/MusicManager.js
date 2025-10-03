import { Shoukaku, Connectors } from 'shoukaku';
import logger from '../utils/logger.js';

/**
 * Music Manager - Handles Lavalink connection and player management
 */
export class MusicManager {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.queues = new Map(); // guildId -> Queue
        
        // Initialize Shoukaku with correct v4 syntax
        // Constructor: new Shoukaku(connector, nodes, options)
        // Note: In v4, nodes array and options are passed as separate parameters
        // Shoukaku automatically connects when initialized - NO .connect() method needed!
        this.shoukaku = new Shoukaku(
            new Connectors.DiscordJS(client),
            config.lavalink.nodes,
            {
                moveOnDisconnect: true,
                resume: true,
                resumeTimeout: config.lavalink.resumeTimeout || 30,
                reconnectTries: config.lavalink.reconnectTries || 5,
                reconnectInterval: config.lavalink.reconnectDelay || 5,
                restTimeout: 60,
                voiceConnectionTimeout: 15
            }
        );
        
        this.setupEventListeners();
        logger.info('Music Manager initialized - Shoukaku will connect automatically');
    }
    
    /**
     * Setup Shoukaku event listeners
     */
    setupEventListeners() {
        this.shoukaku.on('ready', (name) => {
            logger.info(`Lavalink node "${name}" is ready`);
        });
        
        this.shoukaku.on('error', (name, error) => {
            logger.error(`Lavalink node "${name}" error`, { error });
        });
        
        this.shoukaku.on('close', (name, code, reason) => {
            logger.warn(`Lavalink node "${name}" closed`, { code, reason });
        });
        
        this.shoukaku.on('disconnect', (name, moved, count) => {
            logger.warn(`Lavalink node "${name}" disconnected`, { moved, playerCount: count });
            
            // Clean up disconnected players
            for (const [guildId, queue] of this.queues.entries()) {
                if (!queue.player?.node?.name || queue.player.node.name === name) {
                    if (!moved) {
                        this.destroyQueue(guildId);
                    }
                }
            }
        });
        
        this.shoukaku.on('debug', (name, info) => {
            if (process.env.NODE_ENV !== 'production') {
                logger.debug(`Lavalink node "${name}": ${info}`);
            }
        });
        
        // Note: Player events are handled on individual player instances in Queue class
        // Not on the main Shoukaku instance
    }
    
    /**
     * Get or create a queue for a guild
     */
    getQueue(guildId) {
        return this.queues.get(guildId);
    }
    
    /**
     * Create a new queue
     */
    async createQueue(guildId, voiceChannelId, textChannel) {
        const queue = new Queue(this, guildId, voiceChannelId, textChannel);
        this.queues.set(guildId, queue);
        logger.music('Queue created', { guildId });
        return queue;
    }
    
    /**
     * Destroy a queue
     */
    destroyQueue(guildId) {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.destroy();
            this.queues.delete(guildId);
            logger.music('Queue destroyed', { guildId });
        }
    }
    
    /**
     * Search for tracks (Shoukaku v4 API)
     */
    async search(query, requester) {
        try {
            const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
            
            if (!node) {
                throw new Error('No available nodes');
            }
            
            // Add search prefix if not a URL
            const isUrl = /^https?:\/\//.test(query);
            const searchQuery = isUrl ? query : `ytsearch:${query}`;
            
            // Shoukaku v4: node.rest.resolve returns the result directly
            const result = await node.rest.resolve(searchQuery);
            
            // Shoukaku v4 response structure:
            // { loadType, data: { ... } } or { loadType, data: [...] }
            if (!result || !result.data) {
                return { tracks: [], loadType: 'empty' };
            }
            
            // Handle different response types
            let tracks = [];
            
            if (result.loadType === 'search' || result.loadType === 'track') {
                // data is array of tracks
                tracks = Array.isArray(result.data) ? result.data : [result.data];
            } else if (result.loadType === 'playlist') {
                // data.tracks is array
                tracks = result.data.tracks || [];
            }
            
            // Add requester to tracks
            tracks = tracks.map(track => ({
                ...track,
                requester
            }));
            
            return {
                loadType: result.loadType,
                tracks: tracks,
                playlistInfo: result.data.info || null
            };
        } catch (error) {
            logger.error('Search error', error);
            throw error;
        }
    }
}

/**
 * Queue class - Manages songs and playback for a guild
 */
export class Queue {
    constructor(manager, guildId, voiceChannelId, textChannel) {
        this.manager = manager;
        this.guildId = guildId;
        this.voiceChannelId = voiceChannelId;
        this.textChannel = textChannel;
        
        this.tracks = [];
        this.current = null;
        this.player = null;
        this.loop = 'off'; // off, track, queue
        this.volume = manager.config.music.defaultVolume || 50;
        this.paused = false;
        
        this.leaveTimeout = null;
        
        // UI state
        this.nowPlayingMessage = null; // Store message for updates
        this.updateInterval = null; // Interval for progress updates
    }
    
    /**
     * Connect to voice channel and create player
     */
    async connect() {
        try {
            const node = this.manager.shoukaku.options.nodeResolver(this.manager.shoukaku.nodes);
            
            if (!node) {
                throw new Error('No available nodes');
            }
            
            // Get shard ID from guild
            const guild = this.manager.client.guilds.cache.get(this.guildId);
            const shardId = guild ? guild.shardId : 0;
            
            // Join voice channel (Shoukaku v4 API)
            // joinVoiceChannel returns Player directly, not connection
            this.player = await this.manager.shoukaku.joinVoiceChannel({
                guildId: this.guildId,
                channelId: this.voiceChannelId,
                shardId: shardId
            });
            
            // Setup player event listeners
            this.setupPlayerEvents();
            
            // Set initial volume (Shoukaku v4 uses 0-100 range, same as v3)
            await this.player.setGlobalVolume(this.volume);
            
            logger.music('Player connected', { 
                guildId: this.guildId, 
                voiceChannelId: this.voiceChannelId 
            });
            
            return this.player;
        } catch (error) {
            logger.error('Failed to connect player', error);
            throw error;
        }
    }
    
    /**
     * Setup player event listeners (Shoukaku v4)
     * Player is an EventEmitter that emits: 'start', 'end', 'stuck', 'exception', 'closed', 'update', 'resumed'
     */
    setupPlayerEvents() {
        if (!this.player) return;
        
        // Track start event
        this.player.on('start', (data) => {
            logger.music('Track started', { 
                guildId: this.guildId,
                track: data.track?.info?.title 
            });
            this.clearLeaveTimeout();
            
            // Start progress updates when track starts
            if (this.nowPlayingMessage) {
                this.startProgressUpdates();
            }
        });
        
        // Track end event
        this.player.on('end', (data) => {
            logger.music('Track ended', { 
                guildId: this.guildId,
                reason: data.reason 
            });
            
            // Stop progress updates when track ends
            this.stopProgressUpdates();
            
            if (data.reason === 'replaced') return;
            
            // Handle loop
            if (this.loop === 'track' && this.current) {
                this.play(this.current);
                return;
            }
            
            if (this.loop === 'queue' && this.current) {
                this.tracks.push(this.current);
            }
            
            // Play next track
            if (this.tracks.length > 0) {
                this.play();
            } else {
                this.current = null;
                this.scheduleLeave();
            }
        });
        
        // Track exception event
        this.player.on('exception', (data) => {
            logger.error('Player exception', { 
                guildId: this.guildId,
                exception: data.exception 
            });
            
            // Try to play next track on error
            if (this.tracks.length > 0) {
                this.play();
            } else {
                this.scheduleLeave();
            }
        });
        
        // Track stuck event
        this.player.on('stuck', (data) => {
            logger.warn('Player stuck', { 
                guildId: this.guildId,
                threshold: data.thresholdMs 
            });
            
            // Skip stuck track
            if (this.tracks.length > 0) {
                this.play();
            }
        });
        
        // WebSocket closed event
        this.player.on('closed', (data) => {
            logger.warn('WebSocket closed', { 
                guildId: this.guildId,
                code: data.code,
                reason: data.reason 
            });
        });
        
        // Player update event (position updates)
        this.player.on('update', (data) => {
            // Silently update position - don't log to avoid spam
            // logger.debug('Player update', { guildId: this.guildId, position: data.state.position });
        });
    }
    
    /**
     * Add track(s) to queue
     */
    add(track) {
        if (Array.isArray(track)) {
            this.tracks.push(...track);
        } else {
            this.tracks.push(track);
        }
    }
    
    /**
     * Play a track or next in queue
     */
    async play(track) {
        if (!this.player) {
            await this.connect();
        }
        
        const toPlay = track || this.tracks.shift();
        
        if (!toPlay) {
            this.current = null;
            this.scheduleLeave();
            return false;
        }
        
        this.current = toPlay;
        this.paused = false;
        
        try {
            await this.player.playTrack({ track: { encoded: toPlay.encoded } });
            return true;
        } catch (error) {
            logger.error('Failed to play track', error);
            
            // Try next track
            if (this.tracks.length > 0) {
                return await this.play();
            }
            
            return false;
        }
    }
    
    /**
     * Pause playback
     */
    async pause() {
        if (!this.player || this.paused) return false;
        
        await this.player.setPaused(true);
        this.paused = true;
        
        // Update UI immediately
        await this.updateNowPlaying();
        
        return true;
    }
    
    /**
     * Resume playback
     */
    async resume() {
        if (!this.player || !this.paused) return false;
        
        await this.player.setPaused(false);
        this.paused = false;
        
        // Update UI immediately
        await this.updateNowPlaying();
        
        return true;
    }
    
    /**
     * Skip current track
     */
    async skip() {
        if (!this.player) return false;
        
        await this.player.stopTrack();
        return true;
    }
    
    /**
     * Stop playback and clear queue
     */
    async stop() {
        this.tracks = [];
        this.current = null;
        
        if (this.player) {
            await this.player.stopTrack();
        }
        
        this.scheduleLeave();
        return true;
    }
    
    /**
     * Set volume (Shoukaku v4: setGlobalVolume uses 0-100 range, same as v3)
     */
    async setVolume(volume) {
        volume = Math.max(0, Math.min(100, volume));
        this.volume = volume;
        
        if (this.player) {
            // Shoukaku v4 setGlobalVolume uses 0-100 range (NOT 0-1000)
            await this.player.setGlobalVolume(volume);
        }
        
        return volume;
    }
    
    /**
     * Seek to position
     */
    async seek(position) {
        if (!this.player || !this.current) return false;
        
        await this.player.seekTo(position);
        return true;
    }
    
    /**
     * Set loop mode
     */
    async setLoop(mode) {
        if (!['off', 'track', 'queue'].includes(mode)) {
            throw new Error('Invalid loop mode');
        }
        
        this.loop = mode;
        
        // Update UI immediately
        await this.updateNowPlaying();
        
        return mode;
    }
    
    /**
     * Shuffle queue
     */
    shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
    }
    
    /**
     * Clear queue
     */
    clear() {
        this.tracks = [];
    }
    
    /**
     * Remove track at index
     */
    remove(index) {
        if (index < 0 || index >= this.tracks.length) {
            return null;
        }
        
        return this.tracks.splice(index, 1)[0];
    }
    
    /**
     * Move a track from one position to another (0-based indexes)
     * @param {number} fromIndex - Current index in this.tracks
     * @param {number} toIndex - Destination index in this.tracks
     * @returns {boolean} true if moved
     */
    move(fromIndex, toIndex) {
        if (this.tracks.length === 0) return false;
        if (fromIndex === toIndex) return true;
        if (fromIndex < 0 || fromIndex >= this.tracks.length) return false;
        if (toIndex < 0 || toIndex >= this.tracks.length) return false;
        const [track] = this.tracks.splice(fromIndex, 1);
        this.tracks.splice(toIndex, 0, track);
        return true;
    }
    
    /**
     * Jump to a specific track in the queue (1-based position relative to upcoming tracks)
     * This will immediately start playing the selected track.
     * @param {number} position - 1-based position in this.tracks
     * @returns {Promise<boolean>} true if jumped
     */
    async jump(position) {
        if (!Number.isInteger(position)) return false;
        if (position < 1 || position > this.tracks.length) return false;
        const index = position - 1;
        const [track] = this.tracks.splice(index, 1);
        if (!track) return false;
        await this.play(track);
        return true;
    }
    
    /**
     * Schedule leave on empty/end
     */
    scheduleLeave() {
        this.clearLeaveTimeout();
        
        const delay = this.manager.config.music.leaveOnEndDelay || 60000;
        
        if (this.manager.config.music.leaveOnEnd) {
            this.leaveTimeout = setTimeout(() => {
                this.destroy();
            }, delay);
        }
    }
    
    /**
     * Clear leave timeout
     */
    clearLeaveTimeout() {
        if (this.leaveTimeout) {
            clearTimeout(this.leaveTimeout);
            this.leaveTimeout = null;
        }
    }
    
    /**
     * Start auto-updating now playing message
     */
    startProgressUpdates() {
        // Clear existing interval
        this.stopProgressUpdates();
        
        // Update every 10 seconds
        this.updateInterval = setInterval(async () => {
            try {
                await this.updateNowPlaying();
            } catch (error) {
                logger.error('Failed to update now playing message', error);
            }
        }, 10000);
    }
    
    /**
     * Stop auto-updating now playing message
     */
    stopProgressUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Update now playing message with current progress
     */
    async updateNowPlaying() {
        if (!this.nowPlayingMessage || !this.current || !this.player) {
            return;
        }
        
        try {
            // Dynamically import to avoid circular dependency
            const { createNowPlayingEmbed } = await import('../../UI/embeds/MusicEmbeds.js');
            const { createNowPlayingButtons } = await import('../../UI/components/MusicControls.js');
            
            const currentPosition = this.player.position || 0;
            const embed = createNowPlayingEmbed(this.current, this, this.manager.config, currentPosition);
            const components = createNowPlayingButtons(this, false);
            
            await this.nowPlayingMessage.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            // Message might be deleted, clear reference
            if (error.code === 10008 || error.code === 50001) {
                this.nowPlayingMessage = null;
                this.stopProgressUpdates();
            } else {
                logger.error('Failed to update now playing embed', error);
            }
        }
    }
    
    /**
     * Set now playing message for auto-updates
     */
    setNowPlayingMessage(message) {
        this.nowPlayingMessage = message;
        if (message && this.current) {
            this.startProgressUpdates();
        } else {
            this.stopProgressUpdates();
        }
    }
    
    /**
     * Destroy queue and disconnect (Shoukaku v4 API)
     */
    async destroy() {
        this.clearLeaveTimeout();
        this.stopProgressUpdates();
        
        if (this.player) {
            // Use shoukaku.leaveVoiceChannel instead of player.connection.disconnect in v4
            await this.manager.shoukaku.leaveVoiceChannel(this.guildId);
            this.player = null;
        }
        
        this.tracks = [];
        this.current = null;
        this.nowPlayingMessage = null;
        
        this.manager.queues.delete(this.guildId);
    }
}

export default MusicManager;
