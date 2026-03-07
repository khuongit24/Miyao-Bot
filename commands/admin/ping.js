import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';
import { getDatabaseManager } from '../../database/DatabaseManager.js';

export default {
    data: new SlashCommandBuilder().setName('ping').setDescription('Kiểm tra độ trễ và trạng thái của bot'),

    async execute(interaction, client) {
        try {
            const sent = await interaction.reply({
                content: '🏓 Đang kiểm tra...',
                fetchReply: true
            });

            const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);

            // Get Lavalink ping
            let lavalinkPing = 'N/A';
            let lavalinkStatus = '❌ Offline';
            if (client.musicManager && client.musicManager.shoukaku) {
                const nodes = [...client.musicManager.shoukaku.nodes.values()];
                if (nodes.length > 0) {
                    const connectedNode = nodes.find(n => n.state === 1); // 1 = CONNECTED in Shoukaku v4.3.0
                    if (connectedNode && connectedNode.stats) {
                        lavalinkPing = `${Math.round(connectedNode.stats.ping || 0)}ms`;
                        lavalinkStatus = '✅ Online';
                    } else {
                        lavalinkStatus = '🔄 Connecting';
                    }
                }
            }

            // Get Database status
            let dbStatus = '❌ Offline';
            let dbResponseTime = 'N/A';
            try {
                const db = getDatabaseManager();
                const startTime = Date.now();
                const integrity = db.checkIntegrity();
                dbResponseTime = `${Date.now() - startTime}ms`;
                dbStatus = integrity ? '✅ Healthy' : '⚠️ Issues';
            } catch {
                dbStatus = '❌ Error';
            }

            // Get active queues count
            const activeQueues = client.musicManager?.queues?.size || 0;

            // Determine overall health
            const getHealthEmoji = latency => {
                if (latency < 100) return '🟢';
                if (latency < 200) return '🟡';
                return '🔴';
            };

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🏓 Pong!')
                .setDescription('Trạng thái hệ thống Miyao Bot')
                .addFields([
                    {
                        name: `${getHealthEmoji(roundtrip)} Bot Latency`,
                        value: `\`${roundtrip}ms\``,
                        inline: true
                    },
                    {
                        name: `${getHealthEmoji(apiLatency)} API Latency`,
                        value: `\`${apiLatency}ms\``,
                        inline: true
                    },
                    {
                        name: '🎵 Lavalink',
                        value: `${lavalinkStatus}\n\`${lavalinkPing}\``,
                        inline: true
                    },
                    {
                        name: '💾 Database',
                        value: `${dbStatus}\n\`${dbResponseTime}\``,
                        inline: true
                    },
                    {
                        name: '🎧 Active Queues',
                        value: `\`${activeQueues}\``,
                        inline: true
                    },
                    {
                        name: '🌐 Servers',
                        value: `\`${client.guilds.cache.size}\``,
                        inline: true
                    }
                ])
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            await interaction.editReply({
                content: null,
                embeds: [embed]
            });

            logger.command('ping', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Ping command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
