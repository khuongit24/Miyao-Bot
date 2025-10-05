import { SlashCommandBuilder } from 'discord.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Áp dụng audio filters cho nhạc')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại filter')
                .setRequired(true)
                .addChoices(
                    { name: '🎸 Bass Boost', value: 'bass' },
                    { name: '🎵 Pop', value: 'pop' },
                    { name: '🎹 Jazz', value: 'jazz' },
                    { name: '🎤 Rock', value: 'rock' },
                    { name: '🌙 Nightcore', value: 'nightcore' },
                    { name: '🌊 Vaporwave', value: 'vaporwave' },
                    { name: '🔊 8D Audio', value: '8d' },
                    { name: '📋 Xem filters đang dùng', value: 'status' },
                    { name: '❌ Xóa tất cả filters', value: 'clear' }
                )
        ),
    
    async execute(interaction, client) {
        await interaction.deferReply();
        
        try {
            const filterType = interaction.options.getString('type');
            const queue = client.musicManager.getQueue(interaction.guildId);
            
            // Voice checks
            const member = interaction.member;
            const voiceChannel = member.voice.channel;
            
            if (!voiceChannel) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Bạn phải ở trong voice channel để dùng lệnh này!', client.config)]
                });
            }
            
            if (!queue || !queue.current) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)]
                });
            }
            
            if (queue.voiceChannelId !== voiceChannel.id) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Bạn phải ở cùng voice channel với bot!', client.config)]
                });
            }
            
            let filterName = '';
            let success = false;
            
            // Handle status check
            if (filterType === 'status') {
                const activeFilters = queue.getActiveFilters();
                
                if (activeFilters.length === 0) {
                    return interaction.editReply({
                        embeds: [createInfoEmbed(
                            '📋 Trạng thái Filters',
                            '✨ Không có filter nào đang hoạt động.\n🎵 Âm thanh đang ở trạng thái mặc định.',
                            client.config
                        )]
                    });
                }
                
                const filterEmojis = {
                    equalizer: '🎚️',
                    timescale: '⏱️',
                    rotation: '🔊',
                    karaoke: '🎤',
                    tremolo: '〰️',
                    vibrato: '📳',
                    distortion: '⚡',
                    channelMix: '🔀',
                    lowPass: '🔉'
                };
                
                const filterList = activeFilters.map(f => 
                    `${filterEmojis[f] || '🎵'} \`${f}\``
                ).join('\n');
                
                return interaction.editReply({
                    embeds: [createInfoEmbed(
                        '📋 Filters đang hoạt động',
                        `**${activeFilters.length}** filter(s) đang được áp dụng:\n\n${filterList}\n\n💡 Dùng \`/filter clear\` để xóa tất cả.`,
                        client.config
                    )]
                });
            }
            
            // Handle filter application
            switch (filterType) {
                case 'bass':
                    success = await queue.setEqualizer('bass');
                    filterName = '🎸 Bass Boost';
                    break;
                case 'pop':
                    success = await queue.setEqualizer('pop');
                    filterName = '🎵 Pop';
                    break;
                case 'jazz':
                    success = await queue.setEqualizer('jazz');
                    filterName = '🎹 Jazz';
                    break;
                case 'rock':
                    success = await queue.setEqualizer('rock');
                    filterName = '🎤 Rock';
                    break;
                case 'nightcore':
                    success = await queue.setNightcore(true);
                    filterName = '🌙 Nightcore';
                    break;
                case 'vaporwave':
                    success = await queue.setVaporwave(true);
                    filterName = '🌊 Vaporwave';
                    break;
                case '8d':
                    success = await queue.set8D(true);
                    filterName = '🔊 8D Audio';
                    break;
                case 'clear':
                    success = await queue.clearFilters();
                    
                    if (success) {
                        return interaction.editReply({
                            embeds: [createSuccessEmbed(
                                '✅ Đã xóa tất cả filters', 
                                'Tất cả audio filters đã được xóa hoàn toàn.\n🎵 Âm thanh đã trở về trạng thái mặc định.',
                                client.config
                            )]
                        });
                    } else {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'Không thể xóa filters. Vui lòng thử lại sau!', 
                                client.config
                            )]
                        });
                    }
            }
            
            // Check if filter was applied successfully
            if (!success) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        `Không thể áp dụng filter **${filterName}**. Vui lòng thử lại!`, 
                        client.config
                    )]
                });
            }
            
            // Get currently active filters for display
            const activeFilters = queue.getActiveFilters();
            const activeFiltersList = activeFilters.length > 0 
                ? `\n\n📋 **Filters đang hoạt động**: ${activeFilters.join(', ')}`
                : '';
            
            await interaction.editReply({
                embeds: [createSuccessEmbed(
                    '✅ Đã áp dụng filter',
                    `Filter **${filterName}** đã được áp dụng thành công!` +
                    `\n⚠️ Có thể mất vài giây để có hiệu lực.` +
                    activeFiltersList,
                    client.config
                )]
            });
            
            logger.command('filter', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Filter command error', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi áp dụng filter!', client.config)]
            });
        }
    }
};
