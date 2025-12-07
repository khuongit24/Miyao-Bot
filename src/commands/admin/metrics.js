import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { VERSION } from '../../utils/version.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('metrics').setDescription('Hiển thị metrics và performance chi tiết'),

    async execute(interaction, client) {
        try {
            // Only allow admins to view metrics
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ Bạn cần quyền Administrator để xem metrics!',
                    ephemeral: true
                });
            }

            const metrics = client.metrics ? client.metrics.getSummary() : null;

            if (!metrics) {
                return interaction.reply({
                    content: '❌ Metrics chưa được khởi tạo!',
                    ephemeral: true
                });
            }

            // Format uptime
            const uptime = metrics.uptime;
            const days = Math.floor(uptime / 86400000);
            const hours = Math.floor((uptime % 86400000) / 3600000);
            const minutes = Math.floor((uptime % 3600000) / 60000);
            const seconds = Math.floor((uptime % 60000) / 1000);
            const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            // Format playtime
            const playtime = metrics.music.totalPlaytime;
            const playDays = Math.floor(playtime / 86400000);
            const playHours = Math.floor((playtime % 86400000) / 3600000);
            const playMinutes = Math.floor((playtime % 3600000) / 60000);
            const playtimeStr = `${playDays}d ${playHours}h ${playMinutes}m`;

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('📊 Performance Metrics')
                .setDescription(`**${VERSION.fullDisplay}** • Detailed performance and usage statistics`)
                .addFields([
                    {
                        name: '⏱️ Uptime',
                        value: `\`\`\`${uptimeStr}\`\`\``,
                        inline: true
                    },
                    {
                        name: '🎯 Success Rate',
                        value: `\`\`\`${metrics.commands.successRate}%\`\`\``,
                        inline: true
                    },
                    {
                        name: '💾 Cache Hit Rate',
                        value: `\`\`\`${metrics.music.cacheHitRate}%\`\`\``,
                        inline: true
                    },
                    {
                        name: '⚡ Commands',
                        value:
                            `\`\`\`Total: ${metrics.commands.total}\n` +
                            `Success: ${metrics.commands.successful}\n` +
                            `Failed: ${metrics.commands.failed}\`\`\``,
                        inline: true
                    },
                    {
                        name: '🎵 Music Stats',
                        value:
                            `\`\`\`Tracks: ${metrics.music.totalTracks}\n` +
                            `Playlists: ${metrics.music.totalPlaylists}\n` +
                            `Completed: ${metrics.music.tracksCompleted}\n` +
                            `Skipped: ${metrics.music.tracksSkipped}\n` +
                            `Searches: ${metrics.music.searchQueries}\`\`\``,
                        inline: true
                    },
                    {
                        name: '⏯️ Total Playtime',
                        value: `\`\`\`${playtimeStr}\`\`\``,
                        inline: true
                    },
                    {
                        name: '🚀 Performance',
                        value:
                            `\`\`\`Avg: ${metrics.performance.avgResponseTime}ms\n` +
                            `Min: ${metrics.performance.minResponseTime}ms\n` +
                            `Max: ${metrics.performance.maxResponseTime}ms\`\`\``,
                        inline: true
                    },
                    {
                        name: '🧠 Memory',
                        value:
                            `\`\`\`Heap: ${metrics.system.memory.heapUsed}MB / ${metrics.system.memory.heapTotal}MB\n` +
                            `RSS: ${metrics.system.memory.rss}MB\n` +
                            `External: ${metrics.system.memory.external}MB\`\`\``,
                        inline: true
                    },
                    {
                        name: '❌ Errors',
                        value: `\`\`\`Total: ${metrics.errors.total}\`\`\``,
                        inline: true
                    }
                ])
                .setFooter({ text: `${client.config.bot.footer} • Advanced Metrics Tracking` })
                .setTimestamp();

            // Add top commands if available
            if (metrics.commands.byCommand && metrics.commands.byCommand.length > 0) {
                const topCommands = metrics.commands.byCommand
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 5)
                    .map((cmd, i) => `${i + 1}. **/${cmd.name}**: ${cmd.total} uses (${cmd.successRate}% success)`)
                    .join('\n');

                embed.addFields([
                    {
                        name: '🏆 Top Commands',
                        value: topCommands || 'No data',
                        inline: false
                    }
                ]);
            }

            // Add error breakdown if available
            if (metrics.errors.byType && metrics.errors.byType.length > 0) {
                const errorBreakdown = metrics.errors.byType
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3)
                    .map((err, i) => `${i + 1}. **${err.type}**: ${err.count}`)
                    .join('\n');

                embed.addFields([
                    {
                        name: '⚠️ Error Breakdown',
                        value: errorBreakdown || 'No errors',
                        inline: false
                    }
                ]);
            }

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            logger.command('metrics', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Metrics command error', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị metrics!',
                ephemeral: true
            });
        }
    }
};
