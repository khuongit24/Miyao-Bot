/**
 * Playlist Command
 * Manage custom playlists
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Playlist from '../database/models/Playlist.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { 
    PlaylistNotFoundError,
    ValidationError,
    InternalError,
    UserNotInVoiceError,
    VoiceChannelPermissionError,
    DifferentVoiceChannelError,
    NoSearchResultsError
} from '../utils/errors.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Quản lý playlists')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Tạo playlist mới')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Mô tả playlist')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('public')
                        .setDescription('Công khai playlist?')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Xem tất cả playlists của bạn')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Xem chi tiết một playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Xóa một playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Thêm bài hát vào playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('URL hoặc từ khóa tìm kiếm')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Xóa bài hát khỏi playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('position')
                        .setDescription('Vị trí bài hát (1, 2, 3...)')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Phát toàn bộ playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await handleCreate(interaction, client);
                    break;
                case 'list':
                    await handleList(interaction, client);
                    break;
                case 'show':
                    await handleShow(interaction, client);
                    break;
                case 'delete':
                    await handleDelete(interaction, client);
                    break;
                case 'add':
                    await handleAdd(interaction, client);
                    break;
                case 'remove':
                    await handleRemove(interaction, client);
                    break;
                case 'play':
                    await handlePlay(interaction, client);
                    break;
                default:
                    throw new ValidationError('Subcommand không hợp lệ');
            }

            logger.command(`playlist-${subcommand}`, interaction.user.id, interaction.guildId);

        } catch (error) {
            logger.error('Playlist command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Create new playlist
 */
async function handleCreate(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const isPublic = interaction.options.getBoolean('public') || false;

    // Validate name
    if (name.length > 50) {
        throw new ValidationError('Tên playlist không được dài quá 50 ký tự', 'name');
    }

    // Check if playlist already exists
    const existing = Playlist.getByName(interaction.user.id, name);
    if (existing) {
        throw new ValidationError(`Playlist "${name}" đã tồn tại`, 'name');
    }

    // Create playlist
    const playlist = Playlist.create(interaction.user.id, name, [], {
        description,
        isPublic,
        username: interaction.user.username
    });

    if (!playlist) {
        logger.error('Playlist creation returned null', { 
            userId: interaction.user.id, 
            name,
            username: interaction.user.username 
        });
        throw new InternalError('Không thể tạo playlist. Vui lòng thử lại sau.');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Playlist Đã Tạo')
        .setDescription(`Playlist **${name}** đã được tạo thành công!`)
        .addFields([
            {
                name: '📋 Thông tin',
                value: `• **Mô tả:** ${description || 'Không có'}\n• **Công khai:** ${isPublic ? 'Có' : 'Không'}\n• **Số bài hát:** 0`,
                inline: false
            },
            {
                name: '💡 Tiếp theo',
                value: `Thêm bài hát với:\n\`/playlist add name:${name} query:<tên bài hát>\``,
                inline: false
            }
        ])
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * List all user's playlists
 */
async function handleList(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const playlists = Playlist.getUserPlaylists(interaction.user.id);

    if (playlists.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('📋 Playlists Của Bạn')
            .setDescription('Bạn chưa có playlist nào.\n\nTạo playlist mới với:\n`/playlist create name:<tên>`')
            .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
    }

    const description = playlists.map((pl, index) => {
        const trackCount = pl.tracks.length;
        const publicIcon = pl.isPublic ? '🌐' : '🔒';
        return `**${index + 1}. ${publicIcon} ${pl.name}**\n   └ ${trackCount} bài hát${pl.description ? `\n   └ *${pl.description}*` : ''}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Playlists Của Bạn')
        .setDescription(description)
        .setFooter({ text: `Tổng ${playlists.length} playlist${playlists.length > 1 ? 's' : ''}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Show playlist details
 */
async function handleShow(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const playlist = Playlist.getByName(interaction.user.id, name);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    let description = `**Mô tả:** ${playlist.description || 'Không có'}\n`;
    description += `**Công khai:** ${playlist.isPublic ? 'Có' : 'Không'}\n`;
    description += `**Số lần phát:** ${playlist.playCount}\n`;
    description += `**Tạo lúc:** ${new Date(playlist.createdAt).toLocaleString('vi-VN')}\n\n`;

    if (playlist.tracks.length === 0) {
        description += '*Playlist đang trống*';
    } else {
        description += `**Danh sách bài hát:**\n`;
        const tracks = playlist.tracks.slice(0, 10).map((track, index) => {
            const title = track.title.length > 50 ? track.title.substring(0, 47) + '...' : track.title;
            return `${index + 1}. ${title}`;
        }).join('\n');
        description += tracks;
        
        if (playlist.tracks.length > 10) {
            description += `\n\n...và ${playlist.tracks.length - 10} bài khác`;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`🎵 ${playlist.name}`)
        .setDescription(description)
        .setFooter({ text: `Playlist ID: ${playlist.id}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Delete playlist
 */
async function handleDelete(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const playlist = Playlist.getByName(interaction.user.id, name);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const success = Playlist.delete(playlist.id);

    if (!success) {
        throw new InternalError('Không thể xóa playlist');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Xóa Playlist')
        .setDescription(`Playlist **${name}** đã được xóa thành công!`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Add track to playlist
 */
async function handleAdd(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const query = interaction.options.getString('query');

    const playlist = Playlist.getByName(interaction.user.id, name);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    // Search for track
    const result = await client.musicManager.search(query, interaction.user);

    if (!result || !result.tracks || result.tracks.length === 0) {
        throw new NoSearchResultsError(query);
    }

    const track = result.tracks[0];

    // Convert to simple format for storage
    const simpleTrack = {
        title: track.info.title,
        author: track.info.author,
        uri: track.info.uri,
        length: track.info.length,
        identifier: track.info.identifier
    };

    const success = Playlist.addTrack(playlist.id, simpleTrack);

    if (!success) {
        throw new InternalError('Không thể thêm bài hát vào playlist');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Thêm Vào Playlist')
        .setDescription(`**${track.info.title}**\n└ Đã thêm vào playlist **${name}**`)
        .setFooter({ text: `Tổng ${playlist.tracks.length + 1} bài hát` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Remove track from playlist
 */
async function handleRemove(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const position = interaction.options.getInteger('position');

    const playlist = Playlist.getByName(interaction.user.id, name);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    if (position < 1 || position > playlist.tracks.length) {
        throw new ValidationError(`Vị trí không hợp lệ. Playlist có ${playlist.tracks.length} bài hát`, 'position');
    }

    const trackIndex = position - 1;
    const removedTrack = playlist.tracks[trackIndex];

    const success = Playlist.removeTrack(playlist.id, trackIndex);

    if (!success) {
        throw new InternalError('Không thể xóa bài hát khỏi playlist');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Xóa Khỏi Playlist')
        .setDescription(`**${removedTrack.title}**\n└ Đã xóa khỏi playlist **${name}**`)
        .setFooter({ text: `Còn ${playlist.tracks.length - 1} bài hát` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Play entire playlist
 */
async function handlePlay(interaction, client) {
    await interaction.deferReply();

    const name = interaction.options.getString('name');
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    // Check if user is in voice channel
    if (!voiceChannel) {
        throw new UserNotInVoiceError();
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has(['Connect', 'Speak'])) {
        throw new VoiceChannelPermissionError(voiceChannel.name);
    }

    const playlist = Playlist.getByName(interaction.user.id, name);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    if (playlist.tracks.length === 0) {
        throw new ValidationError('Playlist đang trống', 'tracks');
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

    // Check if bot is in different voice channel
    if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
        throw new DifferentVoiceChannelError();
    }

    // Resolve all tracks from URIs to get encoded data (PARALLEL PROCESSING)
    logger.info('Resolving playlist tracks (parallel)', { playlistId: playlist.id, trackCount: playlist.tracks.length });
    
    const resolvedTracks = [];
    let failedCount = 0;
    
    // Batch processing to avoid overwhelming Lavalink
    const BATCH_SIZE = 10; // Process 10 tracks concurrently
    
    for (let i = 0; i < playlist.tracks.length; i += BATCH_SIZE) {
        const batch = playlist.tracks.slice(i, i + BATCH_SIZE);
        
        // Resolve batch in parallel using Promise.allSettled
        const results = await Promise.allSettled(
            batch.map(simpleTrack => 
                client.musicManager.search(simpleTrack.uri, interaction.user)
                    .then(result => ({ success: true, result, track: simpleTrack }))
                    .catch(error => ({ success: false, error, track: simpleTrack }))
            )
        );
        
        // Process results
        for (const promise of results) {
            if (promise.status === 'fulfilled') {
                const { success, result, track } = promise.value;
                
                if (success && result?.tracks?.length > 0) {
                    resolvedTracks.push(result.tracks[0]);
                } else {
                    logger.warn('Failed to resolve track from playlist', { 
                        uri: track.uri, 
                        title: track.title 
                    });
                    failedCount++;
                }
            } else {
                logger.error('Error resolving playlist track', { 
                    error: promise.reason 
                });
                failedCount++;
            }
        }
        
        // Progress logging for large playlists
        if (playlist.tracks.length > BATCH_SIZE) {
            const processed = Math.min(i + BATCH_SIZE, playlist.tracks.length);
            logger.debug(`Resolved ${processed}/${playlist.tracks.length} tracks`);
        }
    }
    
    if (resolvedTracks.length === 0) {
        throw new ValidationError('Không thể tải bất kỳ bài hát nào từ playlist', 'tracks');
    }

    // Add requester to all resolved tracks
    resolvedTracks.forEach(track => {
        track.requester = interaction.user.id;
    });

    // Add all resolved tracks to queue
    queue.add(resolvedTracks);

    // Increment play count
    Playlist.incrementPlayCount(playlist.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Đang Phát Playlist')
        .setDescription(
            `**${playlist.name}**\n` +
            `└ Đã thêm ${resolvedTracks.length}/${playlist.tracks.length} bài hát vào hàng đợi` +
            (failedCount > 0 ? `\n⚠️ ${failedCount} bài không tải được` : '')
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Start playing if not already
    if (!queue.current) {
        await queue.play();
        
        // Send now playing with buttons after a short delay
        setTimeout(async () => {
            try {
                const { createNowPlayingEmbed } = await import('../../UI/embeds/MusicEmbeds.js');
                const { createNowPlayingButtons } = await import('../../UI/components/MusicControls.js');
                
                const nowPlayingMessage = await interaction.channel.send({
                    embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                    components: createNowPlayingButtons(queue, false)
                });
                
                // Store message for auto-updates
                queue.setNowPlayingMessage(nowPlayingMessage);
            } catch (error) {
                logger.error('Failed to send now playing message from playlist', error);
            }
        }, 1000);
    }
}
