/**
 * Server Stats Command
 * Display server-wide listening statistics
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import History from '../../database/models/History.js';
import logger from '../../utils/logger.js';
import { formatDuration } from '../../utils/helpers.js';

export default {
    data: new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('View server-wide listening statistics')
        .addStringOption(option =>
            option
                .setName('period')
                .setDescription('Time period for statistics')
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

            const period = interaction.options.getString('period') || 'all';
            const guildId = interaction.guildId;

            // Get server statistics
            const stats = History.getServerStats(guildId, period);

            if (!stats) {
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('📊 No Statistics Available')
                    .setDescription('No one has listened to music in this server yet. Start playing some tunes!')
                    .setFooter({ text: 'Statistics update in real-time' })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Get additional data
            const mostPlayed = History.getMostPlayed(guildId, 5, period);
            const mostActive = History.getMostActiveUsers(guildId, 5, period);
            const peakHours = History.getServerPeakHours(guildId);

            // Build embed
            const periodNames = {
                'day': 'Today',
                'week': 'This Week',
                'month': 'This Month',
                'all': 'All Time'
            };

            const embed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setTitle(`📊 ${interaction.guild.name} Statistics`)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setDescription(`**${periodNames[period]}** listening statistics`)
                .setFooter({ text: 'Statistics update in real-time' })
                .setTimestamp();

            // Overall statistics
            const listeningTime = formatDuration(stats.totalDuration);
            embed.addFields({
                name: '📈 Overall Statistics',
                value: [
                    `🎵 **Total Plays:** ${stats.totalPlays.toLocaleString()}`,
                    `👥 **Active Users:** ${stats.uniqueUsers}`,
                    `🎼 **Unique Tracks:** ${stats.uniqueTracks}`,
                    `⏱️ **Total Listening Time:** ${listeningTime}`
                ].join('\n'),
                inline: false
            });

            // Most played tracks
            if (mostPlayed && mostPlayed.length > 0) {
                const tracksText = mostPlayed
                    .map((track, index) => {
                        const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
                        const title = track.track_title.length > 35
                            ? track.track_title.substring(0, 32) + '...'
                            : track.track_title;
                        return `${emoji} **${title}**\n   by ${track.track_author} • ${track.play_count} plays`;
                    })
                    .join('\n\n');

                embed.addFields({
                    name: '🎵 Top 5 Tracks',
                    value: tracksText,
                    inline: false
                });
            }

            // Most active users
            if (mostActive && mostActive.length > 0) {
                const usersText = await Promise.all(
                    mostActive.map(async (user, index) => {
                        const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
                        try {
                            const discordUser = await client.users.fetch(user.user_id);
                            const time = formatDuration(user.total_listening_time);
                            return `${emoji} **${discordUser.username}**\n   ${user.play_count} plays • ${time}`;
                        } catch (error) {
                            return `${emoji} Unknown User\n   ${user.play_count} plays`;
                        }
                    })
                );

                embed.addFields({
                    name: '👑 Top 5 Listeners',
                    value: usersText.join('\n\n'),
                    inline: false
                });
            }

            // Peak hours
            if (peakHours && peakHours.length > 0) {
                const hoursText = peakHours
                    .map(h => `**${h.hour_of_day}:00** - ${h.play_count} plays`)
                    .join('\n');

                embed.addFields({
                    name: '⏰ Peak Listening Hours',
                    value: hoursText,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

            logger.command('serverstats', {
                userId: interaction.user.id,
                guildId,
                period,
                totalPlays: stats.totalPlays
            });

        } catch (error) {
            logger.error('Error in serverstats command', { error });

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('Failed to fetch server statistics. Please try again later.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
