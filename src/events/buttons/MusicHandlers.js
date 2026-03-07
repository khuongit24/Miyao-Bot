/**
 * Music Control Button Handlers
 * Handles: Pause, Resume, Stop, Skip, Previous, Loop, Shuffle, Volume, Seek, Replay, Like
 */

import { createSuccessEmbed, createInfoEmbed, createHistoryReplayEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { createHistoryReplayButtons } from '../../UI/components/MusicControls.js';
import logger from '../../utils/logger.js';
import Playlist from '../../database/models/Playlist.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { COLORS } from '../../config/design-system.js';
import GuildSettings from '../../database/models/GuildSettings.js';
import { checkDJPermission } from '../../utils/permissions.js';
import { canBypassVoteSkip } from '../../commands/music/skip.js';
import { getVoteSkipManager } from '../../services/VoteSkipManager.js';

export async function handlePause(interaction, queue, client) {
    try {
        if (!queue || !queue.current) {
            return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
        }

        if (queue.paused) {
            return sendErrorResponse(interaction, new Error('Nhạc đã được tạm dừng rồi!'), client.config, true);
        }

        await queue.pause();

        await interaction.reply({
            embeds: [createSuccessEmbed('Đã tạm dừng', 'Nhạc đã được tạm dừng.', client.config)],
            ephemeral: true
        });

        logger.music('Track paused via button', { guildId: interaction.guildId });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handlePause', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleResume(interaction, queue, client) {
    try {
        if (!queue || !queue.current) {
            return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
        }

        if (!queue.paused) {
            return sendErrorResponse(interaction, new Error('Nhạc đang phát!'), client.config, true);
        }

        await queue.resume();

        await interaction.reply({
            embeds: [createSuccessEmbed('Đã tiếp tục', 'Nhạc đã được tiếp tục.', client.config)],
            ephemeral: true
        });

        logger.music('Track resumed via button', { guildId: interaction.guildId });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleResume', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleStop(interaction, queue, client) {
    try {
        if (!queue || !queue.current) {
            return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
        }

        await queue.stop();

        await interaction.reply({
            embeds: [
                createSuccessEmbed('Đã dừng phát nhạc', 'Đã dừng phát nhạc và xóa hàng đợi thành công.', client.config)
            ],
            ephemeral: true
        });

        logger.music('Queue stopped via button', { guildId: interaction.guildId });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleStop', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleSkip(interaction, queue, client) {
    try {
        if (!queue || !queue.current) {
            return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
        }

        const guildSettings = GuildSettings.get(interaction.guildId);

        // P0-03: DJ-only mode check
        if (guildSettings.djOnlyMode) {
            const djCheck = checkDJPermission(interaction.member, interaction.guildId);
            if (!djCheck.allowed) {
                return sendErrorResponse(
                    interaction,
                    new Error('Chế độ DJ-only đang bật! Bạn cần vai trò DJ để skip.'),
                    client.config,
                    true
                );
            }
        }

        // P0-03: Vote-skip check
        if (guildSettings.voteSkipEnabled) {
            const canBypass = await canBypassVoteSkip(interaction, queue, guildSettings);
            if (!canBypass) {
                return await _handleButtonVoteSkip(interaction, client, queue, guildSettings);
            }
        }

        // Clear any existing vote skip session on direct skip
        getVoteSkipManager().clearSession(interaction.guildId);

        const skipped = queue.current?.info?.title || 'Unknown Track';
        await queue.skip();

        await interaction.reply({
            embeds: [createSuccessEmbed('Đã bỏ qua', `Đã bỏ qua **${skipped}**`, client.config)],
            ephemeral: true
        });

        logger.music('Track skipped via button', { guildId: interaction.guildId });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleSkip', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

/**
 * P0-03: Handle vote skip initiated from the skip button
 * Adapted from commands/music/skip.js handleVoteSkip for button interactions
 */
async function _handleButtonVoteSkip(interaction, client, queue, guildSettings) {
    const voiceChannel = interaction.guild.channels.cache.get(queue.voiceChannelId);
    const membersInVoice = voiceChannel ? voiceChannel.members.filter(m => !m.user.bot).size : 1;

    const requiredPercentage = guildSettings.voteSkipPercentage || 50;
    const requiredVotes = Math.ceil(membersInVoice * (requiredPercentage / 100));

    const manager = getVoteSkipManager();
    let session = manager.getSession(interaction.guildId);

    if (session && session.trackUri !== queue.current?.info?.uri) {
        session = null;
        manager.clearSession(interaction.guildId);
    }

    if (!session) {
        session = manager.createSession(interaction.guildId, {
            trackUri: queue.current?.info?.uri || '',
            trackTitle: queue.current?.info?.title || 'Unknown Track',
            initiatorId: interaction.user.id,
            requiredVotes
        });
    } else {
        if (session.votes.has(interaction.user.id)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(COLORS.ERROR).setDescription('❌ Bạn đã vote skip rồi!')],
                ephemeral: true
            });
        }
        session.votes.add(interaction.user.id);
    }

    session.requiredVotes = requiredVotes;

    if (session.votes.size >= session.requiredVotes) {
        manager.clearSession(interaction.guildId);
        const skippedTrack = queue.current?.info?.title || 'Unknown Track';
        await queue.skip();

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.config.bot.color)
                    .setTitle('⏭️ Vote Skip Thành Công!')
                    .setDescription(
                        `Đã bỏ qua **${skippedTrack}**\n└ ${session.votes.size}/${session.requiredVotes} phiếu bầu`
                    )
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp()
            ]
        });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('🗳️ Vote Skip')
        .setDescription(
            `**${session.trackTitle}**\n\n` +
                `📊 **Tiến độ:** ${session.votes.size}/${session.requiredVotes} phiếu\n` +
                `👥 **Thành viên trong voice:** ${membersInVoice}\n` +
                `📈 **Yêu cầu:** ${requiredPercentage}% phiếu bầu\n\n` +
                '*Nhấn nút bên dưới để vote skip!*'
        )
        .setFooter({ text: 'Vote sẽ hết hạn khi bài hát kết thúc' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vote_skip')
            .setLabel(`Vote Skip (${session.votes.size}/${session.requiredVotes})`)
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Primary)
    );

    const reply = await interaction.reply({ embeds: [embed], components: [row] });
    session.messageId = reply.id;
}

export async function handlePrevious(interaction, queue, client) {
    try {
        if (!queue) {
            return sendErrorResponse(interaction, new Error('Không có hàng đợi nào!'), client.config, true);
        }

        // BUG-C25: Check player exists before calling previous()
        if (!queue.player) {
            return sendErrorResponse(
                interaction,
                new Error('Không có trình phát nào đang hoạt động!'),
                client.config,
                true
            );
        }

        if (!queue.history || queue.history.length === 0) {
            return sendErrorResponse(
                interaction,
                new Error('Không có bài hát nào trong lịch sử để quay lại!'),
                client.config,
                true
            );
        }

        const result = await queue.previous();

        if (!result.success) {
            return sendErrorResponse(
                interaction,
                new Error(result.message || 'Không thể quay lại bài trước!'),
                client.config,
                true
            );
        }

        const previousTrack = result.track;
        const trackTitle = previousTrack?.info?.title || 'Unknown';
        const trackAuthor = previousTrack?.info?.author || 'Unknown';

        await interaction.reply({
            embeds: [
                createSuccessEmbed(
                    '⏮️ Đã quay lại bài trước',
                    `Đang phát: **${trackTitle}**\n👤 ${trackAuthor}`,
                    client.config
                )
            ],
            ephemeral: true
        });

        logger.music('Previous track played via button', {
            guildId: interaction.guildId,
            track: trackTitle,
            historyRemaining: queue.history?.length || 0
        });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handlePrevious', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleLoop(interaction, queue, client) {
    try {
        if (!queue) {
            return sendErrorResponse(interaction, new Error('Không có hàng đợi nào!'), client.config, true);
        }

        const modes = ['off', 'track', 'queue'];
        const currentIndex = modes.indexOf(queue.loop);
        const nextMode = modes[(currentIndex + 1) % modes.length];

        await queue.setLoop(nextMode);

        const modeText = {
            off: 'Tắt',
            track: '🔂 Lặp bài hát',
            queue: '🔁 Lặp hàng đợi'
        };

        await interaction.reply({
            embeds: [
                createSuccessEmbed('Đã thay đổi chế độ lặp', `Chế độ lặp: **${modeText[nextMode]}**`, client.config)
            ],
            ephemeral: true
        });

        logger.music('Loop mode changed via button', { guildId: interaction.guildId, mode: nextMode });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleLoop', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleShuffle(interaction, queue, client) {
    try {
        if (!queue) {
            return sendErrorResponse(interaction, new Error('Không có hàng đợi nào!'), client.config, true);
        }

        if (queue.tracks.length < 2) {
            return sendErrorResponse(
                interaction,
                new Error('Cần ít nhất 2 bài trong hàng đợi để xáo trộn!'),
                client.config,
                true
            );
        }

        queue.shuffle();

        await interaction.reply({
            embeds: [
                createSuccessEmbed(
                    'Đã xáo trộn',
                    `Đã xáo trộn ${queue.tracks.length} bài trong hàng đợi.`,
                    client.config
                )
            ],
            ephemeral: true
        });

        logger.music('Queue shuffled via button', { guildId: interaction.guildId });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleShuffle', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleVolumeUp(interaction, queue, client) {
    try {
        if (!queue) {
            return sendErrorResponse(interaction, new Error('Không có hàng đợi nào!'), client.config, true);
        }

        const newVolume = Math.min(100, queue.volume + 10);
        await queue.setVolume(newVolume);

        await interaction.reply({
            embeds: [createInfoEmbed('Âm lượng', `Đã tăng âm lượng lên **${newVolume}%**`, client.config)],
            ephemeral: true
        });

        await queue.updateNowPlaying();
        logger.music('Volume increased via button', { guildId: interaction.guildId, volume: newVolume });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleVolumeUp', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleVolumeDown(interaction, queue, client) {
    try {
        if (!queue) {
            return sendErrorResponse(interaction, new Error('Không có hàng đợi nào!'), client.config, true);
        }

        const newVolume = Math.max(0, queue.volume - 10);
        await queue.setVolume(newVolume);

        await interaction.reply({
            embeds: [createInfoEmbed('Âm lượng', `Đã giảm âm lượng xuống **${newVolume}%**`, client.config)],
            ephemeral: true
        });

        await queue.updateNowPlaying();
        logger.music('Volume decreased via button', { guildId: interaction.guildId, volume: newVolume });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleVolumeDown', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleSeek(interaction, queue, client, offset, absolute = false) {
    try {
        if (!queue || !queue.current) {
            return sendErrorResponse(interaction, new Error('Không có nhạc nào đang phát!'), client.config, true);
        }

        if (typeof offset !== 'number' || isNaN(offset)) {
            return sendErrorResponse(interaction, new Error('Tham số seek không hợp lệ!'), client.config, true);
        }

        if (queue.current.info?.isStream) {
            return sendErrorResponse(interaction, new Error('Không thể tua livestream!'), client.config, true);
        }

        const currentPosition = queue.player?.position || 0;
        const duration = queue.current.info?.length;

        if (!duration || duration <= 0) {
            return sendErrorResponse(
                interaction,
                new Error('Không thể xác định thời lượng bài hát!'),
                client.config,
                true
            );
        }

        let newPosition;

        if (absolute) {
            newPosition = offset;
        } else {
            newPosition = currentPosition + offset;
        }

        newPosition = Math.max(0, Math.min(newPosition, duration - 1000));

        await queue.seek(newPosition);

        const formatTime = ms => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };

        const action = absolute
            ? '🔄 Restart'
            : offset > 0
              ? `⏩ +${Math.abs(offset / 1000)}s`
              : `⏪ -${Math.abs(offset / 1000)}s`;

        await interaction.reply({
            embeds: [
                createInfoEmbed(
                    'Đã tua nhạc',
                    `${action}\n**Vị trí mới:** ${formatTime(newPosition)} / ${formatTime(duration)}`,
                    client.config
                )
            ],
            ephemeral: true
        });

        await queue.updateNowPlaying();

        logger.music('Track seeked via button', {
            guildId: interaction.guildId,
            offset,
            absolute,
            newPosition,
            track: queue.current.info.title
        });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleSeek', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleReplay(interaction, queue, client) {
    try {
        if (!queue) {
            return sendErrorResponse(interaction, new Error('Không có lịch sử phát nhạc!'), client.config, true);
        }

        const history = queue.history || [];

        if (history.length === 0) {
            return sendErrorResponse(interaction, new Error('Chưa có bài hát nào trong lịch sử!'), client.config, true);
        }

        if (!client._historyCache) {
            client._historyCache = new Map();
        }

        if (!client._historyCacheCleanupInterval) {
            client._historyCacheCleanupInterval = setInterval(() => {
                const now = Date.now();
                let cleanedCount = 0;
                for (const [key, value] of client._historyCache.entries()) {
                    if (!value?.timestamp || now - value.timestamp > 300000) {
                        client._historyCache.delete(key);
                        cleanedCount++;
                    }
                }
                if (cleanedCount > 0) {
                    logger.debug(`Cleaned ${cleanedCount} expired history cache entries`);
                }
            }, 60000).unref();
        }

        const key = `${interaction.user.id}:${interaction.guildId}`;

        if (client._historyCache.has(key)) {
            client._historyCache.delete(key);
        }

        // EV-M04: Enforce max size limit of 100 entries, evict oldest when full
        const HISTORY_CACHE_MAX_SIZE = 100;
        if (client._historyCache.size >= HISTORY_CACHE_MAX_SIZE) {
            const oldestKey = client._historyCache.keys().next().value;
            client._historyCache.delete(oldestKey);
        }

        client._historyCache.set(key, { history, timestamp: Date.now() });

        await interaction.reply({
            embeds: [createHistoryReplayEmbed(history, client.config)],
            components: createHistoryReplayButtons(history),
            ephemeral: false
        });

        logger.music('History replay menu shown', {
            guildId: interaction.guildId,
            historyCount: history.length,
            userId: interaction.user.id
        });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleReplay', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

export async function handleLikeTrack(interaction, queue, client) {
    try {
        if (!queue || !queue.current) {
            return sendErrorResponse(interaction, new Error('Không có bài hát nào đang phát!'), client.config, true);
        }

        const track = queue.current;
        const SHARED_PLAYLIST_NAME = 'Được mọi người yêu thích';

        const botUserId = client.user.id;
        const botUsername = client.user.username;
        const guildId = interaction.guildId;

        try {
            let sharedPlaylist = Playlist.getByName(SHARED_PLAYLIST_NAME, botUserId, guildId);

            if (!sharedPlaylist) {
                sharedPlaylist = Playlist.create(
                    SHARED_PLAYLIST_NAME,
                    botUserId,
                    botUsername,
                    guildId,
                    '💕 Playlist chứa những bài hát được mọi người trong server yêu thích!',
                    true
                );

                logger.info('Created shared favorites playlist', {
                    playlistId: sharedPlaylist.id,
                    guildId
                });
            }

            const existingTracks = Playlist.getTracks(sharedPlaylist.id);
            const isAlreadyInPlaylist = existingTracks.some(t => t.track_url === track.info.uri);

            if (isAlreadyInPlaylist) {
                const embed = new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setTitle('💝 Bài hát này đã được yêu thích rồi!')
                    .setDescription(
                        `**${track.info.title}**\n└ 🎤 ${track.info.author}\n\n*Bài hát này đã có trong playlist "${SHARED_PLAYLIST_NAME}" trước đó rồi nhé!*`
                    )
                    .setThumbnail(track.info.artworkUrl || null)
                    .setFooter({ text: `Playlist hiện có ${existingTracks.length} bài hát` })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const trackData = {
                url: track.info.uri,
                title: track.info.title,
                author: track.info.author,
                duration: track.info.length
            };

            const addedTrack = Playlist.addTrack(sharedPlaylist.id, trackData, interaction.user.id);

            if (addedTrack) {
                const totalTracks = Playlist.getTracks(sharedPlaylist.id).length;

                const embed = new EmbedBuilder()
                    .setColor(client.config.bot.color)
                    .setTitle('💖 Đã thêm vào danh sách yêu thích!')
                    .setDescription(
                        `**${track.info.title}**\n` +
                            `└ 🎤 ${track.info.author}\n\n` +
                            `✨ Cảm ơn **${interaction.user.displayName}** đã thêm bài hát này vào playlist chung!\n` +
                            `📋 Playlist: **${SHARED_PLAYLIST_NAME}**`
                    )
                    .setThumbnail(track.info.artworkUrl || null)
                    .setFooter({ text: `Tổng ${totalTracks} bài hát được yêu thích • Dùng /playlist view để xem` })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: false });
            } else {
                return sendErrorResponse(
                    interaction,
                    new Error('Không thể thêm bài hát vào danh sách yêu thích!'),
                    client.config,
                    true
                );
            }
        } catch (error) {
            if (error.code === 10062) return;
            logger.error('Error adding track to shared favorites playlist', { error: error.message });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleLikeTrack', { error: error.message, guildId: interaction.guildId });
        await sendErrorResponse(interaction, error, client.config, true);
    }
}

/**
 * Clears the history cache cleanup interval.
 * Call this on graceful shutdown to release the timer resource.
 * @param {import('discord.js').Client} client
 */
export function clearHistoryCacheCleanup(client) {
    if (client._historyCacheCleanupInterval) {
        clearInterval(client._historyCacheCleanupInterval);
        client._historyCacheCleanupInterval = null;
        logger.debug('History cache cleanup interval cleared');
    }
}
