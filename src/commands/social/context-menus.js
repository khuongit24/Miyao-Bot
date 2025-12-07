/**
 * Context Menu Commands for Miyao Bot v1.8.1
 * Allows users to add tracks to queue or playlists via right-click context menu
 */

import {
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { createTrackAddedEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import {
    UserNotInVoiceError,
    VoiceChannelPermissionError,
    DifferentVoiceChannelError,
    PlaylistNotFoundError,
    ValidationError
} from '../../utils/errors.js';
import { commandRateLimiter } from '../../utils/rate-limiter.js';
import Playlist from '../../database/models/Playlist.js';
import logger from '../../utils/logger.js';

/**
 * Extract track URLs from message content
 * Supports: YouTube, Spotify, SoundCloud, direct links
 */
function extractTrackURLs(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex) || [];

    // Filter for known music platform URLs
    const musicPlatforms = [
        'youtube.com',
        'youtu.be',
        'spotify.com',
        'soundcloud.com',
        'bandcamp.com',
        'twitch.tv',
        'deezer.com',
        'tidal.com',
        'music.apple.com'
    ];

    return urls.filter(url => musicPlatforms.some(platform => url.includes(platform)));
}

/**
 * Truncate string with ellipsis
 */
function truncate(str, maxLength) {
    if (!str) return 'Unknown';
    return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
}

/**
 * Context Menu: Add to Queue
 * Right-click on a message containing music links to add them to queue
 */
export const addToQueueContextMenu = {
    data: new ContextMenuCommandBuilder().setName('Thêm vào Queue').setType(ApplicationCommandType.Message),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check rate limit (prevent spam/abuse)
            const isAdmin = interaction.member?.permissions?.has('Administrator') || false;
            const rateLimitCheck = commandRateLimiter.check(interaction.user.id, isAdmin);

            if (!rateLimitCheck.allowed) {
                logger.warn(`Rate limit exceeded for context menu: ${interaction.user.id}`);
                return await interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `⏱️ ${rateLimitCheck.reason}\n\n` +
                                '**Thông tin:**\n' +
                                `• Còn lại: ${rateLimitCheck.remaining} lệnh\n` +
                                `• Reset sau: ${Math.ceil(rateLimitCheck.resetIn / 1000)} giây`,
                            client.config
                        )
                    ]
                });
            }

            // Get target message
            const message = interaction.targetMessage;

            // Extract URLs from message
            const urls = extractTrackURLs(message.content);

            if (urls.length === 0) {
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('❌ Không Tìm Thấy Link Nhạc')
                            .setDescription(
                                'Tin nhắn này không chứa link nhạc hợp lệ!\n\n' +
                                    '**Hỗ trợ:**\n' +
                                    '🔴 YouTube, YouTube Music\n' +
                                    '🟢 Spotify\n' +
                                    '🟠 SoundCloud\n' +
                                    '🟣 Deezer, Tidal\n' +
                                    '⚪ Bandcamp, Twitch'
                            )
                            .setFooter({ text: client.config.bot.footer })
                            .setTimestamp()
                    ]
                });
            }

            // Voice channel checks
            const member = interaction.member;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                throw new UserNotInVoiceError();
            }

            const permissions = voiceChannel.permissionsFor(interaction.client.user);
            if (!permissions.has(['Connect', 'Speak'])) {
                throw new VoiceChannelPermissionError(voiceChannel.name);
            }

            // Get or create queue
            let queue = client.musicManager.getQueue(interaction.guildId);

            if (!queue) {
                queue = await client.musicManager.createQueue(
                    interaction.guildId,
                    voiceChannel.id,
                    interaction.channel
                );
            }

            if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
                throw new DifferentVoiceChannelError();
            }

            // Process each URL
            const addedTracks = [];
            const failedUrls = [];

            for (const url of urls) {
                try {
                    const result = await client.musicManager.search(url, interaction.user);

                    if (result && result.tracks && result.tracks.length > 0) {
                        const track = result.tracks[0];
                        track.requester = interaction.user.id;
                        queue.add(track);
                        addedTracks.push(track);
                    } else {
                        failedUrls.push(url);
                    }
                } catch (error) {
                    logger.error(`Failed to process URL: ${url}`, error);
                    failedUrls.push(url);
                }
            }

            // Start playing if not already
            if (!queue.current && addedTracks.length > 0) {
                await queue.play();
            }

            // Track metrics
            if (client.metrics && addedTracks.length > 0) {
                client.metrics.trackMusic('context_menu_add', { count: addedTracks.length });
            }

            // Build response embed
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('✅ Đã Thêm Vào Queue')
                .setTimestamp();

            // Different description based on track count
            if (addedTracks.length === 1 && addedTracks[0].info) {
                const info = addedTracks[0].info;
                embed.setDescription(
                    `**🎵 ${truncate(info.title, 50)}**\n` +
                        `└ Tác giả: ${truncate(info.author, 30)}\n\n` +
                        `📍 Vị trí: #${queue.tracks.length}\n` +
                        `📊 Tổng queue: ${queue.tracks.length + (queue.current ? 1 : 0)} bài`
                );

                if (info.artworkUrl) {
                    embed.setThumbnail(info.artworkUrl);
                }
            } else {
                let trackList = addedTracks
                    .slice(0, 5)
                    .map((t, i) => `${i + 1}. ${truncate(t.info?.title || 'Unknown', 40)}`)
                    .join('\n');

                if (addedTracks.length > 5) {
                    trackList += `\n...và ${addedTracks.length - 5} bài khác`;
                }

                embed.setDescription(
                    `Đã thêm **${addedTracks.length}** bài hát vào hàng đợi!\n\n` +
                        (failedUrls.length > 0 ? `⚠️ Không thể thêm: ${failedUrls.length} link\n\n` : '') +
                        `**Danh sách:**\n${trackList}\n\n` +
                        `📍 Vị trí: #${queue.tracks.length - addedTracks.length + 1}` +
                        (addedTracks.length > 1 ? ` - #${queue.tracks.length}` : '')
                );
            }

            embed.setFooter({ text: `${client.config.bot.footer} • Từ tin nhắn của ${message.author.username}` });

            await interaction.editReply({ embeds: [embed] });

            logger.command('context-menu-add-to-queue', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Add to queue context menu error', error);
            await sendErrorResponse(interaction, error, client.config);
        }
    }
};

/**
 * Context Menu: Add to Playlist
 * Right-click on a message containing music links to add them to your playlist
 */
export const addToPlaylistContextMenu = {
    data: new ContextMenuCommandBuilder().setName('Thêm vào Playlist').setType(ApplicationCommandType.Message),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check rate limit
            const isAdmin = interaction.member?.permissions?.has('Administrator') || false;
            const rateLimitCheck = commandRateLimiter.check(interaction.user.id, isAdmin);

            if (!rateLimitCheck.allowed) {
                return await interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `⏱️ ${rateLimitCheck.reason}\n\nReset sau: ${Math.ceil(rateLimitCheck.resetIn / 1000)} giây`,
                            client.config
                        )
                    ]
                });
            }

            // Get target message
            const message = interaction.targetMessage;

            // Extract URLs from message
            const urls = extractTrackURLs(message.content);

            if (urls.length === 0) {
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('❌ Không Tìm Thấy Link Nhạc')
                            .setDescription(
                                'Tin nhắn này không chứa link nhạc hợp lệ!\n\n' +
                                    '**Hỗ trợ:**\n' +
                                    '🔴 YouTube, YouTube Music\n' +
                                    '🟢 Spotify\n' +
                                    '🟠 SoundCloud\n' +
                                    '🟣 Deezer, Tidal'
                            )
                            .setFooter({ text: client.config.bot.footer })
                            .setTimestamp()
                    ]
                });
            }

            // Get user's playlists
            const userPlaylists = Playlist.getByOwner(interaction.user.id, interaction.guildId);

            // If user has no playlists, show create option
            if (userPlaylists.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('📋 Chưa Có Playlist')
                    .setDescription(
                        'Bạn chưa có playlist nào!\n\n' +
                            '**Tạo playlist mới:**\n' +
                            '`/playlist create name:<tên>`\n\n' +
                            `**Đã phát hiện ${urls.length} link nhạc** trong tin nhắn này.`
                    )
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('playlist_create_modal')
                        .setLabel('Tạo Playlist Mới')
                        .setEmoji('📝')
                        .setStyle(ButtonStyle.Success)
                );

                return await interaction.editReply({ embeds: [embed], components: [row] });
            }

            // Resolve track info from URLs first
            const resolvedTracks = [];
            const failedUrls = [];

            for (const url of urls.slice(0, 10)) {
                // Limit to 10 tracks
                try {
                    const result = await client.musicManager.search(url, interaction.user);
                    if (result && result.tracks && result.tracks.length > 0) {
                        resolvedTracks.push({
                            url: result.tracks[0].info.uri,
                            title: result.tracks[0].info.title,
                            author: result.tracks[0].info.author,
                            duration: result.tracks[0].info.length
                        });
                    } else {
                        failedUrls.push(url);
                    }
                } catch (error) {
                    logger.error(`Failed to resolve URL for playlist: ${url}`, error);
                    failedUrls.push(url);
                }
            }

            if (resolvedTracks.length === 0) {
                return await interaction.editReply({
                    embeds: [
                        createErrorEmbed('Không thể tải thông tin từ các link nhạc trong tin nhắn này!', client.config)
                    ]
                });
            }

            // Store resolved tracks temporarily for the select menu handler
            const sessionId = `${interaction.user.id}_${Date.now()}`;
            client._contextMenuPlaylistSessions = client._contextMenuPlaylistSessions || new Map();
            client._contextMenuPlaylistSessions.set(sessionId, {
                tracks: resolvedTracks,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                messageAuthor: message.author.username,
                expiry: Date.now() + 300000 // 5 minutes
            });

            // Clean up old sessions
            for (const [key, value] of client._contextMenuPlaylistSessions.entries()) {
                if (value.expiry < Date.now()) {
                    client._contextMenuPlaylistSessions.delete(key);
                }
            }

            // Build playlist select menu
            const playlistOptions = userPlaylists.slice(0, 25).map(pl => ({
                label: truncate(pl.name, 50),
                description: `${pl.track_count || 0} bài hát${pl.description ? ' • ' + truncate(pl.description, 30) : ''}`,
                value: `${sessionId}_${pl.id}`,
                emoji: pl.is_public ? '🌐' : '🔒'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('context_menu_add_to_playlist')
                .setPlaceholder('📋 Chọn playlist...')
                .addOptions(playlistOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // Track list for display
            let trackDisplay = resolvedTracks
                .slice(0, 5)
                .map((t, i) => `${i + 1}. **${truncate(t.title, 40)}**\n   └ ${truncate(t.author, 25)}`)
                .join('\n');

            if (resolvedTracks.length > 5) {
                trackDisplay += `\n\n...và ${resolvedTracks.length - 5} bài khác`;
            }

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('📋 Thêm Vào Playlist')
                .setDescription(
                    `**Chọn playlist** để thêm ${resolvedTracks.length} bài hát:\n\n` +
                        trackDisplay +
                        (failedUrls.length > 0 ? `\n\n⚠️ ${failedUrls.length} link không thể tải` : '')
                )
                .addFields([
                    {
                        name: '💡 Hướng dẫn',
                        value: 'Chọn playlist từ menu bên dưới để thêm các bài hát này vào.',
                        inline: false
                    }
                ])
                .setFooter({ text: `${client.config.bot.footer} • Từ tin nhắn của ${message.author.username}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], components: [row] });

            logger.command('context-menu-add-to-playlist', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Add to playlist context menu error', error);
            await sendErrorResponse(interaction, error, client.config);
        }
    }
};

/**
 * Handle playlist selection from context menu
 * This should be called from your interaction handler
 */
export async function handleContextMenuPlaylistSelect(interaction, client) {
    try {
        await interaction.deferUpdate();

        const value = interaction.values[0];
        // Value format: userId_timestamp_playlistId
        // e.g., "123456789_1705234567890_42"
        const parts = value.split('_');
        const playlistId = parseInt(parts.pop()); // Last part is playlist ID
        const sessionKey = parts.join('_'); // Rest is session key

        // Get session data
        const sessions = client._contextMenuPlaylistSessions;
        if (!sessions) {
            return await interaction.followUp({
                embeds: [createErrorEmbed('Phiên làm việc đã hết hạn. Vui lòng thử lại!', client.config)],
                ephemeral: true
            });
        }

        // Find the matching session
        const sessionData = sessions.get(sessionKey);

        if (!sessionData || sessionData.expiry < Date.now()) {
            sessions.delete(sessionKey);
            return await interaction.followUp({
                embeds: [createErrorEmbed('Phiên làm việc đã hết hạn. Vui lòng thử lại!', client.config)],
                ephemeral: true
            });
        }

        // Verify user
        if (sessionData.userId !== interaction.user.id) {
            return await interaction.followUp({
                embeds: [createErrorEmbed('Bạn không có quyền thực hiện thao tác này!', client.config)],
                ephemeral: true
            });
        }

        // Get playlist
        const playlist = Playlist.getById(playlistId);
        if (!playlist) {
            throw new PlaylistNotFoundError(`ID: ${playlistId}`);
        }

        // Verify ownership
        if (playlist.owner_id !== interaction.user.id) {
            throw new ValidationError('Bạn không phải chủ sở hữu playlist này!', 'playlist');
        }

        // Add tracks to playlist
        let addedCount = 0;
        let skippedCount = 0;

        for (const track of sessionData.tracks) {
            try {
                const added = Playlist.addTrack(playlistId, track, interaction.user.id);
                if (added) {
                    addedCount++;
                } else {
                    skippedCount++;
                }
            } catch (error) {
                logger.error('Failed to add track to playlist from context menu', {
                    error: error.message,
                    track: track.title,
                    playlistId
                });
                skippedCount++;
            }
        }

        // Clean up session
        sessions.delete(sessionKey);

        // Get updated track count
        const finalTracks = Playlist.getTracks(playlistId);

        // Build success embed
        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('✅ Đã Thêm Vào Playlist')
            .setDescription(
                `**${playlist.name}**\n\n` +
                    `✨ Đã thêm: **${addedCount}** bài hát\n` +
                    (skippedCount > 0 ? `⚠️ Bỏ qua: ${skippedCount} bài (đã tồn tại/lỗi)\n` : '') +
                    `📊 Tổng playlist: **${finalTracks.length}** bài hát`
            )
            .addFields([
                {
                    name: '🎵 Bài hát đã thêm',
                    value:
                        sessionData.tracks
                            .slice(0, 5)
                            .map((t, i) => `${i + 1}. ${truncate(t.title, 45)}`)
                            .join('\n') +
                        (sessionData.tracks.length > 5 ? `\n...và ${sessionData.tracks.length - 5} bài khác` : ''),
                    inline: false
                }
            ])
            .setFooter({ text: `${client.config.bot.footer} • Từ tin nhắn của ${sessionData.messageAuthor}` })
            .setTimestamp();

        // Add action buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_play_${playlistId}`)
                .setLabel('Phát Playlist')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`playlist_view_${playlistId}`)
                .setLabel('Xem Playlist')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });

        // Track metrics
        if (client.metrics) {
            client.metrics.trackMusic('context_menu_add_to_playlist', { count: addedCount });
        }

        logger.info('Context menu playlist add completed', {
            userId: interaction.user.id,
            playlistId,
            addedCount,
            skippedCount
        });
    } catch (error) {
        logger.error('Handle context menu playlist select error', error);
        await interaction.followUp({
            embeds: [createErrorEmbed(error.message || 'Có lỗi xảy ra!', client.config)],
            ephemeral: true
        });
    }
}

export default {
    addToQueueContextMenu,
    addToPlaylistContextMenu,
    handleContextMenuPlaylistSelect
};
