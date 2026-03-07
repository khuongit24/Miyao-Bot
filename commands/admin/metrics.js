import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { VERSION } from '../../utils/version.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('metrics')
        .setDescription('Hiển thị dashboard hiệu năng hệ thống (Live Update)'),

    async execute(interaction, client) {
        try {
            // Only allow admins to view metrics
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({
                    content: '❌ Bạn cần quyền Administrator để xem metrics!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            let updateInterval;
            const updateDuration = 60000; // 1 minute
            const updateFrequency = 5000; // 5 seconds
            const startTime = Date.now();
            let isUpdating = false; // Guard against concurrent editReply calls

            // BUG-C17: Truncate embed field values to Discord's 1024-char limit
            const truncateField = (value, maxLen = 1024) => {
                if (!value) return 'N/A';
                const str = String(value);
                return str.length <= maxLen ? str : str.substring(0, maxLen - 3) + '...';
            };

            const createDashboard = () => {
                const metrics = client.metrics ? client.metrics.getSummary() : null;

                if (!metrics) {
                    return {
                        content: '❌ Metrics chưa được khởi tạo!',
                        embeds: []
                    };
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

                // Memory Bar
                const heapUsed = metrics.system.memory.heapUsed;
                const heapTotal = metrics.system.memory.heapTotal;
                const memPercent = Math.min(100, Math.round((heapUsed / heapTotal) * 100));
                const memBar = createProgressBar(memPercent, 10);

                const embed = new EmbedBuilder()
                    .setColor(client.config.bot.color)
                    .setTitle('📊 System Performance Dashboard')
                    .setDescription(
                        `**${VERSION.fullDisplay}** • Live Updates (Ends <t:${Math.floor((startTime + updateDuration) / 1000)}:R>)`
                    )
                    .addFields([
                        {
                            name: '⏱️ Uptime',
                            value: truncateField(`\`\`\`${uptimeStr}\`\`\``),
                            inline: true
                        },
                        {
                            name: '🎯 Success Rate',
                            value: truncateField(`\`\`\`${metrics.commands.successRate}%\`\`\``),
                            inline: true
                        },
                        {
                            name: '💾 Cache Hit',
                            value: truncateField(`\`\`\`${metrics.music.cacheHitRate}%\`\`\``),
                            inline: true
                        },
                        {
                            name: '🧠 Memory Usage',
                            value: truncateField(
                                `\`\`\`${memBar} ${memPercent}%\n${heapUsed}MB / ${heapTotal}MB\`\`\``
                            ),
                            inline: false
                        },
                        {
                            name: '⚡ Command Stats',
                            value: truncateField(
                                `Total: **${metrics.commands.total}**\n` +
                                    `Success: **${metrics.commands.successful}**\n` +
                                    `Failed: **${metrics.commands.failed}**`
                            ),
                            inline: true
                        },
                        {
                            name: '🎵 Music Stats',
                            value: truncateField(
                                `Tracks: **${metrics.music.totalTracks}**\n` +
                                    `Completed: **${metrics.music.tracksCompleted}**\n` +
                                    `Skipped: **${metrics.music.tracksSkipped}**`
                            ),
                            inline: true
                        },
                        {
                            name: '🚀 Latency',
                            value: truncateField(
                                `Avg: **${metrics.performance.avgResponseTime}ms**\n` +
                                    `Max: **${metrics.performance.maxResponseTime}ms**`
                            ),
                            inline: true
                        }
                    ])
                    .setFooter({ text: `Last updated: ${new Date().toLocaleTimeString()}` })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('dashboard_refresh')
                        .setLabel('Refresh')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄'),
                    new ButtonBuilder()
                        .setCustomId('dashboard_stop')
                        .setLabel('Stop Auto-Update')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⏹️')
                );

                return { embeds: [embed], components: [row] };
            };

            const initialData = createDashboard();
            const message = await interaction.editReply(initialData);

            // Collector for buttons
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: updateDuration
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '❌ Bạn không có quyền điều khiển dashboard này!', ephemeral: true });
                }

                if (i.customId === 'dashboard_refresh') {
                    await i.deferUpdate();
                    if (isUpdating) return;
                    isUpdating = true;
                    try {
                        const data = createDashboard();
                        await interaction.editReply(data);
                    } finally {
                        isUpdating = false;
                    }
                } else if (i.customId === 'dashboard_stop') {
                    await i.update({
                        content: '🛑 Dashboard stopped.',
                        components: []
                    });
                    collector.stop('stopped_by_user');
                }
            });

            collector.on('end', () => {
                if (updateInterval) clearInterval(updateInterval);
                // Remove buttons when done
                interaction.editReply({ components: [] }).catch(() => {});
            });

            // Auto-update interval
            // FIX-CMD-C03: Always clear interval on any error including 429 rate limit
            updateInterval = setInterval(async () => {
                if (isUpdating) return; // Skip update if one is already in progress
                isUpdating = true;
                try {
                    const data = createDashboard();
                    await interaction.editReply(data);
                } catch (err) {
                    // Always clear interval on error — prevents leaked timers
                    clearInterval(updateInterval);
                    updateInterval = null;
                    if (err.code === 10062) {
                        // Interaction expired — silent cleanup
                        return;
                    }
                    if (err.status === 429) {
                        logger.warn('Metrics auto-update hit rate limit, stopping updates');
                        return;
                    }
                    logger.error('Metrics auto-update error', err);
                } finally {
                    isUpdating = false;
                }
            }, updateFrequency);
            // Prevent interval from blocking process exit
            if (updateInterval.unref) updateInterval.unref();

            logger.command('metrics-dashboard', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Metrics command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

function createProgressBar(percent, length = 10) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}
