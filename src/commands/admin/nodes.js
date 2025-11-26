import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nodes')
        .setDescription('Hiển thị trạng thái chi tiết của các Lavalink nodes'),
    
    async execute(interaction, client) {
        try {
            const healthMonitor = client.musicManager.healthMonitor;
            const nodes = client.musicManager.shoukaku.nodes;
            
            if (!nodes || nodes.size === 0) {
                return await interaction.reply({
                    content: '❌ Không có Lavalink node nào được kết nối!',
                    ephemeral: true
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🔌 Lavalink Node Status')
                .setDescription(`Tổng số nodes: ${nodes.size}`)
                .setFooter({ text: `${client.config.bot.footer} • Node Health Monitoring` })
                .setTimestamp();
            
            for (const [name, node] of nodes) {
                const health = healthMonitor ? healthMonitor.getNodeHealth(name) : null;
                const stats = node.stats;
                
                let statusIcon = '❌ Disconnected';
                if (node.state === 3) statusIcon = '✅ Connected';
                else if (node.state === 2) statusIcon = '🔄 Connecting';
                
                let fieldValue = `**Status**: ${statusIcon}\n`;
                
                if (stats) {
                    const uptime = Math.floor(stats.uptime / 1000 / 60);
                    const memUsed = Math.round(stats.memory.used / 1024 / 1024);
                    const memTotal = Math.round(stats.memory.reservable / 1024 / 1024);
                    const memPercent = ((stats.memory.used / stats.memory.reservable) * 100).toFixed(1);
                    
                    fieldValue += `**Players**: ${stats.playingPlayers}/${stats.players}\n`;
                    fieldValue += `**Uptime**: ${uptime} minutes\n`;
                    fieldValue += `**CPU**: ${(stats.cpu.systemLoad * 100).toFixed(1)}% (Cores: ${stats.cpu.cores})\n`;
                    fieldValue += `**Memory**: ${memUsed}MB / ${memTotal}MB (${memPercent}%)\n`;
                    fieldValue += `**Frame Stats**: ${stats.frameStats ? `${stats.frameStats.sent || 0} sent` : 'N/A'}`;
                }
                
                if (health) {
                    fieldValue += `\n\n**Health Score**: ${health.score.toFixed(1)}/100`;
                    if (health.lastError) {
                        fieldValue += `\n**Last Error**: ${new Date(health.lastError).toLocaleString()}`;
                    }
                }
                
                embed.addFields([{
                    name: `${name} (${node.options.url})`,
                    value: fieldValue,
                    inline: false
                }]);
            }
            
            // Best node recommendation
            if (healthMonitor) {
                const bestNode = healthMonitor.getBestNode();
                if (bestNode) {
                    embed.addFields([{
                        name: '⭐ Recommended Node',
                        value: `**${bestNode.name}** is currently the best performing node`,
                        inline: false
                    }]);
                }
            }
            
            await interaction.reply({
                embeds: [embed]
            });
            
            logger.command('nodes', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Nodes command error', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị thông tin nodes!',
                ephemeral: true
            });
        }
    }
};
