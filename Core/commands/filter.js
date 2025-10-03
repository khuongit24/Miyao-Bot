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
                    { name: '❌ Clear All', value: 'clear' }
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
            
            switch (filterType) {
                case 'bass':
                    await queue.setEqualizer('bass');
                    filterName = '🎸 Bass Boost';
                    break;
                case 'pop':
                    await queue.setEqualizer('pop');
                    filterName = '🎵 Pop';
                    break;
                case 'jazz':
                    await queue.setEqualizer('jazz');
                    filterName = '🎹 Jazz';
                    break;
                case 'rock':
                    await queue.setEqualizer('rock');
                    filterName = '🎤 Rock';
                    break;
                case 'nightcore':
                    await queue.setNightcore(true);
                    filterName = '🌙 Nightcore';
                    break;
                case 'vaporwave':
                    await queue.setVaporwave(true);
                    filterName = '🌊 Vaporwave';
                    break;
                case '8d':
                    await queue.set8D(true);
                    filterName = '🔊 8D Audio';
                    break;
                case 'clear':
                    queue.filters = {
                        equalizer: [],
                        karaoke: null,
                        timescale: null,
                        tremolo: null,
                        vibrato: null,
                        rotation: null,
                        distortion: null,
                        channelMix: null,
                        lowPass: null
                    };
                    await queue.applyFilters();
                    return interaction.editReply({
                        embeds: [createSuccessEmbed('Đã xóa filters', 'Tất cả audio filters đã được xóa.', client.config)]
                    });
            }
            
            await interaction.editReply({
                embeds: [createSuccessEmbed(
                    'Đã áp dụng filter',
                    `Filter **${filterName}** đã được áp dụng!\n⚠️ Có thể mất vài giây để có hiệu lực.`,
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
