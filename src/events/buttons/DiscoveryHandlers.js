/**
 * Discovery Button Handlers
 * Handles: Discovery, Similar, Trending (Select & Play All/Shuffle)
 */

import { createSuccessEmbed, createTrackAddedEmbed, createNowPlayingEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { createNowPlayingButtons } from '../../UI/components/MusicControls.js';
import logger from '../../utils/logger.js';

async function resolvePlayableTrackIfNeeded(client, interaction, track, type) {
    if (!track?._requiresResolve || !track?.info?.uri) {
        return track;
    }

    const result = await client.musicManager.search(track.info.uri, interaction.user);
    if (!result?.tracks?.length) {
        logger.debug('Failed to lazily resolve discovery track', {
            type,
            guildId: interaction.guildId,
            uri: track.info.uri
        });
        return null;
    }

    const resolved = result.tracks[0];
    resolved._playCount = track._playCount;
    return resolved;
}

export async function handleDiscoverySelect(interaction, client, type) {
    try {
        const selectedValue = interaction.values?.[0];
        if (!selectedValue) {
            return sendErrorResponse(
                interaction,
                new Error('Không thể xác định lựa chọn của bạn.'),
                client.config,
                true
            );
        }

        const parts = selectedValue.split('_');
        const idx = parseInt(parts[parts.length - 1]);
        if (isNaN(idx) || idx < 0) {
            return sendErrorResponse(interaction, new Error('Lựa chọn không hợp lệ.'), client.config, true);
        }

        const key = `${interaction.user.id}:${interaction.guildId}`;
        let userCache = null;
        let cacheSource = null;

        if (client.cacheManager) {
            const cacheNamespace =
                type === 'discover'
                    ? 'discovery'
                    : type === 'similar'
                      ? 'similar'
                      : type === 'trending'
                        ? 'trending'
                        : null;

            if (cacheNamespace) {
                userCache = client.cacheManager.get(cacheNamespace, key);
                if (userCache) cacheSource = 'cacheManager';
            }
        }

        if (!userCache) {
            const cacheMap =
                type === 'discover'
                    ? client._discoveryCache
                    : type === 'similar'
                      ? client._similarCache
                      : type === 'trending'
                        ? client._trendingCache
                        : null;

            if (cacheMap) {
                userCache = cacheMap.get(key);
                if (userCache) cacheSource = 'fallbackMap';
            }
        }

        if (!userCache || !Array.isArray(userCache.tracks)) {
            return sendErrorResponse(
                interaction,
                new Error('Phiên tìm kiếm đã hết hạn, hãy sử dụng lại lệnh.'),
                client.config,
                true
            );
        }

        const selectedTrack = userCache.tracks[idx];
        if (!selectedTrack) {
            return sendErrorResponse(interaction, new Error('Bài hát không hợp lệ.'), client.config, true);
        }

        const track = await resolvePlayableTrackIfNeeded(client, interaction, selectedTrack, type);
        if (!track) {
            return sendErrorResponse(
                interaction,
                new Error('Không thể tải bài hát đã chọn. Vui lòng thử bài khác.'),
                client.config,
                true
            );
        }

        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return sendErrorResponse(interaction, new Error('Bạn phải ở trong voice channel!'), client.config, true);
        }

        let queue = client.musicManager.getQueue(interaction.guildId);

        if (!queue) {
            queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
        }

        if (queue.voiceChannelId !== voiceChannel.id) {
            return sendErrorResponse(interaction, new Error('Bot đang ở voice channel khác!'), client.config, true);
        }

        track.requester = interaction.user.id;
        queue.add(track);
        const position = queue.current ? queue.tracks.length : 1;

        if (cacheSource === 'cacheManager' && client.cacheManager) {
            const cacheNamespace =
                type === 'discover'
                    ? 'discovery'
                    : type === 'similar'
                      ? 'similar'
                      : type === 'trending'
                        ? 'trending'
                        : null;
            if (cacheNamespace) {
                client.cacheManager.delete(cacheNamespace, key);
            }
        } else if (cacheSource === 'fallbackMap') {
            const cacheMap =
                type === 'discover'
                    ? client._discoveryCache
                    : type === 'similar'
                      ? client._similarCache
                      : type === 'trending'
                        ? client._trendingCache
                        : null;
            if (cacheMap) {
                cacheMap.delete(key);
            }
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
                logger.error('Failed to send now playing message after discovery select', err);
            }
        }

        logger.info(`Track selected from ${type}: ${track.info?.title}`);
    } catch (error) {
        logger.error(`Discovery select handler error (${type})`, error);
        await sendErrorResponse(interaction, error, client.config);
    }
}

export async function handleDiscoveryButton(interaction, client) {
    try {
        const customId = interaction.customId;
        let type = null;
        let action = null;

        if (customId.startsWith('similar_play_all_')) {
            type = 'similar';
            action = 'play_all';
        } else if (customId.startsWith('trending_play_all_')) {
            type = 'trending';
            action = 'play_all';
        } else if (customId.startsWith('trending_shuffle_')) {
            type = 'trending';
            action = 'shuffle';
        } else if (customId.startsWith('discover_play_all_')) {
            type = 'discover';
            action = 'play_all';
        } else if (customId.startsWith('discover_shuffle_all_')) {
            type = 'discover';
            action = 'shuffle';
        }

        if (!type || !action) {
            return sendErrorResponse(interaction, new Error('Nút không hợp lệ.'), client.config, true);
        }

        const key = `${interaction.user.id}:${interaction.guildId}`;
        let userCache = null;
        let cacheSource = null;

        if (client.cacheManager) {
            const cacheNamespace =
                type === 'discover'
                    ? 'discovery'
                    : type === 'similar'
                      ? 'similar'
                      : type === 'trending'
                        ? 'trending'
                        : null;

            if (cacheNamespace) {
                userCache = client.cacheManager.get(cacheNamespace, key);
                if (userCache) cacheSource = 'cacheManager';
            }
        }

        if (!userCache) {
            const cacheMap =
                type === 'discover'
                    ? client._discoveryCache
                    : type === 'similar'
                      ? client._similarCache
                      : type === 'trending'
                        ? client._trendingCache
                        : null;

            if (cacheMap) {
                userCache = cacheMap.get(key);
                if (userCache) cacheSource = 'fallbackMap';
            }
        }

        if (!userCache || !Array.isArray(userCache.tracks) || userCache.tracks.length === 0) {
            return sendErrorResponse(
                interaction,
                new Error('Phiên tìm kiếm đã hết hạn, hãy sử dụng lại lệnh.'),
                client.config,
                true
            );
        }

        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return sendErrorResponse(interaction, new Error('Bạn phải ở trong voice channel!'), client.config, true);
        }

        let queue = client.musicManager.getQueue(interaction.guildId);

        if (!queue) {
            queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
        }

        if (queue.voiceChannelId !== voiceChannel.id) {
            return sendErrorResponse(interaction, new Error('Bot đang ở voice channel khác!'), client.config, true);
        }

        const tracksToAdd = [...userCache.tracks];

        if (action === 'shuffle') {
            for (let i = tracksToAdd.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracksToAdd[i], tracksToAdd[j]] = [tracksToAdd[j], tracksToAdd[i]];
            }
        }

        tracksToAdd.forEach(track => {
            track.requester = interaction.user.id;
        });

        const wasPlaying = !!queue.current;
        let addedCount = 0;

        for (const rawTrack of tracksToAdd) {
            const track = await resolvePlayableTrackIfNeeded(client, interaction, rawTrack, type);
            if (!track) {
                continue;
            }

            queue.add(track);
            addedCount++;
        }

        if (addedCount === 0) {
            return sendErrorResponse(
                interaction,
                new Error('Không thể tải các bài hát trong danh sách này.'),
                client.config,
                true
            );
        }

        if (cacheSource === 'cacheManager' && client.cacheManager) {
            const cacheNamespace =
                type === 'discover'
                    ? 'discovery'
                    : type === 'similar'
                      ? 'similar'
                      : type === 'trending'
                        ? 'trending'
                        : null;
            if (cacheNamespace) {
                client.cacheManager.delete(cacheNamespace, key);
            }
        } else if (cacheSource === 'fallbackMap') {
            const cacheMap =
                type === 'discover'
                    ? client._discoveryCache
                    : type === 'similar'
                      ? client._similarCache
                      : type === 'trending'
                        ? client._trendingCache
                        : null;
            if (cacheMap) {
                cacheMap.delete(key);
            }
        }

        const typeLabels = {
            discover: '🔍 Khám phá',
            similar: '🔎 Tương tự',
            trending: '🔥 Trending'
        };

        const actionLabels = {
            play_all: 'Đã thêm',
            shuffle: 'Đã xáo trộn và thêm'
        };

        const embed = createSuccessEmbed(
            `${typeLabels[type]} - ${actionLabels[action]}`,
            `✅ ${actionLabels[action]} **${addedCount}** bài hát vào hàng đợi!`,
            client.config
        );

        await interaction.update({
            embeds: [embed],
            components: []
        });

        if (!wasPlaying && !queue.current) {
            await queue.play();
            try {
                const nowPlayingMessage = await interaction.channel.send({
                    embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                    components: createNowPlayingButtons(queue, false)
                });
                queue.setNowPlayingMessage(nowPlayingMessage);
            } catch (err) {
                logger.error('Failed to send now playing message after discovery button', err);
            }
        }

        logger.info(`Discovery button used: ${type} ${action}, added ${addedCount} tracks`);
    } catch (error) {
        logger.error('Discovery button handler error', error);
        await sendErrorResponse(interaction, error, client.config);
    }
}
