/**
 * Playlist Command
 * Manage custom playlists
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Playlist from '../../database/models/Playlist.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { 
    PlaylistNotFoundError,
    ValidationError,
    InternalError,
    UserNotInVoiceError,
    VoiceChannelPermissionError,
    DifferentVoiceChannelError,
    NoSearchResultsError
} from '../../utils/errors.js';
import logger from '../../utils/logger.js';

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
                        .setAutocomplete(true)
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
                        .setAutocomplete(true)
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
                        .setAutocomplete(true)
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
                        .setAutocomplete(true)
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
                .setName('save')
                .setDescription('Lưu bài hát đang phát hoặc hàng đợi vào playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('source')
                        .setDescription('Nguồn lưu')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Bài đang phát', value: 'current' },
                            { name: 'Toàn bộ hàng đợi', value: 'queue' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Phát toàn bộ playlist')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tên playlist')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('menu')
                .setDescription('Hiển thị menu quản lý playlist')
        ),

    async execute(interaction, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'menu':
                    await handleMenu(interaction, client);
                    break;
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
                case 'save':
                    await handleSave(interaction, client);
                    break;
                case 'play':
                    await handlePlay(interaction, client);
                    break;
                default:
                    // Default to menu if subcommand not recognized
                    await handleMenu(interaction, client);
                    break;
            }

            logger.command(`playlist-${subcommand}`, interaction.user.id, interaction.guildId);

        } catch (error) {
            logger.error('Playlist command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Display playlist management menu
 */
async function handleMenu(interaction, client) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    
    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🎵 Quản Lý Playlist')
        .setDescription(
            '**Chào mừng đến với hệ thống quản lý playlist!**\n\n' +
            '📝 **Tạo playlist:** Tạo playlist mới với tên và mô tả\n' +
            '🔍 **Tìm kiếm:** Xem chi tiết playlist của bạn\n' +
            '➕ **Thêm nhạc:** Thêm bài hát vào playlist có sẵn\n' +
            '🗑️ **Xóa playlist:** Xóa playlist không còn dùng\n\n' +
            '💡 *Chọn một nút bên dưới để bắt đầu!*'
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('playlist_create_modal')
                .setLabel('Thêm Playlist')
                .setEmoji('📝')
                .setStyle(ButtonStyle.Success),
            
            new ButtonBuilder()
                .setCustomId('playlist_search_modal')
                .setLabel('Tìm Kiếm')
                .setEmoji('🔍')
                .setStyle(ButtonStyle.Primary),
            
            new ButtonBuilder()
                .setCustomId('playlist_add_track_modal')
                .setLabel('Thêm Nhạc')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Primary),
            
            new ButtonBuilder()
                .setCustomId('playlist_delete_modal')
                .setLabel('Xóa Playlist')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
        );
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

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
    const existing = Playlist.getByName(name, interaction.user.id, interaction.guildId);
    if (existing) {
        throw new ValidationError(`Playlist "${name}" đã tồn tại`, 'name');
    }

    // Create playlist
    const playlist = Playlist.create(
        name, 
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        description,
        isPublic
    );

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

    const playlists = Playlist.getByOwner(interaction.user.id, interaction.guildId);

    if (playlists.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('📋 Playlists Của Bạn')
            .setDescription('Bạn chưa có playlist nào.\n\nTạo playlist mới với:\n`/playlist create name:<tên>`')
            .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
    }

    const description = playlists.map((pl, index) => {
        const trackCount = pl.track_count || 0;
        const publicIcon = pl.is_public ? '🌐' : '🔒';
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
    
    // Use findByNameInGuild to support both user's own and public playlists
    const playlist = Playlist.findByNameInGuild(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const tracks = Playlist.getTracks(playlist.id);
    const isOwn = playlist.owner_id === interaction.user.id;

    let description = `**Chủ sở hữu:** ${isOwn ? 'Bạn' : `<@${playlist.owner_id}>`}\n`;
    description += `**Mô tả:** ${playlist.description || 'Không có'}\n`;
    description += `**Công khai:** ${playlist.is_public ? 'Có' : 'Không'}\n`;
    description += `**Tạo lúc:** ${new Date(playlist.created_at).toLocaleString('vi-VN')}\n\n`;

    if (tracks.length === 0) {
        description += '*Playlist đang trống*';
    } else {
        description += `**Danh sách bài hát:**\n`;
        const trackList = tracks.slice(0, 10).map((track, index) => {
            const title = track.track_title.length > 50 ? track.track_title.substring(0, 47) + '...' : track.track_title;
            return `${index + 1}. ${title}`;
        }).join('\n');
        description += trackList;
        
        if (tracks.length > 10) {
            description += `\n\n...và ${tracks.length - 10} bài khác`;
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
    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const success = Playlist.delete(playlist.id, interaction.user.id);

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

    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);

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
        url: track.info.uri,
        title: track.info.title,
        author: track.info.author,
        duration: track.info.length
    };

    const addedTrack = Playlist.addTrack(playlist.id, simpleTrack, interaction.user.id);

    if (!addedTrack) {
        throw new InternalError('Không thể thêm bài hát vào playlist');
    }

    const tracks = Playlist.getTracks(playlist.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Thêm Vào Playlist')
        .setDescription(`**${track.info.title}**\n└ Đã thêm vào playlist **${name}**`)
        .setFooter({ text: `Tổng ${tracks.length} bài hát` })
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

    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const tracks = Playlist.getTracks(playlist.id);

    if (position < 1 || position > tracks.length) {
        throw new ValidationError(`Vị trí không hợp lệ. Playlist có ${tracks.length} bài hát`, 'position');
    }

    // Find track by position
    const trackToRemove = tracks.find(t => t.position === position);
    
    if (!trackToRemove) {
        throw new ValidationError('Không tìm thấy bài hát ở vị trí này', 'position');
    }

    const success = Playlist.removeTrack(playlist.id, trackToRemove.id, interaction.user.id);

    if (!success) {
        throw new InternalError('Không thể xóa bài hát khỏi playlist');
    }

    const remainingTracks = Playlist.getTracks(playlist.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Xóa Khỏi Playlist')
        .setDescription(`**${trackToRemove.track_title}**\n└ Đã xóa khỏi playlist **${name}**`)
        .setFooter({ text: `Còn ${remainingTracks.length} bài hát` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Save current track or queue to playlist
 */
async function handleSave(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const source = interaction.options.getString('source') || 'current';

    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue || (!queue.current && queue.tracks.length === 0)) {
        throw new ValidationError('Không có nhạc nào đang phát', 'queue');
    }

    let tracksToSave = [];
    let savedCount = 0;
    let skippedCount = 0;

    if (source === 'current') {
        // Save only current track
        if (!queue.current) {
            throw new ValidationError('Không có bài nào đang phát', 'current');
        }
        tracksToSave = [queue.current];
    } else {
        // Save all tracks in queue including current
        tracksToSave = queue.current ? [queue.current, ...queue.tracks] : queue.tracks;
    }

    if (tracksToSave.length === 0) {
        throw new ValidationError('Không có bài hát nào để lưu', 'tracks');
    }

    // Add each track to playlist
    for (const track of tracksToSave) {
        try {
            const simpleTrack = {
                url: track.info.uri,
                title: track.info.title,
                author: track.info.author,
                duration: track.info.length
            };

            const added = Playlist.addTrack(playlist.id, simpleTrack, interaction.user.id);
            
            if (added) {
                savedCount++;
            } else {
                skippedCount++;
            }
        } catch (error) {
            logger.error('Failed to add track to playlist', { 
                error: error.message, 
                track: track.info?.title 
            });
            skippedCount++;
        }
    }

    const finalTracks = Playlist.getTracks(playlist.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Lưu Vào Playlist')
        .setDescription(
            `**${playlist.name}**\n` +
            `└ Đã lưu ${savedCount}/${tracksToSave.length} bài hát` +
            (skippedCount > 0 ? `\n⚠️ ${skippedCount} bài đã tồn tại hoặc lỗi` : '')
        )
        .setFooter({ text: `Tổng ${finalTracks.length} bài hát trong playlist` })
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

    // Use findByNameInGuild to support both user's own and public playlists
    const playlist = Playlist.findByNameInGuild(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const playlistTracks = Playlist.getTracks(playlist.id);

    if (playlistTracks.length === 0) {
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
    logger.info('Resolving playlist tracks (parallel)', { playlistId: playlist.id, trackCount: playlistTracks.length });
    
    const resolvedTracks = [];
    let failedCount = 0;
    
    // Batch processing to avoid overwhelming Lavalink
    const BATCH_SIZE = 10; // Process 10 tracks concurrently
    
    for (let i = 0; i < playlistTracks.length; i += BATCH_SIZE) {
        const batch = playlistTracks.slice(i, i + BATCH_SIZE);
        
        // Resolve batch in parallel using Promise.allSettled
        const results = await Promise.allSettled(
            batch.map(simpleTrack => 
                client.musicManager.search(simpleTrack.track_url, interaction.user)
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
                        uri: track.track_url, 
                        title: track.track_title 
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
        if (playlistTracks.length > BATCH_SIZE) {
            const processed = Math.min(i + BATCH_SIZE, playlistTracks.length);
            logger.debug(`Resolved ${processed}/${playlistTracks.length} tracks`);
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

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Đang Phát Playlist')
        .setDescription(
            `**${playlist.name}**\n` +
            `└ Đã thêm ${resolvedTracks.length}/${playlistTracks.length} bài hát vào hàng đợi` +
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
