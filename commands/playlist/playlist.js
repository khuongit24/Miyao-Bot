/**
 * Playlist Command
 * Manage custom playlists
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Playlist from '../../database/models/Playlist.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { COLORS } from '../../config/design-system.js';
import {
    PlaylistNotFoundError,
    ValidationError,
    InternalError,
    UserNotInVoiceError,
    VoiceChannelPermissionError,
    DifferentVoiceChannelError,
    NoSearchResultsError
} from '../../utils/errors.js';
import { PLAYLIST_RESOLUTION } from '../../utils/constants.js';
import { handlePlaylistAutocomplete } from '../../events/playlists/index.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Quản lý playlists')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Tạo playlist mới')
                .addStringOption(option => option.setName('name').setDescription('Tên playlist').setRequired(true))
                .addStringOption(option =>
                    option.setName('description').setDescription('Mô tả playlist').setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('public').setDescription('Công khai playlist?').setRequired(false)
                )
        )
        .addSubcommand(subcommand => subcommand.setName('list').setDescription('Xem tất cả playlists của bạn'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Xem chi tiết một playlist')
                .addStringOption(option =>
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Xóa một playlist')
                .addStringOption(option =>
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Thêm bài hát vào playlist')
                .addStringOption(option =>
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('query').setDescription('URL hoặc từ khóa tìm kiếm').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Xóa bài hát khỏi playlist')
                .addStringOption(option =>
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('position')
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
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('source')
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
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
        )
        .addSubcommand(subcommand => subcommand.setName('menu').setDescription('Hiển thị menu quản lý playlist'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shuffle')
                .setDescription('Xáo trộn thứ tự bài hát trong playlist')
                .addStringOption(option =>
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clone')
                .setDescription('Tạo bản sao của playlist')
                .addStringOption(option =>
                    option.setName('source').setDescription('Tên playlist gốc').setAutocomplete(true).setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('newname').setDescription('Tên playlist mới').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Xóa tất cả bài hát khỏi playlist')
                .addStringOption(option =>
                    option.setName('name').setDescription('Tên playlist').setAutocomplete(true).setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('public').setDescription('Xem các playlist công khai trong server')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('import')
                .setDescription('Import playlist từ YouTube/Spotify URL')
                .addStringOption(option =>
                    option.setName('url').setDescription('URL của playlist YouTube/Spotify').setRequired(true)
                )
                .addStringOption(option => option.setName('name').setDescription('Tên playlist mới').setRequired(true))
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
                case 'shuffle':
                    await handleShuffle(interaction, client);
                    break;
                case 'clone':
                    await handleClone(interaction, client);
                    break;
                case 'clear':
                    await handleClear(interaction, client);
                    break;
                case 'public':
                    await handlePublicList(interaction, client);
                    break;
                case 'import':
                    await handleImport(interaction, client);
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
    },

    async autocomplete(interaction) {
        await handlePlaylistAutocomplete(interaction);
    }
};

/**
 * Display playlist management menu
 */
async function handleMenu(interaction, client) {
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

    const row = new ActionRowBuilder().addComponents(
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
        .setFooter({ text: client.config.bot.footer })
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
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    const description = playlists
        .map((pl, index) => {
            const trackCount = pl.track_count || 0;
            const publicIcon = pl.is_public ? '🌐' : '🔒';
            return `**${index + 1}. ${publicIcon} ${pl.name}**\n   └ ${trackCount} bài hát${pl.description ? `\n   └ *${pl.description}*` : ''}`;
        })
        .join('\n\n');

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
        description += '**Danh sách bài hát:**\n';
        const trackList = tracks
            .slice(0, 10)
            .map((track, index) => {
                const title =
                    track.track_title.length > 50 ? track.track_title.substring(0, 47) + '...' : track.track_title;
                return `${index + 1}. ${title}`;
            })
            .join('\n');
        description += trackList;

        if (tracks.length > 10) {
            description += `\n\n...và ${tracks.length - 10} bài khác`;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`🎵 ${playlist.name}`)
        .setDescription(description)
        .setFooter({ text: `Playlist ID: ${playlist.id} • ${client.config.bot.footer}` })
        .setTimestamp();

    // Build action buttons
    const components = [];

    // Row 1: Play and Edit actions
    const row1 = new ActionRowBuilder();

    // Play button (always available if playlist has tracks)
    if (tracks.length > 0) {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_play_${playlist.id}`)
                .setLabel('Phát Playlist')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Success)
        );
    }

    // Only show edit buttons if user owns the playlist
    if (isOwn) {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_add_track_to_${playlist.id}`)
                .setLabel('Thêm Nhạc')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`playlist_remove_track_${playlist.id}`)
                .setLabel('Xóa Nhạc')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(tracks.length === 0)
        );
    }

    if (row1.components.length > 0) {
        components.push(row1);
    }

    // Row 2: Additional actions (only for owner)
    if (isOwn) {
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_edit_${playlist.id}`)
                .setLabel('Sửa Playlist')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`playlist_shuffle_${playlist.id}`)
                .setLabel('Xáo Trộn')
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(tracks.length < 2),
            new ButtonBuilder()
                .setCustomId(`playlist_clone_${playlist.id}`)
                .setLabel('Nhân Bản')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary)
        );
        components.push(row2);
    } else {
        // Non-owner can clone public playlists
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`playlist_clone_${playlist.id}`)
                .setLabel('Lưu Bản Sao')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary)
        );
        components.push(row2);
    }

    await interaction.editReply({ embeds: [embed], components });
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
        .setFooter({ text: client.config.bot.footer })
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
 * Play entire playlist with improved parallel resolution
 * Features:
 * - Pipeline approach with configurable concurrency
 * - Staggered delay between batches to avoid overwhelming Lavalink
 * - Progress indicator for large playlists
 * - Graceful partial failure handling
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

    let playlistTracks = Playlist.getTracks(playlist.id);

    if (playlistTracks.length === 0) {
        throw new ValidationError('Playlist đang trống', 'tracks');
    }

    // Enforce maximum track count to prevent queue overflow
    const MAX_PLAYLIST_LOAD = 500;
    let wasTruncated = false;
    if (playlistTracks.length > MAX_PLAYLIST_LOAD) {
        wasTruncated = true;
        playlistTracks = playlistTracks.slice(0, MAX_PLAYLIST_LOAD);
        logger.warn('Playlist truncated to max load limit', {
            playlistId: playlist.id,
            originalCount: Playlist.getTracks(playlist.id).length,
            loadedCount: MAX_PLAYLIST_LOAD
        });
    }

    // Get or create queue
    let queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue) {
        queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
    }

    // Check if bot is in different voice channel
    if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
        throw new DifferentVoiceChannelError();
    }

    // Configuration from constants
    const CONCURRENCY = PLAYLIST_RESOLUTION.CONCURRENCY;
    const STAGGER_DELAY = PLAYLIST_RESOLUTION.STAGGER_DELAY;
    const PROGRESS_UPDATE_INTERVAL = PLAYLIST_RESOLUTION.PROGRESS_UPDATE_INTERVAL;
    const TRACK_TIMEOUT = PLAYLIST_RESOLUTION.TRACK_RESOLUTION_TIMEOUT;

    // Show initial loading message for large playlists
    const totalTracks = playlistTracks.length;
    const isLargePlaylist = totalTracks > 20;

    if (isLargePlaylist) {
        const loadingEmbed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('📋 Đang tải playlist...')
            .setDescription(`**${playlist.name}**\n\n⏳ Đang tải: 0/${totalTracks} bài hát...`)
            .setFooter({ text: 'Vui lòng đợi trong giây lát' })
            .setTimestamp();

        await interaction.editReply({ embeds: [loadingEmbed] });
    }

    logger.info('Resolving playlist tracks (parallel pipeline)', {
        playlistId: playlist.id,
        trackCount: totalTracks,
        concurrency: CONCURRENCY,
        staggerDelay: STAGGER_DELAY
    });

    const resolvedTracks = [];
    let failedCount = 0;
    let processedCount = 0;
    let lastProgressUpdate = 0;

    /**
     * Resolve a single track with timeout
     * @param {Object} simpleTrack - Track from playlist database
     * @returns {Promise<{success: boolean, track?: Object, error?: string}>}
     */
    async function resolveTrackWithTimeout(simpleTrack) {
        try {
            const result = await Promise.race([
                client.musicManager.search(simpleTrack.track_url, interaction.user),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Track resolution timeout')), TRACK_TIMEOUT)
                )
            ]);

            if (result?.tracks?.length > 0) {
                return { success: true, track: result.tracks[0] };
            }
            return { success: false, error: 'No results found' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Process a batch of tracks with staggered starts
     * @param {Array} batch - Array of tracks to process
     * @param {number} batchIndex - Index of this batch
     * @returns {Promise<void>}
     */
    async function processBatchWithStagger(batch, batchIndex) {
        // Stagger the batch start
        if (batchIndex > 0) {
            await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY));
        }

        // Process all tracks in batch concurrently
        const results = await Promise.allSettled(batch.map(track => resolveTrackWithTimeout(track)));

        // Collect results
        for (let i = 0; i < results.length; i++) {
            processedCount++;
            const promise = results[i];
            const simpleTrack = batch[i];

            if (promise.status === 'fulfilled' && promise.value.success) {
                resolvedTracks.push(promise.value.track);
            } else {
                failedCount++;
                const errorMsg =
                    promise.status === 'fulfilled' ? promise.value.error : promise.reason?.message || 'Unknown error';

                logger.warn('Failed to resolve playlist track', {
                    uri: simpleTrack.track_url,
                    title: simpleTrack.track_title,
                    error: errorMsg
                });
            }
        }
    }

    // Pipeline processing: Process batches sequentially, but tracks within batch are parallel
    const batches = [];
    for (let i = 0; i < totalTracks; i += CONCURRENCY) {
        batches.push(playlistTracks.slice(i, i + CONCURRENCY));
    }

    // Process batches with progress updates
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        await processBatchWithStagger(batches[batchIndex], batchIndex);

        // Update progress for large playlists
        if (isLargePlaylist && processedCount - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
            lastProgressUpdate = processedCount;

            try {
                const progressPercent = Math.round((processedCount / totalTracks) * 100);
                const progressBar = createProgressBar(progressPercent, 20);

                const progressEmbed = new EmbedBuilder()
                    .setColor(client.config.bot.color)
                    .setTitle('📋 Đang tải playlist...')
                    .setDescription(
                        `**${playlist.name}**\n\n` +
                            `${progressBar} ${progressPercent}%\n\n` +
                            `✅ Đã tải: ${resolvedTracks.length} bài\n` +
                            `❌ Lỗi: ${failedCount} bài\n` +
                            `⏳ Còn lại: ${totalTracks - processedCount} bài`
                    )
                    .setFooter({ text: 'Đang xử lý...' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [progressEmbed] });
            } catch (error) {
                // Ignore progress update errors
                logger.debug('Failed to update progress', { error: error.message });
            }
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

    // Final result embed
    const successRate = Math.round((resolvedTracks.length / totalTracks) * 100);
    const embed = new EmbedBuilder()
        .setColor(failedCount > 0 || wasTruncated ? COLORS.WARNING : client.config.bot.color)
        .setTitle('📋 Đã Tải Playlist')
        .setDescription(
            `**${playlist.name}**\n\n` +
                `✅ Đã thêm **${resolvedTracks.length}**/${totalTracks} bài hát vào hàng đợi\n` +
                (failedCount > 0 ? `⚠️ **${failedCount}** bài không tải được\n` : '') +
                (wasTruncated
                    ? `⚠️ Playlist đã bị giới hạn ở **${MAX_PLAYLIST_LOAD}** bài (tổng cộng: ${Playlist.getTracks(playlist.id).length})\n`
                    : '') +
                `📊 Tỷ lệ thành công: ${successRate}%`
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Start playing if not already
    if (!queue.current) {
        try {
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
        } catch (playError) {
            logger.error('Failed to start playback from playlist', {
                error: playError.message,
                guildId: interaction.guildId
            });
            // Still keep the embed since tracks were added, just notify user
            try {
                await interaction.followUp({
                    content: '⚠️ Đã thêm bài hát vào hàng đợi nhưng không thể bắt đầu phát ngay. Thử `/play` để phát.',
                    ephemeral: true
                });
            } catch (followUpError) {
                // Ignore followUp errors
            }
        }
    }
}

/**
 * Shuffle playlist tracks
 */
async function handleShuffle(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const tracks = Playlist.getTracks(playlist.id);

    if (tracks.length < 2) {
        throw new ValidationError('Playlist cần ít nhất 2 bài hát để xáo trộn!', 'tracks');
    }

    // Shuffle the tracks using Fisher-Yates algorithm
    const shuffledPositions = [...Array(tracks.length).keys()].map(i => i + 1);
    for (let i = shuffledPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPositions[i], shuffledPositions[j]] = [shuffledPositions[j], shuffledPositions[i]];
    }

    // Update positions in database
    const { getDatabaseManager } = await import('../../database/DatabaseManager.js');
    const db = getDatabaseManager();

    try {
        db.transaction(() => {
            // Temporarily set all positions to negative to avoid conflicts
            for (let i = 0; i < tracks.length; i++) {
                db.db.prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?').run(-(i + 1), tracks[i].id);
            }

            // Set new shuffled positions
            for (let i = 0; i < tracks.length; i++) {
                db.db
                    .prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?')
                    .run(shuffledPositions[i], tracks[i].id);
            }
        });
    } catch (error) {
        throw new InternalError('Không thể xáo trộn playlist!');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🔀 Đã Xáo Trộn Playlist')
        .setDescription(
            `Playlist **${name}** đã được xáo trộn thành công!\n\n🎵 **${tracks.length}** bài hát đã được sắp xếp lại ngẫu nhiên.`
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Clone a playlist
 */
async function handleClone(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const sourceName = interaction.options.getString('source');
    const newName = interaction.options.getString('newname');

    // Find source playlist (own or public)
    const sourcePlaylist = Playlist.findByNameInGuild(sourceName, interaction.user.id, interaction.guildId);

    if (!sourcePlaylist) {
        throw new PlaylistNotFoundError(sourceName);
    }

    // Check if user can access source playlist
    if (sourcePlaylist.owner_id !== interaction.user.id && !sourcePlaylist.is_public) {
        throw new ValidationError('Bạn không có quyền sao chép playlist này!', 'permission');
    }

    // Check if new name conflicts with existing playlist
    const existing = Playlist.getByName(newName, interaction.user.id, interaction.guildId);
    if (existing) {
        throw new ValidationError(`Playlist "${newName}" đã tồn tại`, 'name');
    }

    // Create new playlist
    const newPlaylist = Playlist.create(
        newName,
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        `Bản sao từ: ${sourcePlaylist.name}`,
        false
    );

    if (!newPlaylist) {
        throw new InternalError('Không thể tạo playlist mới!');
    }

    // Copy all tracks from source to new playlist
    const sourceTracks = Playlist.getTracks(sourcePlaylist.id);
    let copiedCount = 0;

    for (const track of sourceTracks) {
        try {
            const trackData = {
                url: track.track_url,
                title: track.track_title,
                author: track.track_author,
                duration: track.track_duration
            };

            const added = Playlist.addTrack(newPlaylist.id, trackData, interaction.user.id);
            if (added) copiedCount++;
        } catch (error) {
            logger.warn('Failed to copy track to cloned playlist', { error: error.message });
        }
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Đã Nhân Bản Playlist')
        .setDescription(
            `Playlist **${newName}** đã được tạo từ **${sourcePlaylist.name}**!\n\n` +
                `✅ Đã sao chép **${copiedCount}**/${sourceTracks.length} bài hát`
        )
        .addFields([
            {
                name: '💡 Gợi ý',
                value: 'Sử dụng `/playlist show` để xem playlist mới của bạn!',
                inline: false
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Clear all tracks from a playlist
 */
async function handleClear(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('name');
    const playlist = Playlist.getByName(name, interaction.user.id, interaction.guildId);

    if (!playlist) {
        throw new PlaylistNotFoundError(name);
    }

    const trackCount = Playlist.getTracks(playlist.id).length;

    if (trackCount === 0) {
        throw new ValidationError('Playlist đã trống!', 'tracks');
    }

    const success = Playlist.clearTracks(playlist.id, interaction.user.id);

    if (!success) {
        throw new InternalError('Không thể xóa các bài hát khỏi playlist!');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🗑️ Đã Xóa Tất Cả Bài Hát')
        .setDescription(`Đã xóa **${trackCount}** bài hát khỏi playlist **${name}**.\n\nPlaylist hiện đang trống.`)
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * List public playlists in the server
 */
async function handlePublicList(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const publicPlaylists = Playlist.getPublic(interaction.guildId, 25);

    if (publicPlaylists.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('🌐 Playlist Công Khai')
            .setDescription(
                'Chưa có playlist công khai nào trong server này.\n\nHãy tạo playlist mới với `/playlist create` và đặt `public: true` để chia sẻ!'
            )
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    const description = publicPlaylists
        .map((pl, index) => {
            const trackCount = pl.track_count || 0;
            return `**${index + 1}. ${pl.name}**\n   └ 🎵 ${trackCount} bài | 👤 <@${pl.owner_id}>`;
        })
        .join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('🌐 Playlist Công Khai')
        .setDescription(description)
        .setFooter({
            text: `Tổng ${publicPlaylists.length} playlist công khai • Sử dụng /playlist show để xem chi tiết`
        })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Import playlist from YouTube/Spotify URL
 */
async function handleImport(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const url = interaction.options.getString('url');
    const name = interaction.options.getString('name');

    // Validate name
    if (name.length > 50) {
        throw new ValidationError('Tên playlist không được dài quá 50 ký tự', 'name');
    }

    // Check if playlist already exists
    const existing = Playlist.getByName(name, interaction.user.id, interaction.guildId);
    if (existing) {
        throw new ValidationError(`Playlist "${name}" đã tồn tại`, 'name');
    }

    // Search/load the external playlist
    const loadingEmbed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('⏳ Đang import playlist...')
        .setDescription('Đang tải thông tin playlist từ URL...')
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [loadingEmbed] });

    const result = await client.musicManager.search(url, interaction.user);

    if (!result || result.loadType !== 'playlist' || !result.tracks || result.tracks.length === 0) {
        throw new ValidationError('URL không phải là một playlist hợp lệ hoặc playlist trống!', 'url');
    }

    // Create new playlist
    const externalPlaylistName = result.playlistInfo?.name || 'Imported Playlist';
    const newPlaylist = Playlist.create(
        name,
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        `Import từ: ${externalPlaylistName}`,
        false
    );

    if (!newPlaylist) {
        throw new InternalError('Không thể tạo playlist mới!');
    }

    // Add all tracks to the new playlist
    let successCount = 0;
    let failedCount = 0;

    for (const track of result.tracks.slice(0, 100)) {
        // Limit to 100 tracks
        try {
            const trackData = {
                url: track.info.uri,
                title: track.info.title,
                author: track.info.author,
                duration: track.info.length
            };

            const added = Playlist.addTrack(newPlaylist.id, trackData, interaction.user.id);
            if (added) {
                successCount++;
            } else {
                failedCount++;
            }
        } catch (error) {
            failedCount++;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(successCount > 0 ? client.config.bot.color : COLORS.ERROR)
        .setTitle('📥 Import Playlist Hoàn Tất')
        .setDescription(
            `**${name}** đã được tạo từ **${externalPlaylistName}**!\n\n` +
                `✅ Đã import: **${successCount}** bài\n` +
                (failedCount > 0 ? `❌ Thất bại: **${failedCount}** bài\n` : '') +
                (result.tracks.length > 100
                    ? `\n⚠️ Chỉ import 100 bài đầu tiên (playlist gốc có ${result.tracks.length} bài)`
                    : '')
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    if (result.playlistInfo?.artworkUrl) {
        embed.setThumbnail(result.playlistInfo.artworkUrl);
    }

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Create a text-based progress bar
 * @param {number} percent - Progress percentage (0-100)
 * @param {number} length - Bar length in characters
 * @returns {string} Progress bar string
 */
function createProgressBar(percent, length = 20) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}
