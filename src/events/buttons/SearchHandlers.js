/**
 * Search Button Handlers
 * Handles: Cancel search, Confirm play, Detailed view, Pick track, Search select dropdown
 */

import { createTrackAddedEmbed, createNowPlayingEmbed, createInfoEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { createNowPlayingButtons, createSearchResultButtons } from '../../UI/components/MusicControls.js';
import { getAutoPlayPreferenceService } from '../../services/AutoPlayPreferenceService.js';
import { maybeSendAutoPlaySuggestion, getConfirmationProgress } from '../autoPlaySuggestionHandler.js';
import logger from '../../utils/logger.js';

/**
 * Send a non-intrusive progress hint about auto-play confirmation tracking.
 * Only shown when the user has 2+ confirmations but hasn't reached the threshold yet.
 * This helps users understand the auto-play feature exists and how it works.
 *
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {string} userId
 * @param {string} trackUrl
 */
async function maybeSendProgressHint(channel, userId, trackUrl) {
    try {
        const progress = getConfirmationProgress(userId, trackUrl);
        if (!progress) return;

        const { current, threshold } = progress;
        // Only show at specific milestones to avoid spam: 2nd, 3rd, and (threshold-1)th
        const milestones = [2, 3, threshold - 1];
        if (!milestones.includes(current)) return;

        const remaining = threshold - current;
        const hint =
            remaining === 1
                ? '💡 _Còn 1 lần nữa là bot sẽ đề nghị tự động phát bài này!_'
                : `💡 _Nghe bài này thêm ${remaining} lần nữa, bot sẽ đề nghị auto-play._`;

        const msg = await channel.send({ content: hint });
        // Auto-delete after 8 seconds to keep chat clean
        setTimeout(() => msg.delete().catch(() => {}), 8_000);
    } catch {
        // Non-critical — silence errors
    }
}

/**
 * Shared helper for processing a search result: voice-channel validation,
 * queue creation, track adding, now-playing response, and auto-play tracking.
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {object} client
 * @param {object} track - The selected track to play
 * @returns {Promise<boolean>} true if successfully processed, false if an error response was sent
 */
async function _processSearchResult(interaction, client, track) {
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        await sendErrorResponse(interaction, new Error('Bạn phải ở trong voice channel!'), client.config);
        return false;
    }

    let queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue) {
        queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
    }
    if (queue.voiceChannelId !== voiceChannel.id) {
        await sendErrorResponse(interaction, new Error('Bot đang ở voice channel khác!'), client.config);
        return false;
    }

    track.requester = interaction.user.id;
    queue.add(track);
    const position = queue.current ? queue.tracks.length : 1;

    // Clear search cache
    const key = `${interaction.user.id}:${interaction.guildId}`;
    if (client.cacheManager) {
        client.cacheManager.delete('searchResults', key);
    } else {
        client._lastSearchResults?.delete(key);
    }

    await interaction.update({
        embeds: [createTrackAddedEmbed(track, position, client.config)],
        components: []
    });

    if (!queue.current) {
        await queue.play();
        try {
            const nowPlayingMessage = await interaction.channel.send({
                embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                components: createNowPlayingButtons(queue, false)
            });
            queue.setNowPlayingMessage(nowPlayingMessage);
        } catch (err) {
            logger.error('Failed to send now playing message', err);
        }
    }

    // Auto-play tracking: record confirmation and maybe suggest auto-play
    try {
        const trackUrl = track.info?.uri || track.uri || track.url || '';
        // BUG-009: Guard against empty URL creating phantom confirmations
        if (trackUrl) {
            const apService = getAutoPlayPreferenceService();
            const trackMeta = {
                url: trackUrl,
                title: track.info?.title || track.title || 'Unknown',
                author: track.info?.author || track.author || null
            };
            apService.recordConfirmation(interaction.user.id, trackMeta);

            // Check if we should suggest auto-play (non-blocking)
            maybeSendAutoPlaySuggestion(interaction.channel, interaction.user.id, trackMeta, client.config).catch(
                () => {}
            );

            // Show progress hint toward auto-play threshold (non-blocking)
            maybeSendProgressHint(interaction.channel, interaction.user.id, trackUrl).catch(() => {});
        }
    } catch (err) {
        logger.debug('Auto-play tracking failed (non-critical)', err.message);
    }

    return true;
}

export async function handleSearchCancel(interaction, client) {
    const key = `${interaction.user.id}:${interaction.guildId}`;
    if (client.cacheManager) {
        client.cacheManager.delete('searchResults', key);
    } else {
        client._lastSearchResults?.delete(key);
    }
    await interaction.update({ content: '❌ Đã hủy lựa chọn.', embeds: [], components: [] });
}

export async function handleSearchConfirmPlay(interaction, client) {
    const key = `${interaction.user.id}:${interaction.guildId}`;

    // Phase 7.2: Use unified CacheManager
    let userCache;
    if (client.cacheManager) {
        userCache = client.cacheManager.get('searchResults', key);
    } else {
        userCache = client._lastSearchResults?.get(key);
    }

    if (!userCache || !Array.isArray(userCache.tracks) || userCache.tracks.length === 0) {
        return sendErrorResponse(
            interaction,
            new Error('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.'),
            client.config
        );
    }
    const track = userCache.tracks[0];

    const success = await _processSearchResult(interaction, client, track);
    if (!success) return;

    logger.command('play-confirmed', interaction.user.id, interaction.guildId);
}

export async function handleSearchShowDetailed(interaction, client) {
    const key = `${interaction.user.id}:${interaction.guildId}`;

    let userCache;
    if (client.cacheManager) {
        userCache = client.cacheManager.get('searchResults', key);
    } else {
        userCache = client._lastSearchResults?.get(key);
    }

    if (!userCache || !Array.isArray(userCache.tracks)) {
        return sendErrorResponse(
            interaction,
            new Error('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.'),
            client.config
        );
    }
    const choices = userCache.tracks;
    const description = choices
        .map((t, i) => {
            const title = t.info.title.length > 60 ? t.info.title.substring(0, 57) + '...' : t.info.title;
            const duration = t.info.isStream ? '🔴 LIVE' : `${Math.round(t.info.length / 1000 / 60) || 0}p`;
            return `**${i + 1}.** ${title} • ${duration}`;
        })
        .join('\n');

    await interaction.update({
        embeds: [
            createInfoEmbed('Kết quả tìm kiếm', `Chọn một kết quả bên dưới để phát:\n\n${description}`, client.config)
        ],
        components: createSearchResultButtons(choices)
    });
    logger.command('play-detailed-search', interaction.user.id, interaction.guildId);
}

export async function handleSearchPick(interaction, client, idx) {
    const key = `${interaction.user.id}:${interaction.guildId}`;

    let userCache;
    if (client.cacheManager) {
        userCache = client.cacheManager.get('searchResults', key);
    } else {
        userCache = client._lastSearchResults?.get(key);
    }

    if (!userCache || !Array.isArray(userCache.tracks)) {
        return sendErrorResponse(
            interaction,
            new Error('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.'),
            client.config
        );
    }
    const track = userCache.tracks[idx];
    if (!track) {
        return sendErrorResponse(interaction, new Error('Mục bạn chọn không hợp lệ.'), client.config);
    }

    await _processSearchResult(interaction, client, track);
}

export async function handleSearchSelect(interaction, client) {
    try {
        const idx = parseInt(interaction.values[0], 10);

        const key = `${interaction.user.id}:${interaction.guildId}`;

        let userCache;
        if (client.cacheManager) {
            userCache = client.cacheManager.get('searchResults', key);
        } else {
            userCache = client._lastSearchResults?.get(key);
        }

        if (!userCache || !Array.isArray(userCache.tracks)) {
            return sendErrorResponse(
                interaction,
                new Error('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.'),
                client.config
            );
        }

        const track = userCache.tracks[idx];
        if (!track) {
            return sendErrorResponse(interaction, new Error('Bài hát không hợp lệ.'), client.config);
        }

        const success = await _processSearchResult(interaction, client, track);
        if (!success) return;

        logger.info(`Track selected from search: ${track.info?.title}`);
    } catch (error) {
        logger.error('Search select handler error', error);
        await sendErrorResponse(interaction, error, client.config);
    }
}
