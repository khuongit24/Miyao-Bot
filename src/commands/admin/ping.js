import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Kiểm tra độ trễ của bot'),
    
    async execute(interaction, client) {
        try {
            const sent = await interaction.reply({ 
                content: '🏓 Đang đo ping...', 
                fetchReply: true 
            });
            
            const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            
            // Get Lavalink ping
            let lavalinkPing = 'N/A';
            if (client.musicManager && client.musicManager.shoukaku) {
                const nodes = [...client.musicManager.shoukaku.nodes.values()];
                if (nodes.length > 0 && nodes[0].stats) {
                    lavalinkPing = `${Math.round(nodes[0].stats.ping || 0)}ms`;
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('🏓 Pong!')
                .addFields([
                    {
                        name: '🤖 Bot Latency',
                        value: `${roundtrip}ms`,
                        inline: true
                    },
                    {
                        name: '🌐 API Latency',
                        value: `${apiLatency}ms`,
                        inline: true
                    },
                    {
                        name: '🎵 Lavalink Ping',
                        value: lavalinkPing,
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
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi kiểm tra ping!',
                ephemeral: true
            });
        }
    }
};
