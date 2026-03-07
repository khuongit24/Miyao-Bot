/**
 * Modular Playlist Handler Router
 * Centralizes and delegates playlist interactions to specific handlers.
 */

import logger from '../../utils/logger.js';
import { createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import Playlist from '../../database/models/Playlist.js';

// Import split handlers
import * as ControlHandlers from './PlaylistControlHandlers.js';
import * as ManagementHandlers from './PlaylistManagementHandlers.js';
import * as TrackHandlers from './PlaylistTrackHandlers.js';
import * as ViewHandlers from './PlaylistViewHandlers.js';

/**
 * Verify playlist ownership for mutating actions
 * @param {string} customId - Button custom ID containing playlist ID
 * @param {string} userId - Interacting user's ID
 * @returns {{ valid: boolean, playlist?: Object, reason?: string }}
 */
function checkPlaylistOwnership(customId, userId) {
    // Extract playlist ID from customId (e.g. 'playlist_edit_42' -> 42)
    const match = customId.match(/_(\d+)$/);
    if (!match) return { valid: true }; // No ID in customId, skip check

    const playlistId = parseInt(match[1]);
    if (isNaN(playlistId)) return { valid: true };

    try {
        const playlist = Playlist.getById(playlistId);
        if (!playlist) return { valid: false, reason: 'Playlist không tồn tại!' };
        // Allow if user is owner or playlist is public (for play/shuffle)
        if (playlist.owner_id !== userId && !playlist.is_public) {
            return { valid: false, reason: 'Bạn không có quyền thao tác với playlist này!' };
        }
        return { valid: true, playlist };
    } catch {
        return { valid: true }; // Let downstream handler deal with DB errors
    }
}

/** Actions that mutate the playlist and require ownership */
const OWNERSHIP_REQUIRED_PREFIXES = ['playlist_edit_', 'playlist_remove_track_', 'playlist_add_track_to_'];

/**
 * Handle playlist button interactions
 */
export async function handlePlaylistButton(interaction, client) {
    const customId = interaction.customId;

    try {
        // BUG-065: Verify playlist ownership before mutating actions
        if (OWNERSHIP_REQUIRED_PREFIXES.some(p => customId.startsWith(p))) {
            const ownerCheck = checkPlaylistOwnership(customId, interaction.user.id);
            if (!ownerCheck.valid) {
                return interaction.reply({
                    embeds: [
                        createErrorEmbed(
                            ownerCheck.reason || 'Bạn không có quyền thao tác với playlist này!',
                            client.config
                        )
                    ],
                    ephemeral: true
                });
            }
        }

        // Control Handlers
        if (customId.startsWith('playlist_play_')) {
            return await ControlHandlers.handlePlayPlaylistButton(interaction, client);
        }
        if (customId.startsWith('playlist_shuffle_')) {
            return await ControlHandlers.handleShufflePlaylist(interaction, client);
        }
        if (customId.startsWith('playlist_clone_')) {
            return await ControlHandlers.showClonePlaylistModal(interaction);
        }

        // Track Handlers
        if (customId.startsWith('playlist_add_track_to_')) {
            return await TrackHandlers.showAddTrackToPlaylistModal(interaction);
        }
        if (customId.startsWith('playlist_remove_track_')) {
            return await TrackHandlers.showRemovePlaylistTrackModal(interaction);
        }

        // Management Handlers
        if (customId.startsWith('playlist_edit_')) {
            return await ManagementHandlers.showEditPlaylistModal(interaction);
        }

        // Modal triggers (from menu command or other buttons)
        switch (customId) {
            case 'playlist_create_modal':
                return await ManagementHandlers.showCreatePlaylistModal(interaction);
            case 'playlist_search_modal':
                return await ViewHandlers.showSearchPlaylistModal(interaction);
            case 'playlist_add_track_modal':
                return await TrackHandlers.showAddTrackModal(interaction);
            case 'playlist_delete_modal':
                return await ManagementHandlers.showDeletePlaylistModal(interaction);
            default:
                // Start with check if it is some other button handled elsewhere?
                // No, this function specifically handles playlist buttons.
                break;
        }
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error handling playlist button', { error: error.message, customId });

        try {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    embeds: [createErrorEmbed('Đã xảy ra lỗi khi xử lý yêu cầu!', client.config)],
                    components: []
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [createErrorEmbed('Đã xảy ra lỗi khi xử lý yêu cầu!', client.config)],
                    ephemeral: true
                });
            }
        } catch (followUpError) {
            if (followUpError.code === 10062) return;
            logger.debug('Failed to send error response for playlist button', { error: followUpError.message });
        }
    }
}

/**
 * Handle playlist modal submissions
 */
export async function handlePlaylistModalSubmit(interaction, client) {
    const customId = interaction.customId;

    try {
        // Management Submissions
        if (customId === 'playlist_create_submit') {
            return await ManagementHandlers.handleCreatePlaylistSubmit(interaction, client);
        }
        if (customId === 'playlist_delete_submit') {
            return await ManagementHandlers.handleDeletePlaylistSubmit(interaction, client);
        }
        if (customId.startsWith('playlist_edit_submit_')) {
            return await ManagementHandlers.handleEditPlaylistSubmit(interaction, client);
        }

        // View/Search Submissions
        if (customId === 'playlist_search_submit') {
            return await ViewHandlers.handleSearchPlaylistSubmit(interaction, client);
        }

        // Track Submissions
        if (customId === 'playlist_add_track_submit') {
            return await TrackHandlers.handleAddTrackSubmit(interaction, client);
        }
        if (customId.startsWith('playlist_remove_track_submit_')) {
            return await TrackHandlers.handleRemovePlaylistTrackSubmit(interaction, client);
        }
        if (customId.startsWith('playlist_add_track_to_submit_')) {
            return await TrackHandlers.handleAddTrackToPlaylistSubmit(interaction, client);
        }
        if (customId === 'add_current_track_to_playlist_modal') {
            return await TrackHandlers.handleAddCurrentTrackToPlaylistSubmit(interaction, client);
        }
        if (customId === 'add_queue_to_playlist_modal') {
            return await TrackHandlers.handleAddQueueToPlaylistSubmit(interaction, client);
        }

        // Control Submissions
        if (customId.startsWith('playlist_clone_submit_')) {
            return await ControlHandlers.handleClonePlaylistSubmit(interaction, client);
        }
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error handling playlist modal submit', { error: error.message, customId });

        try {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    embeds: [createErrorEmbed(error.message || 'Đã xảy ra lỗi khi xử lý!', client.config)],
                    components: []
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [createErrorEmbed(error.message || 'Đã xảy ra lỗi khi xử lý!', client.config)],
                    ephemeral: true
                });
            }
        } catch (followUpError) {
            if (followUpError.code === 10062) return;
            logger.debug('Failed to send error response for playlist modal', { error: followUpError.message });
        }
    }
}

// Export handlers
export const handlePlaylistAutocomplete = ViewHandlers.handlePlaylistAutocomplete;

export default {
    handlePlaylistButton,
    handlePlaylistModalSubmit,
    handlePlaylistAutocomplete
};
