/**
 * Lyrics Command
 * Display song lyrics with pagination and synced lyrics support
 * @version 1.8.1 - Improved UI and error handling
 */

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { getLyrics, paginateLyrics, cleanTrackName, cleanArtistName, parseSyncedLyrics } from '../../utils/lyrics.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { NothingPlayingError, DifferentVoiceChannelError, ResourceNotFoundError } from '../../utils/errors.js';
import { COLORS } from '../../config/design-system.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Hiển thị lời bài hát')
        .addStringOption(option =>
            option.setName('query').setDescription('Tìm kiếm lời bài hát (để trống = bài đang phát)').setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('synced').setDescription('Hiển thị lyrics đồng bộ thời gian (nếu có)').setRequired(false)
        ),

    async execute(interaction, client) {
        await interaction.deferReply();

        try {
            const query = interaction.options.getString('query');
            const showSynced = interaction.options.getBoolean('synced') || false;

            let trackName, artistName, albumName, duration;

            if (query) {
                // Parse query: support "artist - title" format
                const parts = query.split('-').map(p => p.trim());
                if (parts.length >= 2) {
                    artistName = parts[0];
                    trackName = parts.slice(1).join(' - ');
                } else {
                    trackName = query;
                    artistName = '';
                }
            } else {
                // Use currently playing track
                const queue = client.musicManager.getQueue(interaction.guildId);

                if (!queue || !queue.current) {
                    throw new NothingPlayingError();
                }

                // Optional: Check if user is in the same voice channel
                const member = interaction.member;
                if (member.voice.channel && queue.voiceChannelId && member.voice.channel.id !== queue.voiceChannelId) {
                    throw new DifferentVoiceChannelError();
                }

                const track = queue.current;
                trackName = cleanTrackName(track.info.title);
                artistName = cleanArtistName(track.info.author || '');
                albumName = '';
                duration = track.info.length;
            }

            // Fetch lyrics with graceful degradation
            let lyricsData;
            try {
                lyricsData = await getLyrics(trackName, artistName, albumName, duration);
            } catch (error) {
                logger.warn('Lyrics API unavailable', { error: error.message });

                const embed = new EmbedBuilder()
                    .setColor(COLORS.WARNING)
                    .setTitle('⚠️ Không Thể Tải Lyrics')
                    .setDescription(
                        `Không thể tải lời bài hát cho:\n**${trackName}**${artistName ? ` - ${artistName}` : ''}\n\n` +
                            '**Nguyên nhân có thể:**\n' +
                            '• Dịch vụ lyrics tạm thời không khả dụng\n' +
                            '• Bài hát chưa có trong cơ sở dữ liệu\n\n' +
                            '💡 *Thử lại sau hoặc tìm kiếm với từ khóa khác*'
                    )
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            if (!lyricsData) {
                throw new ResourceNotFoundError(
                    `Không tìm thấy lời bài hát cho:\n**${trackName}**${artistName ? ` - ${artistName}` : ''}`,
                    'lyrics'
                );
            }

            // Check if instrumental
            if (lyricsData.instrumental) {
                const embed = new EmbedBuilder()
                    .setColor(client.config.bot.color)
                    .setTitle('🎵 Nhạc Không Lời (Instrumental)')
                    .setDescription(
                        `**${lyricsData.trackName}**\n` +
                            `*${lyricsData.artistName}*\n\n` +
                            '🎹 Bài hát này là nhạc không lời.'
                    )
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Show synced or plain lyrics
            if (showSynced && lyricsData.syncedLyrics) {
                await showSyncedLyrics(interaction, client, lyricsData);
            } else {
                await showPlainLyrics(interaction, client, lyricsData);
            }

            logger.command('lyrics', interaction.user.id, interaction.guildId, {
                track: trackName,
                artist: artistName,
                synced: showSynced
            });
        } catch (error) {
            logger.error('Lyrics command error', error);
            await sendErrorResponse(interaction, error, client.config);
        }
    }
};

/**
 * Show plain lyrics with pagination
 */
async function showPlainLyrics(interaction, client, lyricsData) {
    const plainLyrics = lyricsData.plainLyrics;

    if (!plainLyrics) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('⚠️ Không Có Lời')
            .setDescription(`**${lyricsData.trackName}**\n*${lyricsData.artistName}*\n\nKhông tìm thấy lời bài hát.`)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    // Paginate lyrics (15 lines per page for readability)
    const pages = paginateLyrics(plainLyrics, 15);
    let currentPage = 0;

    // Create embed for current page
    const createEmbed = page => {
        return new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle(`🎵 ${lyricsData.trackName}`)
            .setDescription(
                `**${lyricsData.artistName}**${lyricsData.albumName ? `\n*${lyricsData.albumName}*` : ''}\n\n${pages[page]}`
            )
            .setFooter({ text: `${client.config.bot.footer} | Trang ${page + 1}/${pages.length}` })
            .setTimestamp();
    };

    // Create navigation buttons if more than 1 page
    const createButtons = page => {
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
        embeds: [createEmbed(currentPage)],
        components: createButtons(currentPage)
    });

    if (pages.length === 1) return;

    // Button collector
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
    });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'Chỉ người yêu cầu mới có thể điều khiển!', ephemeral: true });
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
            embeds: [createEmbed(currentPage)],
            components: createButtons(currentPage)
        });
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

/**
 * Show synced lyrics (basic display, no live sync in this implementation)
 */
async function showSyncedLyrics(interaction, client, lyricsData) {
    const syncedLyrics = lyricsData.syncedLyrics;

    if (!syncedLyrics) {
        // Fallback to plain lyrics
        return showPlainLyrics(interaction, client, lyricsData);
    }

    const parsed = parseSyncedLyrics(syncedLyrics);

    if (parsed.length === 0) {
        // Fallback to plain lyrics
        return showPlainLyrics(interaction, client, lyricsData);
    }

    // For simplicity, show all synced lyrics with timestamps
    const lyricsText = parsed
        .slice(0, 30)
        .map(line => {
            const minutes = Math.floor(line.time / 60000);
            const seconds = Math.floor((line.time % 60000) / 1000);
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            return `\`[${timeStr}]\` ${line.text}`;
        })
        .join('\n');

    const moreLines = parsed.length > 30 ? `\n\n*...và ${parsed.length - 30} dòng nữa*` : '';

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`🎵 ${lyricsData.trackName} (Synced)`)
        .setDescription(
            `**${lyricsData.artistName}**${lyricsData.albumName ? `\n*${lyricsData.albumName}*` : ''}\n\n${lyricsText}${moreLines}`
        )
        .setFooter({ text: `${client.config.bot.footer} | Lời đồng bộ` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
