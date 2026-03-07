import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nodes')
        .setDescription('Hiển thị trạng thái chi tiết của các Lavalink nodes'),

    async execute(interaction, client) {
        await interaction.deferReply();
        try {
            const healthMonitor = client.musicManager.healthMonitor;
            const nodes = client.musicManager.shoukaku.nodes;

            if (!nodes || nodes.size === 0) {
                return await interaction.editReply({
                    content: '❌ Không có Lavalink node nào được kết nối!'
                });
            }

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🔌 Lavalink Nodes')
                .setDescription(`**${nodes.size}** node(s) đang được quản lý`)
                .setFooter({ text: `${client.config.bot.footer}` })
                .setTimestamp();

            for (const [name, node] of nodes) {
                const health = healthMonitor ? healthMonitor.getNodeHealth(name) : null;
                const stats = node.stats;

                // Shoukaku v4.3.0 State: 0=CONNECTING, 1=CONNECTED, 2=DISCONNECTING, 3=DISCONNECTED
                let statusIcon = '❌';
                let statusText = 'Disconnected';
                if (node.state === 1) {
                    statusIcon = '✅';
                    statusText = 'Connected';
                } else if (node.state === 0) {
                    statusIcon = '🔄';
                    statusText = 'Connecting';
                } else if (node.state === 2) {
                    statusIcon = '⏳';
                    statusText = 'Disconnecting';
                }

                const fieldLines = [`**Status:** ${statusIcon} ${statusText}`];

                if (stats) {
                    const uptime = Math.floor(stats.uptime / 1000 / 60);
                    const uptimeHours = Math.floor(uptime / 60);
                    const uptimeMinutes = uptime % 60;
                    const uptimeStr = uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes}m` : `${uptimeMinutes}m`;

                    const memUsed = Math.round(stats.memory.used / 1024 / 1024);
                    const memTotal = Math.round(stats.memory.reservable / 1024 / 1024);
                    const memPercent =
                        stats.memory.reservable > 0
                            ? ((stats.memory.used / stats.memory.reservable) * 100).toFixed(0)
                            : '0';

                    const cpuLoad = (stats.cpu.systemLoad * 100).toFixed(1);

                    fieldLines.push(`**Players:** ${stats.playingPlayers}/${stats.players} active`);
                    fieldLines.push(`**Uptime:** ${uptimeStr}`);
                    fieldLines.push(`**CPU:** ${cpuLoad}% (${stats.cpu.cores} cores)`);
                    fieldLines.push(`**Memory:** ${memUsed}/${memTotal}MB (${memPercent}%)`);
                }

                if (health) {
                    const healthScore = health.score.toFixed(0);
                    const healthEmoji = health.score >= 80 ? '🟢' : health.score >= 50 ? '🟡' : '🔴';
                    fieldLines.push(`**Health:** ${healthEmoji} ${healthScore}/100`);
                }

                embed.addFields([
                    {
                        name: `📡 ${name}`,
                        value: fieldLines.join('\n'),
                        inline: true
                    }
                ]);
            }

            // Best node recommendation
            if (healthMonitor) {
                const bestNode = healthMonitor.getBestNode();
                if (bestNode && nodes.size > 1) {
                    embed.addFields([
                        {
                            name: '⭐ Recommended',
                            value: `**${bestNode.name}** đang hoạt động tốt nhất`,
                            inline: false
                        }
                    ]);
                }
            }

            await interaction.editReply({
                embeds: [embed]
            });

            logger.command('nodes', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Nodes command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
