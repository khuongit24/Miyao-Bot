import {
    createErrorEmbed,
    createSuccessEmbed,
    createQueueEmbed,
    createInfoEmbed,
    createTrackAddedEmbed,
    createNowPlayingEmbed,
    createHistoryReplayEmbed
} from '../UI/embeds/MusicEmbeds.js';
import {
    createQueueButtons,
    createNowPlayingButtons,
    createHistoryReplayButtons
} from '../UI/components/MusicControls.js';
import logger from '../utils/logger.js';
import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import Playlist from '../database/models/Playlist.js';
import { getLyrics, paginateLyrics, cleanTrackName, cleanArtistName } from '../utils/lyrics.js';

/**
 * Handle button interactions for music controls
 */
export async function handleMusicButton(interaction, client) {
    const customId = interaction.customId;

    // Get queue
    let queue = client.musicManager.getQueue(interaction.guildId);

    // Handle vote skip button separately (doesn't require same voice channel check initially)
    if (customId === 'vote_skip') {
        const { handleVoteSkipButton } = await import('../commands/music/skip.js');
        return await handleVoteSkipButton(interaction, client);
    }

    // Buttons that don't require voice channel (playlist management, viewing queue info)
    const noVoiceChannelRequired = ['queue_add_to_playlist', 'queue_remove_track', 'music_queue'];

    // Check if user is in voice channel (skip for certain buttons)
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!noVoiceChannelRequired.includes(customId) && !voiceChannel) {
        return interaction.reply({
            embeds: [createErrorEmbed('Bạn phải ở trong voice channel để sử dụng nút này!', client.config)],
            ephemeral: true
        });
    }

    // Check if bot is in same voice channel (skip for certain buttons)
    if (
        !noVoiceChannelRequired.includes(customId) &&
        queue &&
        voiceChannel &&
        queue.voiceChannelId !== voiceChannel.id
    ) {
        return interaction.reply({
            embeds: [createErrorEmbed('Bạn phải ở cùng voice channel với bot!', client.config)],
            ephemeral: true
        });
    }

    // Handle search selection buttons first
    try {
        if (customId === 'search_cancel') {
            await interaction.update({ content: '❌ Đã hủy lựa chọn.', embeds: [], components: [] });
            return;
        }

        // Handle confirm play button - Play the first track immediately
        if (customId === 'search_confirm_play') {
            const key = `${interaction.user.id}:${interaction.guildId}`;
            const userCache = client._lastSearchResults?.get(key);
            if (!userCache || !Array.isArray(userCache.tracks) || userCache.tracks.length === 0) {
                return interaction.update({
                    embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.', client.config)],
                    components: []
                });
            }
            const track = userCache.tracks[0]; // Always get the first track

            // Ensure queue exists and same voice
            if (!queue) {
                queue = await client.musicManager.createQueue(
                    interaction.guildId,
                    voiceChannel.id,
                    interaction.channel
                );
            }
            if (queue.voiceChannelId !== voiceChannel.id) {
                return interaction.update({
                    embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                    components: []
                });
            }
            // Add requester to track
            track.requester = interaction.user.id;
            queue.add(track);
            const position = queue.current ? queue.tracks.length : 1;

            // Clean up cache immediately after use
            client._lastSearchResults.delete(key);

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
                    logger.error('Failed to send now playing message after confirm play', err);
                }
            }
            logger.command('play-confirmed', interaction.user.id, interaction.guildId);
            return;
        }

        // Handle detailed search button - Show dropdown with 5 tracks
        if (customId === 'search_show_detailed') {
            const key = `${interaction.user.id}:${interaction.guildId}`;
            const userCache = client._lastSearchResults?.get(key);
            if (!userCache || !Array.isArray(userCache.tracks)) {
                return interaction.update({
                    embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.', client.config)],
                    components: []
                });
            }
            const choices = userCache.tracks;
            const description = choices
                .map((t, i) => {
                    const title = t.info.title.length > 60 ? t.info.title.substring(0, 57) + '...' : t.info.title;
                    const duration = t.info.isStream ? '🔴 LIVE' : `${Math.round(t.info.length / 1000 / 60) || 0}p`;
                    return `**${i + 1}.** ${title} • ${duration}`;
                })
                .join('\n');

            // Import createSearchResultButtons dynamically
            const { createSearchResultButtons } = await import('../UI/components/MusicControls.js');

            await interaction.update({
                embeds: [
                    createInfoEmbed(
                        'Kết quả tìm kiếm',
                        `Chọn một kết quả bên dưới để phát:\n\n${description}`,
                        client.config
                    )
                ],
                components: createSearchResultButtons(choices)
            });
            logger.command('play-detailed-search', interaction.user.id, interaction.guildId);
            return;
        }

        if (customId.startsWith('search_pick_')) {
            const idx = parseInt(customId.split('search_pick_')[1]);
            const key = `${interaction.user.id}:${interaction.guildId}`;
            const userCache = client._lastSearchResults?.get(key);
            if (!userCache || !Array.isArray(userCache.tracks)) {
                return interaction.update({
                    embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.', client.config)],
                    components: []
                });
            }
            const track = userCache.tracks[idx];
            if (!track) {
                return interaction.update({
                    embeds: [createErrorEmbed('Mục bạn chọn không hợp lệ.', client.config)],
                    components: []
                });
            }
            // Ensure queue exists and same voice
            if (!queue) {
                queue = await client.musicManager.createQueue(
                    interaction.guildId,
                    voiceChannel.id,
                    interaction.channel
                );
            }
            if (queue.voiceChannelId !== voiceChannel.id) {
                return interaction.update({
                    embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                    components: []
                });
            }
            // Add requester to track
            track.requester = interaction.user.id;
            queue.add(track);
            const position = queue.current ? queue.tracks.length : 1;

            // Clean up cache immediately after use
            client._lastSearchResults.delete(key);

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
                    logger.error('Failed to send now playing message after search pick', err);
                }
            }
            return;
        }

        // Handle different button types
        switch (customId) {
            case 'music_pause':
                await handlePause(interaction, queue, client);
                break;

            case 'music_resume':
                await handleResume(interaction, queue, client);
                break;

            case 'music_stop':
                await handleStop(interaction, queue, client);
                break;

            case 'music_skip':
                await handleSkip(interaction, queue, client);
                break;

            case 'music_previous':
                await handlePrevious(interaction, queue, client);
                break;

            case 'music_loop':
                await handleLoop(interaction, queue, client);
                break;

            case 'music_shuffle':
                await handleShuffle(interaction, queue, client);
                break;

            case 'music_volume_up':
                await handleVolumeUp(interaction, queue, client);
                break;

            case 'music_volume_down':
                await handleVolumeDown(interaction, queue, client);
                break;

            case 'music_queue':
                await handleShowQueue(interaction, queue, client);
                break;

            case 'music_lyrics':
                await handleLyrics(interaction, queue, client);
                break;

            // Seek buttons
            case 'music_seek_backward_30':
                await handleSeek(interaction, queue, client, -30000);
                break;

            case 'music_seek_backward_10':
                await handleSeek(interaction, queue, client, -10000);
                break;

            case 'music_seek_start':
                await handleSeek(interaction, queue, client, 0, true);
                break;

            case 'music_seek_forward_10':
                await handleSeek(interaction, queue, client, 10000);
                break;

            case 'music_seek_forward_30':
                await handleSeek(interaction, queue, client, 30000);
                break;

            case 'music_replay':
                await handleReplay(interaction, queue, client);
                break;

            case 'history_replay_cancel':
                await interaction.update({
                    content: '❌ Đã hủy chọn bài từ lịch sử.',
                    embeds: [],
                    components: []
                });
                break;

            case 'music_add_to_playlist':
                await handleAddCurrentTrackToPlaylist(interaction, queue, client);
                break;

            case 'music_like':
                await handleLikeTrack(interaction, queue, client);
                break;

            case 'queue_add_to_playlist':
                await handleAddQueueToPlaylist(interaction, queue, client);
                break;

            case 'queue_remove_track':
                await handleRemoveQueueTrack(interaction, queue, client);
                break;

            default:
                await interaction.reply({
                    embeds: [createErrorEmbed('Nút này chưa được triển khai!', client.config)],
                    ephemeral: true
                });
        }
    } catch (error) {
        logger.error(`Button handler error: ${customId}`, error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi xử lý nút này!', client.config)],
                ephemeral: true
            });
        }
    }
}

/**
 * Handle showing queue when queue button is clicked from now playing
 */
async function handleShowQueue(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    const page = 1;
    const totalPages = Math.ceil((queue.tracks.length + 1) / 10);

    await interaction.reply({
        embeds: [createQueueEmbed(queue, client.config, page)],
        components: createQueueButtons(page, totalPages, queue),
        ephemeral: false
    });
}

/**
 * Handle lyrics button - show lyrics for current track with pagination
 */
async function handleLyrics(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    // Defer reply since lyrics fetching may take time
    await interaction.deferReply({ ephemeral: false });

    const track = queue.current;
    const trackName = cleanTrackName(track.info.title);
    const artistName = cleanArtistName(track.info.author || '');
    const duration = track.info.length;

    try {
        // Fetch lyrics
        const lyricsData = await getLyrics(trackName, artistName, '', duration);

        if (!lyricsData) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📝 Không Tìm Thấy Lyrics')
                .setDescription(
                    `**${track.info.title}**\n` +
                    `*${track.info.author || 'Unknown Artist'}*\n\n` +
                    '❌ Không tìm thấy lời bài hát.\n\n' +
                    '💡 *Thử dùng /lyrics với từ khóa tìm kiếm khác*'
                )
                .setThumbnail(track.info.artworkUrl || null)
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Check if instrumental
        if (lyricsData.instrumental) {
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🎹 Nhạc Không Lời (Instrumental)')
                .setDescription(
                    `**${lyricsData.trackName}**\n` +
                    `*${lyricsData.artistName}*\n\n` +
                    '🎵 Bài hát này là nhạc không lời.'
                )
                .setThumbnail(track.info.artworkUrl || null)
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Get plain lyrics
        const plainLyrics = lyricsData.plainLyrics;

        if (!plainLyrics) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📝 Không Có Lời')
                .setDescription(
                    `**${lyricsData.trackName}**\n` +
                    `*${lyricsData.artistName}*\n\n` +
                    '❌ Không tìm thấy nội dung lời bài hát.'
                )
                .setThumbnail(track.info.artworkUrl || null)
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Paginate lyrics (15 lines per page for readability)
        const pages = paginateLyrics(plainLyrics, 15);
        let currentPage = 0;

        // Create embed for current page
        const createLyricsEmbed = page => {
            return new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle(`📝 ${lyricsData.trackName}`)
                .setDescription(
                    `**${lyricsData.artistName}**${lyricsData.albumName ? `\n*${lyricsData.albumName}*` : ''}\n\n` +
                    `${pages[page]}`
                )
                .setThumbnail(track.info.artworkUrl || null)
                .setFooter({ text: `${client.config.bot.footer} | Trang ${page + 1}/${pages.length}` })
                .setTimestamp();
        };

        // Create navigation buttons if more than 1 page
        const createLyricsButtons = page => {
            if (pages.length === 1) return [];

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('lyrics_first')
                    .setEmoji('⏮️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('lyrics_prev')
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('lyrics_page')
                    .setLabel(`${page + 1}/${pages.length}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('lyrics_next')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === pages.length - 1),
                new ButtonBuilder()
                    .setCustomId('lyrics_last')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === pages.length - 1)
            );

            return [row];
        };

        const message = await interaction.editReply({
            embeds: [createLyricsEmbed(currentPage)],
            components: createLyricsButtons(currentPage)
        });

        if (pages.length === 1) {
            logger.command('lyrics-button', interaction.user.id, interaction.guildId, {
                track: trackName,
                artist: artistName
            });
            return;
        }

        // Button collector for pagination
        const collector = message.createMessageComponentCollector({
            time: 300000 // 5 minutes
        });

        collector.on('collect', async i => {
            // Only allow the original user to navigate
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Chỉ người yêu cầu mới có thể điều khiển!', ephemeral: true });
            }

            switch (i.customId) {
                case 'lyrics_first':
                    currentPage = 0;
                    break;
                case 'lyrics_prev':
                    currentPage = Math.max(0, currentPage - 1);
                    break;
                case 'lyrics_next':
                    currentPage = Math.min(pages.length - 1, currentPage + 1);
                    break;
                case 'lyrics_last':
                    currentPage = pages.length - 1;
                    break;
            }

            await i.update({
                embeds: [createLyricsEmbed(currentPage)],
                components: createLyricsButtons(currentPage)
            });
        });

        collector.on('end', () => {
            // Remove buttons when collector expires
            interaction.editReply({ components: [] }).catch(() => { });
        });

        logger.command('lyrics-button', interaction.user.id, interaction.guildId, {
            track: trackName,
            artist: artistName,
            pages: pages.length
        });
    } catch (error) {
        logger.error('Lyrics button error', error);

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Lỗi Khi Tải Lyrics')
            .setDescription(
                `**${track.info.title}**\n` +
                `*${track.info.author || 'Unknown Artist'}*\n\n` +
                'Đã xảy ra lỗi khi tải lời bài hát.\n\n' +
                '💡 *Vui lòng thử lại sau hoặc dùng /lyrics*'
            )
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
}

/**
 * Handle queue pagination buttons
 */
export async function handleQueueButton(interaction, queue, client) {
    const customId = interaction.customId;

    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    // Get current page from button label
    const currentButton = interaction.message.components[0]?.components[2];

    if (!currentButton || !currentButton.data?.label) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể xác định trang hiện tại!', client.config)],
            ephemeral: true
        });
    }

    const labelMatch = currentButton.data.label.match(/(\d+)\/(\d+)/);

    if (!labelMatch) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể xác định trang hiện tại!', client.config)],
            ephemeral: true
        });
    }

    let page = parseInt(labelMatch[1]);
    const totalPages = parseInt(labelMatch[2]);

    // Calculate new page
    switch (customId) {
        case 'queue_first':
            page = 1;
            break;
        case 'queue_previous':
            page = Math.max(1, page - 1);
            break;
        case 'queue_refresh':
            // Recalculate total pages in case queue changed
            const newTotalPages = Math.ceil((queue.tracks.length + 1) / 10);
            page = Math.min(page, newTotalPages);
            break;
        case 'queue_next':
            page = Math.min(totalPages, page + 1);
            break;
        case 'queue_last':
            page = totalPages;
            break;
    }

    // Recalculate total pages for updated queue
    const updatedTotalPages = Math.ceil((queue.tracks.length + 1) / 10);

    // Update message
    await interaction.update({
        embeds: [createQueueEmbed(queue, client.config, page)],
        components: createQueueButtons(page, updatedTotalPages, queue)
    });
}

// Individual button handlers
async function handlePause(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    if (queue.paused) {
        return interaction.reply({
            embeds: [createErrorEmbed('Nhạc đã được tạm dừng rồi!', client.config)],
            ephemeral: true
        });
    }

    await queue.pause();

    await interaction.reply({
        embeds: [createSuccessEmbed('Đã tạm dừng', 'Nhạc đã được tạm dừng.', client.config)],
        ephemeral: true
    });

    logger.music('Track paused via button', { guildId: interaction.guildId });
}

async function handleResume(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    if (!queue.paused) {
        return interaction.reply({
            embeds: [createErrorEmbed('Nhạc đang phát!', client.config)],
            ephemeral: true
        });
    }

    await queue.resume();

    await interaction.reply({
        embeds: [createSuccessEmbed('Đã tiếp tục', 'Nhạc đã được tiếp tục.', client.config)],
        ephemeral: true
    });

    logger.music('Track resumed via button', { guildId: interaction.guildId });
}

async function handleStop(interaction, queue, client) {
    // Check before stopping
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    // Stop the queue
    await queue.stop();

    // Send success message
    await interaction.reply({
        embeds: [
            createSuccessEmbed('Đã dừng phát nhạc', 'Đã dừng phát nhạc và xóa hàng đợi thành công.', client.config)
        ],
        ephemeral: true
    });

    logger.music('Queue stopped via button', { guildId: interaction.guildId });
}

async function handleSkip(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    const skipped = queue.current?.info?.title || 'Unknown Track';
    await queue.skip();

    await interaction.reply({
        embeds: [createSuccessEmbed('Đã bỏ qua', `Đã bỏ qua **${skipped}**`, client.config)],
        ephemeral: true
    });

    logger.music('Track skipped via button', { guildId: interaction.guildId });
}

/**
 * Handle previous button - go back to the previous track from history
 */
async function handlePrevious(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    // Check if there's any history
    if (!queue.history || queue.history.length === 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có bài hát nào trong lịch sử để quay lại!', client.config)],
            ephemeral: true
        });
    }

    // Call the previous method on queue
    const result = await queue.previous();

    if (!result.success) {
        return interaction.reply({
            embeds: [createErrorEmbed(result.message || 'Không thể quay lại bài trước!', client.config)],
            ephemeral: true
        });
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
}

async function handleLoop(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    // Cycle through loop modes: off -> track -> queue -> off
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
        embeds: [createSuccessEmbed('Đã thay đổi chế độ lặp', `Chế độ lặp: **${modeText[nextMode]}**`, client.config)],
        ephemeral: true
    });

    logger.music('Loop mode changed via button', { guildId: interaction.guildId, mode: nextMode });
}

async function handleShuffle(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    if (queue.tracks.length < 2) {
        return interaction.reply({
            embeds: [createErrorEmbed('Cần ít nhất 2 bài trong hàng đợi để xáo trộn!', client.config)],
            ephemeral: true
        });
    }

    queue.shuffle();

    await interaction.reply({
        embeds: [
            createSuccessEmbed('Đã xáo trộn', `Đã xáo trộn ${queue.tracks.length} bài trong hàng đợi.`, client.config)
        ],
        ephemeral: true
    });

    logger.music('Queue shuffled via button', { guildId: interaction.guildId });
}

async function handleVolumeUp(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    const newVolume = Math.min(100, queue.volume + 10);
    await queue.setVolume(newVolume);

    await interaction.reply({
        embeds: [createInfoEmbed('Âm lượng', `Đã tăng âm lượng lên **${newVolume}%**`, client.config)],
        ephemeral: true
    });

    // Update now playing immediately
    await queue.updateNowPlaying();

    logger.music('Volume increased via button', { guildId: interaction.guildId, volume: newVolume });
}

async function handleVolumeDown(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    const newVolume = Math.max(0, queue.volume - 10);
    await queue.setVolume(newVolume);

    await interaction.reply({
        embeds: [createInfoEmbed('Âm lượng', `Đã giảm âm lượng xuống **${newVolume}%**`, client.config)],
        ephemeral: true
    });

    // Update now playing immediately
    await queue.updateNowPlaying();

    logger.music('Volume decreased via button', { guildId: interaction.guildId, volume: newVolume });
}

/**
 * Handle seek button (interactive progress bar seeking)
 * @param {number} offset - Milliseconds to seek (negative for backward, positive for forward)
 * @param {boolean} absolute - If true, seek to absolute position (offset is position, not delta)
 */
async function handleSeek(interaction, queue, client, offset, absolute = false) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    // Validate offset parameter
    if (typeof offset !== 'number' || isNaN(offset)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Tham số seek không hợp lệ!', client.config)],
            ephemeral: true
        });
    }

    // Check if track is seekable
    if (queue.current.info?.isStream) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể tua livestream!', client.config)],
            ephemeral: true
        });
    }

    const currentPosition = queue.player?.position || 0;
    const duration = queue.current.info?.length;

    // Validate duration
    if (!duration || duration <= 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể xác định thời lượng bài hát!', client.config)],
            ephemeral: true
        });
    }

    let newPosition;

    if (absolute) {
        // Absolute seek (e.g., restart button)
        newPosition = offset;
    } else {
        // Relative seek (e.g., +10s, -30s)
        newPosition = currentPosition + offset;
    }

    // Clamp to valid range
    newPosition = Math.max(0, Math.min(newPosition, duration - 1000));

    // Seek
    await queue.seek(newPosition);

    // Format time for display
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

    // Update now playing immediately with new position
    await queue.updateNowPlaying();

    logger.music('Track seeked via button', {
        guildId: interaction.guildId,
        offset,
        absolute,
        newPosition,
        track: queue.current.info.title
    });
}

/**
 * Handle replay button - Show history with dropdown
 */
async function handleReplay(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có lịch sử phát nhạc!', client.config)],
            ephemeral: true
        });
    }

    const history = queue.history || [];

    if (history.length === 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Chưa có bài hát nào trong lịch sử!', client.config)],
            ephemeral: true
        });
    }

    // Initialize cache if needed
    if (!client._historyCache) {
        client._historyCache = new Map();
    }

    // Setup periodic cleanup only once (check for existing interval)
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
        }, 60000);
    }

    // Store history in client cache for later retrieval
    const key = `${interaction.user.id}:${interaction.guildId}`;

    // Clean up old entry if exists
    if (client._historyCache.has(key)) {
        client._historyCache.delete(key);
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
}

/**
 * Handle history replay select dropdown
 */
export async function handleHistoryReplaySelect(interaction, client) {
    try {
        // Validate and get selected index
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

        // Get user cache with proper validation
        const key = `${interaction.user.id}:${interaction.guildId}`;
        const userCache = client._historyCache?.get(key);

        if (!userCache || !Array.isArray(userCache.history)) {
            return interaction.update({
                embeds: [createErrorEmbed('Phiên lịch sử đã hết hạn, hãy bấm nút Replay lại.', client.config)],
                components: []
            });
        }

        // Check if index is within bounds
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

        // Check voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.update({
                embeds: [createErrorEmbed('Bạn phải ở trong voice channel!', client.config)],
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
                embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                components: []
            });
        }

        // Add track to queue with new requester
        const replayTrack = {
            ...track,
            requester: interaction.user.id
        };

        queue.add(replayTrack);
        const position = queue.current ? queue.tracks.length : 1;

        // Clean up cache immediately
        client._historyCache.delete(key);

        // Update message
        await interaction.update({
            embeds: [createTrackAddedEmbed(replayTrack, position, client.config)],
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

        logger.info(`Track replayed from history: ${track.info?.title}`);
    } catch (error) {
        logger.error('History replay select handler error', error);
        await interaction
            .update({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi phát lại bài hát!', client.config)],
                components: []
            })
            .catch(() => { });
    }
}

/**
 * Handle search select dropdown
 */
export async function handleSearchSelect(interaction, client) {
    try {
        // Get selected index
        const idx = parseInt(interaction.values[0]);

        // Get user cache
        const key = `${interaction.user.id}:${interaction.guildId}`;
        const userCache = client._lastSearchResults?.get(key);

        if (!userCache || !Array.isArray(userCache.tracks)) {
            return interaction.update({
                embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.', client.config)],
                components: []
            });
        }

        const track = userCache.tracks[idx];
        if (!track) {
            return interaction.update({
                embeds: [createErrorEmbed('Bài hát không hợp lệ.', client.config)],
                components: []
            });
        }

        // Check voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.update({
                embeds: [createErrorEmbed('Bạn phải ở trong voice channel!', client.config)],
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
                embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                components: []
            });
        }

        // Add requester to track
        track.requester = interaction.user.id;

        // Add track to queue
        queue.add(track);
        const position = queue.current ? queue.tracks.length : 1;

        // Clean up cache immediately
        client._lastSearchResults.delete(key);

        // Update message
        await interaction.update({
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
                logger.error('Failed to send now playing message after search select', err);
            }
        }

        logger.info(`Track selected from search: ${track.info?.title}`);
    } catch (error) {
        logger.error('Search select handler error', error);
        await interaction
            .update({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi chọn bài hát!', client.config)],
                components: []
            })
            .catch(() => { });
    }
}

/**
 * Handle discovery select dropdown (discover, similar, trending)
 * @param {Interaction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {string} type - Type of discovery: 'discover', 'similar', or 'trending'
 */
export async function handleDiscoverySelect(interaction, client, type) {
    try {
        // Get selected index
        const selectedValue = interaction.values?.[0];
        if (!selectedValue) {
            return interaction.update({
                embeds: [createErrorEmbed('Không thể xác định lựa chọn của bạn.', client.config)],
                components: []
            });
        }

        // Parse index from value like "discover_0", "similar_1", "trending_2"
        const parts = selectedValue.split('_');
        const idx = parseInt(parts[parts.length - 1]);
        if (isNaN(idx) || idx < 0) {
            return interaction.update({
                embeds: [createErrorEmbed('Lựa chọn không hợp lệ.', client.config)],
                components: []
            });
        }

        // Get cache based on type - check cacheManager first, then fallback to client Map
        const key = `${interaction.user.id}:${interaction.guildId}`;
        let userCache = null;
        let cacheSource = null;

        // Try cacheManager first
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

        // Fallback to client._*Cache Maps
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
            return interaction.update({
                embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy sử dụng lại lệnh.', client.config)],
                components: []
            });
        }

        const track = userCache.tracks[idx];
        if (!track) {
            return interaction.update({
                embeds: [createErrorEmbed('Bài hát không hợp lệ.', client.config)],
                components: []
            });
        }

        // Check voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.update({
                embeds: [createErrorEmbed('Bạn phải ở trong voice channel!', client.config)],
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
                embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                components: []
            });
        }

        // Add requester to track
        track.requester = interaction.user.id;

        // Add track to queue
        queue.add(track);
        const position = queue.current ? queue.tracks.length : 1;

        // Clean up cache from appropriate source
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

        // Update message
        await interaction.update({
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
                logger.error('Failed to send now playing message after discovery select', err);
            }
        }

        logger.info(`Track selected from ${type}: ${track.info?.title}`);
    } catch (error) {
        logger.error(`Discovery select handler error (${type})`, error);
        await interaction
            .update({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi chọn bài hát!', client.config)],
                components: []
            })
            .catch(() => { });
    }
}

/**
 * Handle discovery buttons (play all, shuffle) for similar, trending, discover commands
 * @param {Interaction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
export async function handleDiscoveryButton(interaction, client) {
    try {
        const customId = interaction.customId;

        // Parse button type and extract userId
        // Format: {type}_play_all_{userId} or {type}_shuffle_{userId} or {type}_shuffle_all_{userId}
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
            return interaction.reply({
                embeds: [createErrorEmbed('Nút không hợp lệ.', client.config)],
                ephemeral: true
            });
        }

        // Get cache based on type - check cacheManager first, then fallback to client Map
        const key = `${interaction.user.id}:${interaction.guildId}`;
        let userCache = null;
        let cacheSource = null;

        // Try cacheManager first
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

        // Fallback to client._*Cache Maps
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
            return interaction.reply({
                embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy sử dụng lại lệnh.', client.config)],
                ephemeral: true
            });
        }

        // Check voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                embeds: [createErrorEmbed('Bạn phải ở trong voice channel!', client.config)],
                ephemeral: true
            });
        }

        // Get or create queue
        let queue = client.musicManager.getQueue(interaction.guildId);

        if (!queue) {
            queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
        }

        if (queue.voiceChannelId !== voiceChannel.id) {
            return interaction.reply({
                embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                ephemeral: true
            });
        }

        // Prepare tracks
        const tracksToAdd = [...userCache.tracks];

        // Shuffle if needed
        if (action === 'shuffle') {
            for (let i = tracksToAdd.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracksToAdd[i], tracksToAdd[j]] = [tracksToAdd[j], tracksToAdd[i]];
            }
        }

        // Add requester to all tracks
        tracksToAdd.forEach(track => {
            track.requester = interaction.user.id;
        });

        // Add all tracks to queue
        const wasPlaying = !!queue.current;
        let addedCount = 0;

        for (const track of tracksToAdd) {
            queue.add(track);
            addedCount++;
        }

        // Clean up cache from appropriate source
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

        // Create response embed
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

        // Update the original message to remove buttons
        await interaction.update({
            embeds: [embed],
            components: []
        });

        // Start playing if not already
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
        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    embeds: [createErrorEmbed('Đã xảy ra lỗi khi xử lý nút này!', client.config)],
                    ephemeral: true
                })
                .catch(() => { });
        }
    }
}

/**
 * Handle adding current track to a playlist
 */
async function handleAddCurrentTrackToPlaylist(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có bài hát nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    // Show modal to enter playlist name
    const modal = new ModalBuilder()
        .setCustomId('add_current_track_to_playlist_modal')
        .setTitle('Thêm bài hát vào playlist');

    const playlistNameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên playlist')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Nhập tên playlist...')
        .setRequired(true)
        .setMaxLength(100);

    const actionRow = new ActionRowBuilder().addComponents(playlistNameInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

/**
 * Handle like button - add current track to shared "Được mọi người yêu thích" playlist
 * This creates a community playlist where everyone can contribute their favorite songs
 */
async function handleLikeTrack(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có bài hát nào đang phát!', client.config)],
            ephemeral: true
        });
    }

    const track = queue.current;
    const SHARED_PLAYLIST_NAME = 'Được mọi người yêu thích';

    // Get bot's user ID to use as the owner of the shared playlist
    const botUserId = client.user.id;
    const botUsername = client.user.username;
    const guildId = interaction.guildId;

    try {
        // Try to get the shared playlist, create if it doesn't exist
        let sharedPlaylist = Playlist.getByName(SHARED_PLAYLIST_NAME, botUserId, guildId);

        if (!sharedPlaylist) {
            // Create the shared playlist owned by the bot
            sharedPlaylist = Playlist.create(
                SHARED_PLAYLIST_NAME,
                botUserId,
                botUsername,
                guildId,
                '💕 Playlist chứa những bài hát được mọi người trong server yêu thích!',
                true // Make it public
            );

            logger.info('Created shared favorites playlist', {
                playlistId: sharedPlaylist.id,
                guildId
            });
        }

        // Check if track is already in the playlist (to avoid duplicates)
        const existingTracks = Playlist.getTracks(sharedPlaylist.id);
        const isAlreadyInPlaylist = existingTracks.some(t => t.track_url === track.info.uri);

        if (isAlreadyInPlaylist) {
            const { EmbedBuilder } = await import('discord.js');
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('💝 Bài hát này đã được yêu thích rồi!')
                .setDescription(
                    `**${track.info.title}**\n└ 🎤 ${track.info.author}\n\n*Bài hát này đã có trong playlist "${SHARED_PLAYLIST_NAME}" trước đó rồi nhé!*`
                )
                .setThumbnail(track.info.artworkUrl || null)
                .setFooter({ text: `Playlist hiện có ${existingTracks.length} bài hát` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Add track to the shared playlist
        const trackData = {
            url: track.info.uri,
            title: track.info.title,
            author: track.info.author,
            duration: track.info.length
        };

        const addedTrack = Playlist.addTrack(sharedPlaylist.id, trackData, interaction.user.id);

        if (addedTrack) {
            const totalTracks = Playlist.getTracks(sharedPlaylist.id).length;
            const { EmbedBuilder } = await import('discord.js');

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

            // Reply publicly so everyone can see
            return interaction.reply({ embeds: [embed], ephemeral: false });
        } else {
            return interaction.reply({
                embeds: [createErrorEmbed('Không thể thêm bài hát vào danh sách yêu thích!', client.config)],
                ephemeral: true
            });
        }
    } catch (error) {
        logger.error('Error adding track to shared favorites playlist', { error: error.message });
        return interaction.reply({
            embeds: [createErrorEmbed('Đã xảy ra lỗi khi thêm bài hát vào danh sách yêu thích!', client.config)],
            ephemeral: true
        });
    }
}

/**
 * Handle adding entire queue to a playlist
 */
async function handleAddQueueToPlaylist(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    const totalTracks = (queue.current ? 1 : 0) + (queue.tracks?.length || 0);

    if (totalTracks === 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Hàng đợi trống!', client.config)],
            ephemeral: true
        });
    }

    // Show modal to enter playlist name
    const modal = new ModalBuilder()
        .setCustomId('add_queue_to_playlist_modal')
        .setTitle(`Thêm ${totalTracks} bài vào playlist`);

    const playlistNameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Tên playlist')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Nhập tên playlist...')
        .setRequired(true)
        .setMaxLength(100);

    const actionRow = new ActionRowBuilder().addComponents(playlistNameInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

/**
 * Handle removing track from queue
 */
async function handleRemoveQueueTrack(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }

    // Count queued tracks (exclude current playing)
    const queuedTracks = queue.tracks?.length || 0;

    if (queuedTracks === 0) {
        return interaction.reply({
            embeds: [
                createErrorEmbed(
                    'Không có bài nào trong hàng đợi để xóa!\n\n*Bài đang phát không thể xóa, hãy dùng /skip hoặc /stop*',
                    client.config
                )
            ],
            ephemeral: true
        });
    }

    // Build track list preview for modal placeholder
    const trackPreview = queue.tracks
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ${t.info.title.substring(0, 30)}${t.info.title.length > 30 ? '...' : ''}`)
        .join('\n');

    const remainingCount = queuedTracks > 5 ? `\n...và ${queuedTracks - 5} bài khác` : '';

    // Show modal to enter track identifier
    const modal = new ModalBuilder().setCustomId('queue_remove_track_modal').setTitle('Xóa Bài Nhạc Khỏi Hàng Đợi');

    const trackInput = new TextInputBuilder()
        .setCustomId('track_identifier')
        .setLabel(`Vị trí bài muốn xóa (1-${queuedTracks})`)
        .setPlaceholder(`Nhập số từ 1 đến ${queuedTracks} hoặc một phần tên bài hát`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

    const actionRow = new ActionRowBuilder().addComponents(trackInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

/**
 * Handle queue remove track modal submission
 */
export async function handleQueueRemoveTrackModalSubmit(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const queue = client.musicManager.getQueue(interaction.guildId);

    if (!queue) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)]
        });
    }

    const trackIdentifier = interaction.fields.getTextInputValue('track_identifier').trim();

    if (!trackIdentifier) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Vui lòng nhập tên hoặc số thứ tự bài nhạc!', client.config)]
        });
    }

    // Only work with queued tracks (not current playing)
    const queuedTracks = queue.tracks || [];

    if (queuedTracks.length === 0) {
        return interaction.editReply({
            embeds: [
                createErrorEmbed(
                    'Không có bài nào trong hàng đợi để xóa!\n\n*Bài đang phát không thể xóa, hãy dùng /skip hoặc /stop*',
                    client.config
                )
            ]
        });
    }

    let trackToRemove = null;
    let removePosition = -1;

    // Check if it's a number (position)
    const position = parseInt(trackIdentifier);
    if (!isNaN(position)) {
        if (position < 1 || position > queuedTracks.length) {
            return interaction.editReply({
                embeds: [
                    createErrorEmbed(
                        `Vị trí không hợp lệ!\n\nHàng đợi có **${queuedTracks.length}** bài (nhập số từ 1 đến ${queuedTracks.length})`,
                        client.config
                    )
                ]
            });
        }

        trackToRemove = queuedTracks[position - 1]; // Convert to 0-indexed
        removePosition = position - 1;
    } else {
        // Search by name
        const searchTerm = trackIdentifier.toLowerCase();

        const foundIndex = queuedTracks.findIndex(t => t.info.title.toLowerCase().includes(searchTerm));

        if (foundIndex === -1) {
            // Show available tracks to help user
            const availableTracks = queuedTracks
                .slice(0, 5)
                .map((t, i) => `${i + 1}. ${t.info.title.substring(0, 40)}${t.info.title.length > 40 ? '...' : ''}`)
                .join('\n');

            return interaction.editReply({
                embeds: [
                    createErrorEmbed(
                        `Không tìm thấy bài nhạc có tên "${trackIdentifier}" trong hàng đợi.\n\n**Các bài trong hàng đợi:**\n${availableTracks}${queuedTracks.length > 5 ? `\n...và ${queuedTracks.length - 5} bài khác` : ''}`,
                        client.config
                    )
                ]
            });
        }

        trackToRemove = queuedTracks[foundIndex];
        removePosition = foundIndex;
    }

    // Remove track from queue
    try {
        queue.remove(removePosition);

        const remainingCount = queue.tracks?.length || 0;

        const embed = createSuccessEmbed(
            '✅ Đã Xóa Bài Nhạc',
            `**${trackToRemove.info.title}**\n└ 🎤 ${trackToRemove.info.author}\n\nĐã xóa khỏi hàng đợi thành công!`,
            client.config
        );

        // Add footer with remaining count
        const { EmbedBuilder } = await import('discord.js');
        embed.setFooter({ text: `Còn ${remainingCount} bài trong hàng đợi` });

        await interaction.editReply({ embeds: [embed] });
        logger.command('queue-remove-track-modal', interaction.user.id, interaction.guildId);
    } catch (error) {
        logger.error('Failed to remove track from queue', error);
        await interaction.editReply({
            embeds: [createErrorEmbed('Đã xảy ra lỗi khi xóa bài nhạc khỏi hàng đợi!', client.config)]
        });
    }
}

export default {
    handleMusicButton,
    handleQueueButton,
    handleSearchSelect,
    handleHistoryReplaySelect,
    handleDiscoverySelect,
    handleDiscoveryButton,
    handleQueueRemoveTrackModalSubmit
};
