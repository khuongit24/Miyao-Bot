/**
 * Favorites Command
 * Manage user's favorite/liked songs
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Favorites from '../../database/models/Favorites.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { formatDuration } from '../../utils/helpers.js';
import { 
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
        .setName('favorites')
        .setDescription('Quản lý danh sách bài hát yêu thích')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Xem danh sách bài hát yêu thích của bạn')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Số trang (mặc định: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Thêm bài hát vào danh sách yêu thích')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('URL hoặc từ khóa tìm kiếm (để trống = bài đang phát)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Xóa bài hát khỏi danh sách yêu thích')
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
                .setDescription('Phát toàn bộ danh sách yêu thích')
                .addBooleanOption(option =>
                    option.setName('shuffle')
                        .setDescription('Xáo trộn thứ tự phát?')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Xóa toàn bộ danh sách yêu thích')
        ),

    async execute(interaction, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'list':
                    await handleList(interaction, client);
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
                case 'clear':
                    await handleClear(interaction, client);
                    break;
                default:
                    await handleList(interaction, client);
                    break;
            }

            logger.command(`favorites-${subcommand}`, interaction.user.id, interaction.guildId);

        } catch (error) {
            logger.error('Favorites command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * List all user's favorite songs
 */
async function handleList(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const page = interaction.options.getInteger('page') || 1;
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    const total = Favorites.count(interaction.user.id);
    const favorites = Favorites.getByUser(interaction.user.id, pageSize, offset);
    const totalPages = Math.ceil(total / pageSize);

    if (total === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('❤️ Bài Hát Yêu Thích')
            .setDescription(
                'Bạn chưa có bài hát yêu thích nào.\n\n' +
                '**Cách thêm:**\n' +
                '• Sử dụng `/favorites add` để thêm bài đang phát\n' +
                '• Sử dụng `/favorites add query:<tên bài>` để tìm và thêm\n' +
                '• Nhấn nút ❤️ khi phát nhạc'
            )
            .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
    }

    if (page > totalPages) {
        throw new ValidationError(`Chỉ có ${totalPages} trang`, 'page');
    }

    const description = favorites.map((fav, index) => {
        const position = offset + index + 1;
        const title = fav.track_title.length > 45 ? fav.track_title.substring(0, 42) + '...' : fav.track_title;
        const duration = formatDuration(fav.track_duration);
        const addedDate = new Date(fav.added_at).toLocaleDateString('vi-VN');
        return `**${position}.** ${title}\n   └ 🎤 ${fav.track_author} • ⏱️ ${duration} • 📅 ${addedDate}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('❤️ Bài Hát Yêu Thích')
        .setDescription(description)
        .setFooter({ 
            text: `Trang ${page}/${totalPages} • Tổng ${total} bài hát • /favorites play để phát` 
        })
        .setTimestamp();

    // Pagination buttons
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`favorites_page_${page - 1}`)
                .setLabel('◀️ Trước')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`favorites_page_${page + 1}`)
                .setLabel('Sau ▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages),
            new ButtonBuilder()
                .setCustomId('favorites_play_all')
                .setLabel('▶️ Phát tất cả')
                .setStyle(ButtonStyle.Success)
        );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Add a song to favorites
 */
async function handleAdd(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const query = interaction.options.getString('query');
    let track = null;

    if (!query) {
        // Add currently playing track
        const queue = client.musicManager.getQueue(interaction.guildId);

        if (!queue || !queue.current) {
            throw new ValidationError(
                'Không có bài nào đang phát. Sử dụng `/favorites add query:<tên bài>` để tìm và thêm.',
                'query'
            );
        }

        track = queue.current;
    } else {
        // Search for track
        const result = await client.musicManager.search(query, interaction.user);

        if (!result || !result.tracks || result.tracks.length === 0) {
            throw new NoSearchResultsError(query);
        }

        track = result.tracks[0];
    }

    // Check if already in favorites
    if (Favorites.isFavorite(interaction.user.id, track.info.uri)) {
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Đã Tồn Tại')
            .setDescription(`**${track.info.title}**\n└ Bài hát này đã có trong danh sách yêu thích của bạn!`)
            .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
    }

    // Add to favorites
    const success = Favorites.add(interaction.user.id, {
        url: track.info.uri,
        title: track.info.title,
        author: track.info.author,
        duration: track.info.length
    });

    if (!success) {
        throw new InternalError('Không thể thêm bài hát vào danh sách yêu thích');
    }

    const total = Favorites.count(interaction.user.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('❤️ Đã Thêm Vào Yêu Thích')
        .setDescription(`**${track.info.title}**\n└ 🎤 ${track.info.author}`)
        .setThumbnail(track.info.artworkUrl || null)
        .setFooter({ text: `Tổng ${total} bài hát yêu thích` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Remove a song from favorites
 */
async function handleRemove(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const position = interaction.options.getInteger('position');
    const total = Favorites.count(interaction.user.id);

    if (total === 0) {
        throw new ValidationError('Danh sách yêu thích của bạn đang trống', 'favorites');
    }

    if (position > total) {
        throw new ValidationError(`Vị trí không hợp lệ. Bạn có ${total} bài hát yêu thích`, 'position');
    }

    // Get the favorite at that position
    const favorites = Favorites.getByUser(interaction.user.id, 1, position - 1);
    
    if (!favorites || favorites.length === 0) {
        throw new ValidationError('Không tìm thấy bài hát ở vị trí này', 'position');
    }

    const favorite = favorites[0];
    const success = Favorites.remove(interaction.user.id, favorite.track_url);

    if (!success) {
        throw new InternalError('Không thể xóa bài hát khỏi danh sách yêu thích');
    }

    const remaining = Favorites.count(interaction.user.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('💔 Đã Xóa Khỏi Yêu Thích')
        .setDescription(`**${favorite.track_title}**\n└ 🎤 ${favorite.track_author}`)
        .setFooter({ text: `Còn ${remaining} bài hát yêu thích` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Play all favorites
 */
async function handlePlay(interaction, client) {
    await interaction.deferReply();

    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    const shuffle = interaction.options.getBoolean('shuffle') || false;

    // Check if user is in voice channel
    if (!voiceChannel) {
        throw new UserNotInVoiceError();
    }

    // Check bot permissions
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has(['Connect', 'Speak'])) {
        throw new VoiceChannelPermissionError(voiceChannel.name);
    }

    const total = Favorites.count(interaction.user.id);

    if (total === 0) {
        throw new ValidationError('Danh sách yêu thích của bạn đang trống', 'favorites');
    }

    const favorites = Favorites.getByUser(interaction.user.id, total, 0);

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

    // Resolve all tracks
    logger.info('Resolving favorite tracks', { userId: interaction.user.id, trackCount: favorites.length });

    const resolvedTracks = [];
    let failedCount = 0;

    // Batch processing
    const BATCH_SIZE = 10;

    for (let i = 0; i < favorites.length; i += BATCH_SIZE) {
        const batch = favorites.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map(fav =>
                client.musicManager.search(fav.track_url, interaction.user)
                    .then(result => ({ success: true, result, track: fav }))
                    .catch(error => ({ success: false, error, track: fav }))
            )
        );

        for (const promise of results) {
            if (promise.status === 'fulfilled') {
                const { success, result } = promise.value;

                if (success && result?.tracks?.length > 0) {
                    resolvedTracks.push(result.tracks[0]);
                } else {
                    failedCount++;
                }
            } else {
                failedCount++;
            }
        }
    }

    if (resolvedTracks.length === 0) {
        throw new ValidationError('Không thể tải bất kỳ bài hát nào từ danh sách yêu thích', 'tracks');
    }

    // Shuffle if requested
    if (shuffle) {
        shuffleArray(resolvedTracks);
    }

    // Add requester to all resolved tracks
    resolvedTracks.forEach(track => {
        track.requester = interaction.user.id;
    });

    // Add all resolved tracks to queue
    queue.add(resolvedTracks);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('❤️ Đang Phát Bài Hát Yêu Thích')
        .setDescription(
            `Đã thêm **${resolvedTracks.length}/${favorites.length}** bài hát vào hàng đợi` +
            (shuffle ? '\n🔀 Đã xáo trộn thứ tự' : '') +
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
                logger.error('Failed to send now playing message from favorites', error);
            }
        }, 1000);
    }
}

/**
 * Clear all favorites
 */
async function handleClear(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const total = Favorites.count(interaction.user.id);

    if (total === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('❤️ Danh Sách Yêu Thích')
            .setDescription('Danh sách yêu thích của bạn đã trống!')
            .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
    }

    // Confirmation buttons
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('favorites_clear_confirm')
                .setLabel('✅ Xác nhận xóa')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('favorites_clear_cancel')
                .setLabel('❌ Hủy')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('⚠️ Xác Nhận Xóa')
        .setDescription(
            `Bạn có chắc muốn xóa **toàn bộ ${total} bài hát** khỏi danh sách yêu thích?\n\n` +
            '**Hành động này không thể hoàn tác!**'
        )
        .setTimestamp();

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    // Wait for button interaction
    try {
        const buttonInteraction = await reply.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id,
            time: 30000
        });

        if (buttonInteraction.customId === 'favorites_clear_confirm') {
            // Clear all favorites
            const success = Favorites.clearAll(interaction.user.id);

            if (!success) {
                throw new InternalError('Không thể xóa danh sách yêu thích');
            }

            const successEmbed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('✅ Đã Xóa')
                .setDescription(`Đã xóa toàn bộ **${total}** bài hát khỏi danh sách yêu thích.`)
                .setTimestamp();

            await buttonInteraction.update({ embeds: [successEmbed], components: [] });
        } else {
            const cancelEmbed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('❌ Đã Hủy')
                .setDescription('Đã hủy thao tác xóa danh sách yêu thích.')
                .setTimestamp();

            await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
        }
    } catch (error) {
        // Timeout - remove buttons
        const timeoutEmbed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('⏰ Hết Thời Gian')
            .setDescription('Đã hết thời gian chờ xác nhận. Thao tác đã bị hủy.')
            .setTimestamp();

        await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    }
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
