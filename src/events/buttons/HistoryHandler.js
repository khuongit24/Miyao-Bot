/**
 * History Replay Button Handlers
 * Handles: History selection and replay
 */

import { createErrorEmbed, createTrackAddedEmbed, createNowPlayingEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons } from '../../UI/components/MusicControls.js';
import logger from '../../utils/logger.js';

export async function handleHistoryReplaySelect(interaction, client) {
    try {
        const selectedValue = interaction.values?.[0];
        if (!selectedValue) {
            return interaction.update({
                embeds: [createErrorEmbed('Không thể xác định lựa chọn của bạn.', client.config)],
                components: []
            });
        }

        const idx = parseInt(selectedValue, 10);
        if (isNaN(idx) || idx < 0) {
            return interaction.update({
                embeds: [createErrorEmbed('Lựa chọn không hợp lệ.', client.config)],
                components: []
            });
        }

        const key = `${interaction.user.id}:${interaction.guildId}`;
        const userCache = client._historyCache?.get(key);

        if (!userCache || !Array.isArray(userCache.history)) {
            return interaction.update({
                embeds: [createErrorEmbed('Phiên lịch sử đã hết hạn, hãy bấm nút Replay lại.', client.config)],
                components: []
            });
        }

        if (idx >= userCache.history.length) {
            return interaction.update({
                embeds: [createErrorEmbed('Bài hát không hợp lệ.', client.config)],
                components: []
            });
        }

        const entry = userCache.history[idx];
        if (!entry?.track?.info) {
            return interaction.update({
                embeds: [createErrorEmbed('Dữ liệu bài hát không hợp lệ.', client.config)],
                components: []
            });
        }

        const track = entry.track;

        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.update({
                embeds: [createErrorEmbed('Bạn phải ở trong voice channel!', client.config)],
                components: []
            });
        }

        let queue = client.musicManager.getQueue(interaction.guildId);

        if (!queue) {
            queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
        }

        if (queue.voiceChannelId !== voiceChannel.id) {
            return interaction.update({
                embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                components: []
            });
        }

        const replayTrack = {
            ...track,
            requester: interaction.user.id
        };

        queue.add(replayTrack);
        const position = queue.current ? queue.tracks.length : 1;

        client._historyCache.delete(key);

        await interaction.update({
            embeds: [createTrackAddedEmbed(replayTrack, position, client.config)],
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
                logger.error('Failed to send now playing message after history replay', err);
            }
        }

        logger.info(`Track replayed from history: ${track.info?.title}`);
    } catch (error) {
        logger.error('History replay select handler error', error);
        await interaction
            .update({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi phát lại bài hát!', client.config)],
                components: []
            })
            .catch(() => {});
    }
}

/**
 * Handle personal history select menu for replaying tracks from database history
 */
export async function handlePersonalHistorySelect(interaction, client) {
    try {
        const selectedValue = interaction.values?.[0];
        if (!selectedValue) {
            return interaction.update({
                content: '❌ Không thể xác định lựa chọn của bạn.',
                embeds: [],
                components: []
            });
        }

        const idx = parseInt(selectedValue.split('_').pop());
        if (isNaN(idx) || idx < 0) {
            return interaction.update({
                content: '❌ Lựa chọn không hợp lệ.',
                embeds: [],
                components: []
            });
        }

        // Get cached history
        const cacheKey = `history_personal:${interaction.user.id}`;
        let historyData = null;

        if (client.cacheManager) {
            historyData = client.cacheManager.get('history', cacheKey);
        } else if (client._personalHistoryCache) {
            historyData = client._personalHistoryCache.get(cacheKey);
        }

        if (!historyData || !Array.isArray(historyData.tracks)) {
            return interaction.update({
                content: '❌ Phiên lịch sử đã hết hạn, hãy dùng lại /history.',
                embeds: [],
                components: []
            });
        }

        const historyEntry = historyData.tracks[idx];
        if (!historyEntry || !historyEntry.track_url) {
            return interaction.update({
                content: '❌ Bài hát không hợp lệ.',
                embeds: [],
                components: []
            });
        }

        // Check voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.update({
                content: '❌ Bạn phải ở trong voice channel!',
                embeds: [],
                components: []
            });
        }

        // Get or create queue
        let queue = client.musicManager.getQueue(interaction.guildId);

        if (!queue) {
            queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
        }

        if (queue.voiceChannelId !== voiceChannel.id) {
            return interaction.update({
                content: '❌ Bot đang ở voice channel khác!',
                embeds: [],
                components: []
            });
        }

        // Defer update before Lavalink search
        await interaction.deferUpdate();

        // Search for the track
        const result = await client.musicManager.search(historyEntry.track_url, interaction.user);

        if (!result || !result.tracks || result.tracks.length === 0) {
            return interaction.editReply({
                content: `❌ Không thể tìm thấy bài hát: **${historyEntry.track_title}**`,
                embeds: [],
                components: []
            });
        }

        const track = result.tracks[0];
        track.requester = interaction.user.id;

        // Add to queue
        queue.add(track);
        const position = queue.current ? queue.tracks.length : 1;

        // Clean up cache
        if (client.cacheManager) {
            client.cacheManager.delete('history', cacheKey);
        } else if (client._personalHistoryCache) {
            client._personalHistoryCache.delete(cacheKey);
        }

        await interaction.editReply({
            embeds: [createTrackAddedEmbed(track, position, client.config)],
            components: []
        });

        // Start playing if not already
        if (!queue.current) {
            await queue.play();

            try {
                const nowPlayingMessage = await interaction.channel.send({
                    embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                    components: createNowPlayingButtons(queue, false)
                });
                queue.setNowPlayingMessage(nowPlayingMessage);
            } catch (err) {
                logger.error('Failed to send now playing message after history replay', err);
            }
        }

        logger.info(`Track replayed from personal history: ${track.info?.title}`);
    } catch (error) {
        logger.error('Personal history select handler error', error);
        await interaction
            .editReply({
                content: '❌ Đã xảy ra lỗi khi phát lại bài hát!',
                embeds: [],
                components: []
            })
            .catch(() => {});
    }
}
