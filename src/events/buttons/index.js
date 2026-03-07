import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import logger from '../../utils/logger.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { COLORS } from '../../config/design-system.js';
import { handleVoteSkipButton } from '../../commands/music/skip.js';
import { getVoteSkipManager } from '../../services/VoteSkipManager.js';

// Import split handlers
import * as MusicHandlers from './MusicHandlers.js';
import * as QueueHandlers from './QueueHandlers.js';
import * as SearchHandlers from './SearchHandlers.js';
import * as LyricsHandler from './LyricsHandler.js';
import * as PlaylistHandlers from './PlaylistHandlers.js';
import * as DiscoveryHandlers from './DiscoveryHandlers.js';
import * as HistoryHandler from './HistoryHandler.js';
import { handleSettingsButton } from '../menus/MenuHandlers.js';

/**
 * Handle button interactions for music controls
 */
export async function handleMusicButton(interaction, client) {
    const customId = interaction.customId;

    // Get queue
    const queue = client.musicManager.getQueue(interaction.guildId);

    // Vote skip handler from /skip command
    if (customId === 'vote_skip') {
        try {
            return await handleVoteSkipButton(interaction, client);
        } catch (error) {
            if (error.code === 10062) return;
            logger.error('Vote skip button error', error);
            await sendErrorResponse(interaction, error, client.config);
            return;
        }
    }

    // Vote skip handler from /voteskip command (different customId to avoid collision)
    if (customId === 'voteskip_vote') {
        try {
            const vsManager = getVoteSkipManager();
            if (!queue || !queue.current) {
                return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
            }
            const session = vsManager.getSession(interaction.guildId);
            if (!session || session.trackUri !== queue.current.info.uri) {
                return sendErrorResponse(
                    interaction,
                    new Error('Phiên vote skip này đã hết hạn!'),
                    client.config,
                    true
                );
            }
            if (session.votes.has(interaction.user.id)) {
                return sendErrorResponse(interaction, new Error('Bạn đã bỏ phiếu rồi!'), client.config, true);
            }
            vsManager.addVote(interaction.guildId, interaction.user.id);
            if (session.votes.size >= session.requiredVotes) {
                vsManager.clearSession(interaction.guildId);
                const skippedTitle = queue.current?.info?.title || 'Unknown';
                await queue.skip();
                const embed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle('⏭️ Bỏ Qua Thành Công')
                    .setDescription(`**${skippedTitle}** đã được bỏ qua bởi bình chọn!`)
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp();
                return interaction.update({ embeds: [embed], components: [] });
            }
            // Update button label with new vote count
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('voteskip_vote')
                    .setLabel(`Bỏ phiếu (${session.votes.size}/${session.requiredVotes})`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏭️')
            );
            return interaction.update({ components: [row] });
        } catch (error) {
            if (error.code === 10062) return;
            logger.error('Voteskip button error', error);
            await sendErrorResponse(interaction, error, client.config);
            return;
        }
    }

    // Common checks
    const noVoiceChannelRequired = [
        'queue_add_to_playlist',
        'queue_remove_track',
        'music_queue',
        'music_lyrics',
        'music_like',
        'music_add_to_playlist'
    ];

    // Check if user is in voice channel
    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (!noVoiceChannelRequired.includes(customId) && !voiceChannel) {
        return sendErrorResponse(
            interaction,
            new Error('Bạn phải ở trong voice channel để sử dụng nút này!'),
            client.config,
            true
        );
    }

    // Check if bot is in same voice channel
    if (
        !noVoiceChannelRequired.includes(customId) &&
        queue &&
        voiceChannel &&
        queue.voiceChannelId !== voiceChannel.id
    ) {
        return sendErrorResponse(interaction, new Error('Bạn phải ở cùng voice channel với bot!'), client.config, true);
    }

    try {
        // Search Handlers
        if (customId === 'search_cancel') {
            return await SearchHandlers.handleSearchCancel(interaction, client);
        }
        if (customId === 'search_confirm_play') {
            return await SearchHandlers.handleSearchConfirmPlay(interaction, client);
        }
        if (customId === 'search_show_detailed') {
            return await SearchHandlers.handleSearchShowDetailed(interaction, client);
        }
        if (customId.startsWith('search_pick_')) {
            const idx = parseInt(customId.split('search_pick_')[1]);
            return await SearchHandlers.handleSearchPick(interaction, client, idx);
        }

        // Guard: require active queue for music control buttons
        if (!queue) {
            return sendErrorResponse(
                interaction,
                new Error('Không có hàng đợi nhạc nào đang hoạt động!'),
                client.config,
                true
            );
        }

        // Music Controls
        switch (customId) {
            case 'music_pause':
                return await MusicHandlers.handlePause(interaction, queue, client);
            case 'music_resume':
                return await MusicHandlers.handleResume(interaction, queue, client);
            case 'music_stop':
                return await MusicHandlers.handleStop(interaction, queue, client);
            case 'music_skip':
                return await MusicHandlers.handleSkip(interaction, queue, client);
            case 'music_previous':
                return await MusicHandlers.handlePrevious(interaction, queue, client);
            case 'music_loop':
                return await MusicHandlers.handleLoop(interaction, queue, client);
            case 'music_shuffle':
                return await MusicHandlers.handleShuffle(interaction, queue, client);
            case 'music_volume_up':
                return await MusicHandlers.handleVolumeUp(interaction, queue, client);
            case 'music_volume_down':
                return await MusicHandlers.handleVolumeDown(interaction, queue, client);
            case 'music_queue':
                return await QueueHandlers.handleShowQueue(interaction, queue, client);

            case 'music_lyrics':
                return await LyricsHandler.handleLyrics(interaction, queue, client);
            case 'music_settings':
                return await handleSettingsButton(interaction, client);

            // Convert legacy switch value logic to lookup map later if needed
            case 'music_seek_backward_30':
                return await MusicHandlers.handleSeek(interaction, queue, client, -30000);
            case 'music_seek_backward_10':
                return await MusicHandlers.handleSeek(interaction, queue, client, -10000);
            case 'music_seek_start':
                return await MusicHandlers.handleSeek(interaction, queue, client, 0, true);
            case 'music_seek_forward_10':
                return await MusicHandlers.handleSeek(interaction, queue, client, 10000);
            case 'music_seek_forward_30':
                return await MusicHandlers.handleSeek(interaction, queue, client, 30000);

            case 'music_replay':
                return await MusicHandlers.handleReplay(interaction, queue, client);
            case 'history_replay_cancel':
                return await interaction.update({
                    content: '❌ Đã hủy chọn bài từ lịch sử.',
                    embeds: [],
                    components: []
                });

            case 'music_add_to_playlist':
                return await PlaylistHandlers.handleAddCurrentTrackToPlaylist(interaction, queue, client);
            case 'music_like':
                return await MusicHandlers.handleLikeTrack(interaction, queue, client);

            case 'queue_add_to_playlist':
                return await PlaylistHandlers.handleAddQueueToPlaylist(interaction, queue, client);
            case 'queue_remove_track':
                return await QueueHandlers.handleRemoveQueueTrack(interaction, queue, client);

            // Queue Pagination (handled in separate logic block or default?)
            // The original had handleQueueButton for pagination which is separate from this switch
            // But handleQueueButton is usually called via direct export in index.js, not via handleMusicButton
            // Wait, handleMusicButton only handles the initial 'music_queue' button.
            // Pagination buttons like 'queue_next' are handled by handleQueueButton directly if exported.

            default:
                // Check if it's a queue pagination button
                if (customId.startsWith('queue_')) {
                    // This might be handled by a separate interaction listener calling handleQueueButton
                    // but if it falls through here, we can try to handle it or error
                    // In the original, handleMusicButton covers 'queue_add_to_playlist' and 'queue_remove_track'
                    // The actual pagination logic is in handleQueueButton which is exported separately

                    // We should log unrecognized button
                    return sendErrorResponse(
                        interaction,
                        new Error('Nút này chưa được triển khai!'),
                        client.config,
                        true
                    );
                }

                await sendErrorResponse(interaction, new Error('Nút này chưa được triển khai!'), client.config, true);
        }
    } catch (error) {
        if (error.code === 10062) return;
        logger.error(`Button handler error: ${customId}`, error);

        await sendErrorResponse(interaction, error, client.config);
    }
}

// Re-export specific handlers for external use (e.g. interactionCreate.js)
export const handleQueueButton = QueueHandlers.handleQueueButton;
export const handleSearchSelect = SearchHandlers.handleSearchSelect;
export const handleHistoryReplaySelect = HistoryHandler.handleHistoryReplaySelect;
export const handlePersonalHistorySelect = HistoryHandler.handlePersonalHistorySelect;
export const handleDiscoverySelect = DiscoveryHandlers.handleDiscoverySelect;
export const handleDiscoveryButton = DiscoveryHandlers.handleDiscoveryButton;
export const handleQueueRemoveTrackModalSubmit = QueueHandlers.handleQueueRemoveTrackModalSubmit;

export default {
    handleMusicButton,
    handleQueueButton,
    handleSearchSelect,
    handleHistoryReplaySelect,
    handleDiscoverySelect,
    handleDiscoveryButton,
    handleQueueRemoveTrackModalSubmit
};
