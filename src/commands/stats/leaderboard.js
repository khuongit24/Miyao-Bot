/**
 * Leaderboard Command
 * Display server leaderboard with rankings
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import History from '../../database/models/History.js';
import logger from '../../utils/logger.js';
import { formatDuration } from '../../utils/helpers.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View server music leaderboard')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Type of leaderboard')
                .addChoices(
                    { name: 'Most Active Users', value: 'users' },
                    { name: 'Most Played Tracks', value: 'tracks' }
                )
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('period')
                .setDescription('Time period')
                .addChoices(
                    { name: 'Today', value: 'day' },
                    { name: 'This Week', value: 'week' },
                    { name: 'This Month', value: 'month' },
                    { name: 'All Time', value: 'all' }
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
                day: 'Today',
                week: 'This Week',
                month: 'This Month',
                all: 'All Time'
            };

            if (type === 'users') {
                // User leaderboard
                const users = History.getMostActiveUsers(guildId, 20, period);

                if (!users || users.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🏆 Leaderboard')
                        .setDescription('No data available yet. Start playing music!')
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
                        .setColor('#FFD700')
                        .setTitle('🏆 Server Music Leaderboard')
                        .setDescription(`**${periodNames[period]}** • Top Listeners`)
                        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                        .setFooter({
                            text: `Page ${page + 1}/${totalPages} • ${users.length} total users`
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
                                    `   🎵 ${user.play_count.toLocaleString()} plays`,
                                    `   ⏱️ ${time} total`,
                                    `   📊 Avg: ${avgDuration}s per track`
                                ].join('\n');
                            } catch (error) {
                                return `${rankDisplay} Unknown User\n   🎵 ${user.play_count} plays`;
                            }
                        })
                    );

                    embed.setDescription(
                        `**${periodNames[period]}** • Top Listeners\n\n${leaderboardText.join('\n\n')}`
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
                            return await i.reply({
                                content: '❌ Only the command user can navigate!',
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
                        .setColor('#FFA500')
                        .setTitle('🏆 Leaderboard')
                        .setDescription('No data available yet. Start playing music!')
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [embed] });
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🏆 Most Played Tracks')
                    .setDescription(`**${periodNames[period]}**`)
                    .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                    .setFooter({ text: `${tracks.length} tracks • ${periodNames[period]}` })
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

                        return `${rankDisplay} **${title}**\n   by ${track.track_author} • ${track.play_count} plays`;
                    })
                    .join('\n\n');

                embed.setDescription(`**${periodNames[period]}**\n\n${tracksText}`);

                await interaction.editReply({ embeds: [embed] });
            }

            logger.command('leaderboard', {
                userId: interaction.user.id,
                guildId,
                type,
                period
            });
        } catch (error) {
            logger.error('Error in leaderboard command', { error });

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('Failed to fetch leaderboard. Please try again later.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
