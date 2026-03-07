/**
 * Lyrics Button Handlers
 * Handles: Lyrics fetch, display, and pagination
 */

import { createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { COLORS } from '../../config/design-system.js';
import { getLyrics, paginateLyrics, cleanTrackName, cleanArtistName } from '../../utils/lyrics.js';
import logger from '../../utils/logger.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function handleLyrics(interaction, queue, client) {
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
        const lyricsData = await getLyrics(trackName, artistName, '', duration);

        if (!lyricsData) {
            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
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

        const plainLyrics = lyricsData.plainLyrics;

        if (!plainLyrics) {
            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
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

        const pages = paginateLyrics(plainLyrics, 15);
        let currentPage = 0;

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

        const collector = message.createMessageComponentCollector({
            time: 300000
        });

        collector.on('error', error => {
            logger.error('Lyrics pagination collector error', error);
        });

        collector.on('collect', async i => {
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
            interaction.editReply({ components: [] }).catch(() => {});
        });

        logger.command('lyrics-button', interaction.user.id, interaction.guildId, {
            track: trackName,
            artist: artistName,
            pages: pages.length
        });
    } catch (error) {
        logger.error('Lyrics button error', error);

        const embed = new EmbedBuilder()
            .setColor(COLORS.ERROR)
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
