import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';
import { VERSION, ENVIRONMENT } from '../../utils/version.js';
import os from 'os';

export default {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Hiển thị thống kê và hiệu suất của bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();

            const metrics = client.musicManager.getMetrics();
            const memUsage = process.memoryUsage();
            const uptime = process.uptime();

            // Format uptime
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            // Format memory
            const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
            const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
            const rss = Math.round(memUsage.rss / 1024 / 1024);

            // Node stats
            const nodeStatsStr = (metrics.nodeStats || [])
                .map(
                    node =>
                        `**${node.name}**: ${node.connected ? '✅' : '❌'} | Players: ${node.players}/${node.playingPlayers} | CPU: ${node.cpu.toFixed(1)}%`
                )
                .join('\n');

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('📊 Thống Kê Bot')
                .setDescription(
                    `**${VERSION.fullDisplay}** • Bot đang hoạt động tốt với ${metrics.activeQueues} active queues`
                )
                .addFields([
                    {
                        name: '📦 Version Info',
                        value: `\`\`\`Version: ${VERSION.full}\nBuild: ${VERSION.build}\nCodename: ${VERSION.codename}\nEnvironment: ${ENVIRONMENT.env}\`\`\``,
                        inline: false
                    },
                    {
                        name: '⏱️ Uptime',
                        value: `\`\`\`${uptimeStr}\`\`\``,
                        inline: false
                    },
                    {
                        name: '🧠 Memory Usage',
                        value: `\`\`\`Heap: ${heapUsed}MB / ${heapTotal}MB\nRSS: ${rss}MB\`\`\``,
                        inline: true
                    },
                    {
                        name: '🎵 Music Stats',
                        value: `\`\`\`Queues: ${metrics.activeQueues}\nTracks: ${metrics.totalTracks}\nSearches: ${metrics.totalSearches}\`\`\``,
                        inline: true
                    },
                    {
                        name: '📈 Performance',
                        value: `\`\`\`Cache Hit: ${metrics.cacheHitRate}\nCache Size: ${metrics.cacheSize}\nErrors: ${metrics.errors}\`\`\``,
                        inline: true
                    },
                    {
                        name: '🔌 Lavalink Nodes',
                        value: nodeStatsStr || 'No nodes',
                        inline: false
                    },
                    {
                        name: '🛡️ Circuit Breaker',
                        value: `\`\`\`${metrics.circuitBreakerState}\`\`\``,
                        inline: true
                    },
                    {
                        name: '💻 System',
                        value: `\`\`\`Node: ${process.version}\nCPU: ${os.cpus()[0].model}\nCores: ${os.cpus().length}\`\`\``,
                        inline: true
                    },
                    {
                        name: '🌐 Discord',
                        value: `\`\`\`Guilds: ${client.guilds.cache.size}\nUsers: ${client.users.cache.size}\nPing: ${client.ws.ping}ms\`\`\``,
                        inline: true
                    }
                ])
                .setFooter({ text: `${client.config.bot.footer} • Advanced Performance Monitoring` })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            logger.command('stats', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Stats command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
