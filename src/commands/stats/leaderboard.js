/**
 * Leaderboard Command
 * Display server leaderboard with rankings
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import History from '../../database/models/History.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';
import { formatDuration } from '../../utils/helpers.js';
import { COLORS } from '../../config/design-system.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Xem bảng xếp hạng nhạc của server')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Loại bảng xếp hạng')
                .addChoices(
                    { name: 'Người nghe nhiều nhất', value: 'users' },
                    { name: 'Bài hát được nghe nhiều nhất', value: 'tracks' }
                )
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('period')
                .setDescription('Khoảng thời gian')
                .addChoices(
                    { name: 'Hôm nay', value: 'day' },
                    { name: 'Tuần này', value: 'week' },
                    { name: 'Tháng này', value: 'month' },
                    { name: 'Tất cả', value: 'all' }
                )
                .setRequired(false)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const type = interaction.options.getString('type') || 'users';
            const period = interaction.options.getString('period') || 'all';
            const guildId = interaction.guildId;

            const periodNames = {
                day: 'Hôm nay',
                week: 'Tuần này',
                month: 'Tháng này',
                all: 'Tất cả'
            };

            if (type === 'users') {
                // User leaderboard
                const users = History.getMostActiveUsers(guildId, 20, period);

                if (!users || users.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setTitle('🏆 Bảng xếp hạng')
                        .setDescription('Chưa có dữ liệu. Hãy bắt đầu nghe nhạc!')
                        .setFooter({ text: client.config.bot.footer })
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                // Pagination
                const itemsPerPage = 10;
                const totalPages = Math.ceil(users.length / itemsPerPage);
                let currentPage = 0;

                const generateEmbed = async page => {
                    const start = page * itemsPerPage;
                    const end = start + itemsPerPage;
                    const pageUsers = users.slice(start, end);

                    const embed = new EmbedBuilder()
                        .setColor(COLORS.PRIMARY)
                        .setTitle('🏆 Bảng xếp hạng')
                        .setDescription(`**${periodNames[period]}** • Người nghe nhiều nhất`)
                        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                        .setFooter({
                            text: `Trang ${page + 1}/${totalPages} • Tổng ${users.length} người dùng | ${client.config.bot.footer}`
                        })
                        .setTimestamp();

                    const leaderboardText = await Promise.all(
                        pageUsers.map(async (user, index) => {
                            const rank = start + index + 1;
                            const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
                            const rankDisplay = medals[rank] || `**#${rank}**`;

                            try {
                                const discordUser = await client.users.fetch(user.user_id);
                                const time = formatDuration(user.total_listening_time);

                                // Calculate average track duration
                                const avgDuration =
                                    user.play_count > 0
                                        ? Math.round(user.total_listening_time / user.play_count / 1000)
                                        : 0;

                                return [
                                    `${rankDisplay} **${discordUser.username}**`,
                                    `   🎵 ${user.play_count.toLocaleString()} lần phát`,
                                    `   ⏱️ ${time} tổng`,
                                    `   📊 TB: ${avgDuration}s mỗi bài`
                                ].join('\n');
                            } catch (error) {
                                return `${rankDisplay} Ẩn danh\n   🎵 ${user.play_count} lần phát`;
                            }
                        })
                    );

                    embed.setDescription(
                        `**${periodNames[period]}** • Người nghe nhiều nhất\n\n${leaderboardText.join('\n\n')}`
                    );

                    return embed;
                };

                const embed = await generateEmbed(currentPage);

                // Create navigation buttons
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('leaderboard_first')
                        .setLabel('⏮️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('leaderboard_prev')
                        .setLabel('◀️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('leaderboard_next')
                        .setLabel('▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('leaderboard_last')
                        .setLabel('⏭️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === totalPages - 1)
                );

                const message = await interaction.editReply({
                    embeds: [embed],
                    components: totalPages > 1 ? [row] : []
                });

                // Button collector
                if (totalPages > 1) {
                    const collector = message.createMessageComponentCollector({
                        time: 300000 // 5 minutes
                    });

                    collector.on('collect', async i => {
                        if (i.user.id !== interaction.user.id) {
                            return i.reply({
                                content: '❌ Chỉ người dùng lệnh mới được chuyển trang!',
                                ephemeral: true
                            });
                        }

                        switch (i.customId) {
                            case 'leaderboard_first':
                                currentPage = 0;
                                break;
                            case 'leaderboard_prev':
                                currentPage = Math.max(0, currentPage - 1);
                                break;
                            case 'leaderboard_next':
                                currentPage = Math.min(totalPages - 1, currentPage + 1);
                                break;
                            case 'leaderboard_last':
                                currentPage = totalPages - 1;
                                break;
                        }

                        const newEmbed = await generateEmbed(currentPage);
                        const newRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('leaderboard_first')
                                .setLabel('⏮️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(currentPage === 0),
                            new ButtonBuilder()
                                .setCustomId('leaderboard_prev')
                                .setLabel('◀️')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(currentPage === 0),
                            new ButtonBuilder()
                                .setCustomId('leaderboard_next')
                                .setLabel('▶️')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(currentPage === totalPages - 1),
                            new ButtonBuilder()
                                .setCustomId('leaderboard_last')
                                .setLabel('⏭️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(currentPage === totalPages - 1)
                        );

                        await i.update({
                            embeds: [newEmbed],
                            components: [newRow]
                        });
                    });

                    collector.on('end', () => {
                        // Disable all buttons after timeout
                        const disabledRow = new ActionRowBuilder().addComponents(
                            row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
                        );

                        message.edit({ components: [disabledRow] }).catch(() => {});
                    });
                }
            } else {
                // Tracks leaderboard
                const tracks = History.getMostPlayed(guildId, 20, period);

                if (!tracks || tracks.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setTitle('🏆 Bảng xếp hạng')
                        .setDescription('Chưa có dữ liệu. Hãy bắt đầu nghe nhạc!')
                        .setFooter({ text: client.config.bot.footer })
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                const embed = new EmbedBuilder()
                    .setColor(COLORS.PRIMARY)
                    .setTitle('🏆 Bài hát phổ biến nhất')
                    .setDescription(`**${periodNames[period]}**`)
                    .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                    .setFooter({
                        text: `${tracks.length} bài hát • ${periodNames[period]} | ${client.config.bot.footer}`
                    })
                    .setTimestamp();

                const tracksText = tracks
                    .slice(0, 15)
                    .map((track, index) => {
                        const rank = index + 1;
                        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
                        const rankDisplay = medals[rank] || `**#${rank}**`;

                        const title =
                            track.track_title.length > 40
                                ? track.track_title.substring(0, 37) + '...'
                                : track.track_title;

                        return `${rankDisplay} **${title}**\n   bởi ${track.track_author} • ${track.play_count} lần phát`;
                    })
                    .join('\n\n');

                embed.setDescription(`**${periodNames[period]}**\n\n${tracksText}`);

                await interaction.editReply({ embeds: [embed] });
            }

            logger.command('leaderboard', interaction.user.id, guildId);
        } catch (error) {
            logger.error('Error in leaderboard command', { error });
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
