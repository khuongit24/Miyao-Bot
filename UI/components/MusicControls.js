import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

/**
 * Create music control buttons
 * @param {Object} queue - The music queue
 * @param {boolean} disabled - Whether buttons should be disabled
 * @returns {ActionRowBuilder} Action row with buttons
 */
export function createMusicButtons(queue, disabled = false) {
    // Row 1: Main controls
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('music_previous')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true), // Previous not implemented yet
            
            new ButtonBuilder()
                .setCustomId(queue?.paused ? 'music_resume' : 'music_pause')
                .setEmoji(queue?.paused ? '▶️' : '⏸️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || !queue?.current),
            
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled || !queue?.current),
            
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || !queue?.current),
            
            new ButtonBuilder()
                .setCustomId('music_queue')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue)
        );
    
    // Row 2: Additional controls
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('music_loop')
                .setEmoji(getLoopEmoji(queue?.loop || 'off'))
                .setLabel(getLoopLabel(queue?.loop || 'off'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue),
            
            new ButtonBuilder()
                .setCustomId('music_shuffle')
                .setEmoji('🔀')
                .setLabel('Shuffle')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue || queue?.tracks?.length < 2),
            
            new ButtonBuilder()
                .setCustomId('music_volume_down')
                .setEmoji('🔉')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue || queue?.volume <= 0),
            
            new ButtonBuilder()
                .setCustomId('music_volume_up')
                .setEmoji('🔊')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue || queue?.volume >= 100),
            
            new ButtonBuilder()
                .setCustomId('music_lyrics')
                .setEmoji('📝')
                .setLabel('Lyrics')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true) // Not implemented yet
        );
    
    return [row1, row2];
}

/**
 * Create now playing buttons (compact version with 3 rows: controls + seek + volume/queue)
 * @param {Object} queue - The music queue
 * @param {boolean} disabled - Whether buttons should be disabled
 * @returns {ActionRowBuilder[]} Array of action rows with buttons
 */
export function createNowPlayingButtons(queue, disabled = false) {
    // Row 1: Main playback controls
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(queue?.paused ? 'music_resume' : 'music_pause')
                .setEmoji(queue?.paused ? '▶️' : '⏸️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || !queue?.current),
            
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || !queue?.current),
            
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setEmoji('⏹️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled || !queue?.current),
            
            new ButtonBuilder()
                .setCustomId('music_loop')
                .setEmoji(getLoopEmoji(queue?.loop || 'off'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue),
            
            new ButtonBuilder()
                .setCustomId('music_shuffle')
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue || queue?.tracks?.length < 2)
        );
    
    // Row 2: Interactive seek controls (only for non-stream tracks)
    const isSeekable = queue?.current && !queue.current.info?.isStream;
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('music_seek_backward_30')
                .setEmoji('⏪')
                .setLabel('30s')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !isSeekable),
            
            new ButtonBuilder()
                .setCustomId('music_seek_backward_10')
                .setEmoji('◀️')
                .setLabel('10s')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !isSeekable),
            
            new ButtonBuilder()
                .setCustomId('music_seek_start')
                .setEmoji('🔄')
                .setLabel('Restart')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !isSeekable),
            
            new ButtonBuilder()
                .setCustomId('music_seek_forward_10')
                .setEmoji('▶️')
                .setLabel('10s')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !isSeekable),
            
            new ButtonBuilder()
                .setCustomId('music_seek_forward_30')
                .setEmoji('⏩')
                .setLabel('30s')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !isSeekable)
        );
    
    // Row 3: Volume and queue controls
    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('music_volume_down')
                .setEmoji('🔉')
                .setLabel('-10%')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue || queue?.volume <= 0),
            
            new ButtonBuilder()
                .setCustomId('music_volume_up')
                .setEmoji('🔊')
                .setLabel('+10%')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue || queue?.volume >= 100),
            
            new ButtonBuilder()
                .setCustomId('music_replay')
                .setEmoji('📜')
                .setLabel('Replay')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue || (queue?.history && queue.history.length === 0)),
            
            new ButtonBuilder()
                .setCustomId('music_queue')
                .setEmoji('📋')
                .setLabel('Queue')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || !queue)
        );
    
    return [row1, row2, row3];
}

/**
 * Create queue navigation buttons
 * @param {number} page - Current page
 * @param {number} totalPages - Total pages
 * @returns {ActionRowBuilder} Action row with navigation buttons
 */
export function createQueueButtons(page, totalPages) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('queue_first')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            
            new ButtonBuilder()
                .setCustomId('queue_previous')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page <= 1),
            
            new ButtonBuilder()
                .setCustomId('queue_refresh')
                .setEmoji('🔄')
                .setLabel(`${page}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(false),
            
            new ButtonBuilder()
                .setCustomId('queue_next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages),
            
            new ButtonBuilder()
                .setCustomId('queue_last')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages)
        );
    
    return [row];
}

/**
 * Get loop emoji based on mode
 * @param {string} mode - Loop mode (off, track, queue)
 * @returns {string} Emoji
 */
function getLoopEmoji(mode) {
    switch (mode) {
        case 'track':
            return '🔂';
        case 'queue':
            return '🔁';
        default:
            return '🔁';
    }
}

/**
 * Get loop label based on mode
 * @param {string} mode - Loop mode (off, track, queue)
 * @returns {string} Label
 */
function getLoopLabel(mode) {
    switch (mode) {
        case 'track':
            return 'Track';
        case 'queue':
            return 'Queue';
        default:
            return 'Off';
    }
}

/**
 * Create search result buttons for up to 5 tracks
 * Each button id encodes the index to pick: search_pick_<index>
 * @param {Array} tracks - Array of track objects
 * @returns {ActionRowBuilder[]} rows of buttons
 */
export function createSearchResultButtons(tracks) {
    // Create dropdown menu for song selection
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('search_select')
        .setPlaceholder('🎵 Chọn bài hát bạn muốn phát')
        .setMinValues(1)
        .setMaxValues(1);
    
    // Add options (max 5 tracks)
    const max = Math.min(5, tracks.length);
    for (let i = 0; i < max; i++) {
        const track = tracks[i];
        const title = truncateTitle(track.info?.title || 'Unknown', 100);
        const author = truncateTitle(track.info?.author || 'Unknown', 50);
        const duration = track.info?.length 
            ? `${Math.floor(track.info.length/1000/60)}:${String(Math.floor((track.info.length/1000)%60)).padStart(2, '0')}` 
            : 'Live';
        
        selectMenu.addOptions({
            label: title,
            description: `${author} • ${duration}`,
            value: `${i}`,
            emoji: '🎵'
        });
    }
    
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    
    // Add cancel button
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('search_cancel')
                .setEmoji('❌')
                .setLabel('Hủy')
                .setStyle(ButtonStyle.Danger)
        );
    
    return [row1, row2];
}

function truncateTitle(str, max = 70) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

/**
 * Create history replay dropdown for selecting tracks from history
 * @param {Array} history - Array of history entries { track, playedAt }
 * @returns {ActionRowBuilder[]} rows with dropdown and cancel button
 */
export function createHistoryReplayButtons(history) {
    // Validate history parameter
    if (!Array.isArray(history) || history.length === 0) {
        throw new Error('History must be a non-empty array');
    }
    
    // Create dropdown menu for history selection
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('history_replay_select')
        .setPlaceholder('🔄 Chọn bài hát từ lịch sử để phát lại')
        .setMinValues(1)
        .setMaxValues(1);
    
    // Add options (max 10 tracks from history)
    const max = Math.min(10, history.length);
    for (let i = 0; i < max; i++) {
        const entry = history[i];
        
        // Defensive check for entry structure
        if (!entry?.track?.info) {
            continue;
        }
        
        const track = entry.track;
        const title = truncateTitle(track.info.title || 'Unknown', 80);
        const author = truncateTitle(track.info.author || 'Unknown', 40);
        const duration = track.info.length && !track.info.isStream
            ? `${Math.floor(track.info.length/1000/60)}:${String(Math.floor((track.info.length/1000)%60)).padStart(2, '0')}` 
            : 'Live';
        
        // Format played time with validation
        const timeSince = entry.playedAt ? Date.now() - entry.playedAt : 0;
        const minutesAgo = Math.floor(timeSince / 60000);
        const timeText = minutesAgo < 1 ? 'Vừa xong' : 
                        minutesAgo < 60 ? `${minutesAgo} phút trước` :
                        minutesAgo < 1440 ? `${Math.floor(minutesAgo / 60)} giờ trước` :
                        `${Math.floor(minutesAgo / 1440)} ngày trước`;
        
        selectMenu.addOptions({
            label: title,
            description: `${author} • ${duration} • ${timeText}`,
            value: `${i}`,
            emoji: '🎵'
        });
    }
    
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    
    // Add cancel button
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('history_replay_cancel')
                .setEmoji('❌')
                .setLabel('Hủy')
                .setStyle(ButtonStyle.Danger)
        );
    
    return [row1, row2];
}

export default {
    createMusicButtons,
    createNowPlayingButtons,
    createQueueButtons,
    createSearchResultButtons,
    createHistoryReplayButtons
};
