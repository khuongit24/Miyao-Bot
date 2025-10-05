/**
 * Context Menu Commands for Miyao Bot
 * Allows users to add tracks to queue or playlists via right-click context menu
 */

import { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } from 'discord.js';
import { createTrackAddedEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { 
    UserNotInVoiceError, 
    VoiceChannelPermissionError, 
    DifferentVoiceChannelError 
} from '../utils/errors.js';
import { commandRateLimiter } from '../utils/rate-limiter.js';
import logger from '../utils/logger.js';

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
        'twitch.tv'
    ];
    
    return urls.filter(url => 
        musicPlatforms.some(platform => url.includes(platform))
    );
}

/**
 * Context Menu: Add to Queue
 */
export const addToQueueContextMenu = {
    data: new ContextMenuCommandBuilder()
        .setName('Thêm vào Queue')
        .setType(ApplicationCommandType.Message),
    
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Check rate limit (prevent spam/abuse)
            const isAdmin = interaction.member?.permissions?.has('Administrator') || false;
            const rateLimitCheck = commandRateLimiter.check(interaction.user.id, isAdmin);
            
            if (!rateLimitCheck.allowed) {
                logger.warn(`Rate limit exceeded for context menu: ${interaction.user.id}`);
                return await interaction.editReply({
                    embeds: [createErrorEmbed(
                        `⏱️ ${rateLimitCheck.reason}\n\n` +
                        `**Thông tin:**\n` +
                        `• Còn lại: ${rateLimitCheck.remaining} lệnh\n` +
                        `• Reset sau: ${Math.ceil(rateLimitCheck.resetIn / 1000)} giây`,
                        client.config
                    )]
                });
            }
            
            // Get target message
            const message = interaction.targetMessage;
            
            // Extract URLs from message
            const urls = extractTrackURLs(message.content);
            
            if (urls.length === 0) {
                return await interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Tin nhắn này không chứa link nhạc hợp lệ!\n\n' +
                        'Hỗ trợ: YouTube, Spotify, SoundCloud, Bandcamp',
                        client.config
                    )]
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
            
            // Send response
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('✅ Đã thêm vào Queue')
                .setDescription(
                    `Đã thêm **${addedTracks.length}** bài hát vào hàng đợi từ tin nhắn!\n\n` +
                    (failedUrls.length > 0 ? `❌ Không thể thêm: ${failedUrls.length} link\n\n` : '') +
                    `📍 Vị trí: #${queue.tracks.length - addedTracks.length + 1}` +
                    (addedTracks.length > 1 ? ` - #${queue.tracks.length}` : '')
                )
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();
            
            // Add first track info if only one
            if (addedTracks.length === 1 && addedTracks[0].info) {
                const info = addedTracks[0].info;
                embed.addFields([
                    {
                        name: '🎵 Bài hát',
                        value: `[${info.title || 'Unknown'}](${info.uri || '#'})`,
                        inline: false
                    }
                ]);
                
                if (info.artworkUrl) {
                    embed.setThumbnail(info.artworkUrl);
                }
            }
            
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
 * TODO: Implement playlist selection dialog
 */
export const addToPlaylistContextMenu = {
    data: new ContextMenuCommandBuilder()
        .setName('Thêm vào Playlist')
        .setType(ApplicationCommandType.Message),
    
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get target message
            const message = interaction.targetMessage;
            
            // Extract URLs
            const urls = extractTrackURLs(message.content);
            
            if (urls.length === 0) {
                return await interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Tin nhắn này không chứa link nhạc hợp lệ!',
                        client.config
                    )]
                });
            }
            
            // TODO: Show playlist selection dialog
            // For now, show "coming soon" message
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🚧 Tính năng đang phát triển')
                .setDescription(
                    `Tính năng thêm vào playlist từ context menu sẽ sớm ra mắt!\n\n` +
                    `Hiện tại bạn có thể sử dụng lệnh \`/playlist add\` để thêm bài hát vào playlist.\n\n` +
                    `**Đã phát hiện ${urls.length} link nhạc** trong tin nhắn này.`
                )
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
            logger.command('context-menu-add-to-playlist', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Add to playlist context menu error', error);
            await sendErrorResponse(interaction, error, client.config);
        }
    }
};

export default {
    addToQueueContextMenu,
    addToPlaylistContextMenu
};
