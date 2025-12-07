/**
 * Filter Command
 * Apply audio filters for music playback
 * @version 1.8.1 - Enhanced filter options and UI
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createErrorEmbed, createSuccessEmbed, createInfoEmbed } from '../../UI/embeds/MusicEmbeds.js';
import logger from '../../utils/logger.js';

// Filter descriptions for better UX
const FILTER_INFO = {
    bass: {
        name: '🎸 Bass Boost',
        description: 'Tăng cường âm bass cho trải nghiệm sâu hơn'
    },
    pop: {
        name: '🎵 Pop',
        description: 'Equalizer tối ưu cho nhạc Pop'
    },
    jazz: {
        name: '🎹 Jazz',
        description: 'Âm thanh ấm áp, phù hợp nhạc Jazz'
    },
    rock: {
        name: '🎤 Rock',
        description: 'Tăng cường mid-range cho guitar và vocals'
    },
    nightcore: {
        name: '🌙 Nightcore',
        description: 'Tăng tốc độ và pitch - nhạc anime style'
    },
    vaporwave: {
        name: '🌊 Vaporwave',
        description: 'Giảm tốc độ - aesthetic retro vibes'
    },
    '8d': {
        name: '🔊 8D Audio',
        description: 'Hiệu ứng xoay không gian 360° (đeo tai nghe)'
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Áp dụng audio filter cho nhạc đang phát')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Loại filter muốn áp dụng')
                .setRequired(true)
                .addChoices(
                    { name: '🎸 Bass Boost - Tăng cường bass', value: 'bass' },
                    { name: '🎵 Pop - Equalizer nhạc Pop', value: 'pop' },
                    { name: '🎹 Jazz - Âm thanh ấm áp', value: 'jazz' },
                    { name: '🎤 Rock - Tăng mid-range', value: 'rock' },
                    { name: '🌙 Nightcore - Nhanh hơn, cao hơn', value: 'nightcore' },
                    { name: '🌊 Vaporwave - Chậm, aesthetic', value: 'vaporwave' },
                    { name: '🔊 8D Audio - Xoay không gian', value: '8d' },
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

            // Handle status check
            if (filterType === 'status') {
                return await handleFilterStatus(interaction, client, queue);
            }

            // Handle clear
            if (filterType === 'clear') {
                return await handleFilterClear(interaction, client, queue);
            }

            // Apply filter
            const result = await applyFilter(queue, filterType);

            if (!result.success) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `Không thể áp dụng filter **${FILTER_INFO[filterType]?.name || filterType}**.\nVui lòng thử lại!`,
                            client.config
                        )
                    ]
                });
            }

            // Get active filters for display
            const activeFilters = queue.getActiveFilters();
            const activeList =
                activeFilters.length > 0 ? `\n\n📋 **Filters đang hoạt động:** ${activeFilters.join(', ')}` : '';

            const filterInfo = FILTER_INFO[filterType];

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`✅ ${filterInfo.name}`)
                .setDescription(
                    'Filter đã được áp dụng thành công!\n\n' +
                        `📝 *${filterInfo.description}*\n` +
                        `⏳ Có thể mất vài giây để có hiệu lực.${activeList}`
                )
                .setFooter({ text: `${client.config.bot.footer} • /filter clear để xóa` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            logger.command('filter', interaction.user.id, interaction.guildId, {
                filter: filterType
            });
        } catch (error) {
            logger.error('Filter command error', error);
            await interaction.editReply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi áp dụng filter!', client.config)]
            });
        }
    }
};

/**
 * Apply filter based on type
 */
async function applyFilter(queue, filterType) {
    try {
        switch (filterType) {
            case 'bass':
                return { success: await queue.setEqualizer('bass') };
            case 'pop':
                return { success: await queue.setEqualizer('pop') };
            case 'jazz':
                return { success: await queue.setEqualizer('jazz') };
            case 'rock':
                return { success: await queue.setEqualizer('rock') };
            case 'nightcore':
                return { success: await queue.setNightcore(true) };
            case 'vaporwave':
                return { success: await queue.setVaporwave(true) };
            case '8d':
                return { success: await queue.set8D(true) };
            default:
                return { success: false };
        }
    } catch (error) {
        logger.error('Filter apply error', error);
        return { success: false };
    }
}

/**
 * Handle filter status display
 */
async function handleFilterStatus(interaction, client, queue) {
    const activeFilters = queue.getActiveFilters();

    if (activeFilters.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('📋 Trạng thái Filters')
            .setDescription(
                '✨ **Không có filter nào đang hoạt động**\n\n' +
                    '🎵 Âm thanh đang ở trạng thái mặc định.\n\n' +
                    '**Thử áp dụng một filter:**\n' +
                    '• `/filter type:bass` - Bass Boost\n' +
                    '• `/filter type:nightcore` - Nightcore\n' +
                    '• `/filter type:8d` - 8D Audio'
            )
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
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

    const filterList = activeFilters.map(f => `${filterEmojis[f] || '🎵'} **${f}**`).join('\n');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Filters Đang Hoạt Động')
        .setDescription(
            `**${activeFilters.length}** filter(s) đang được áp dụng:\n\n` +
                `${filterList}\n\n` +
                '💡 Sử dụng `/filter clear` để xóa tất cả.'
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

/**
 * Handle filter clear
 */
async function handleFilterClear(interaction, client, queue) {
    const success = await queue.clearFilters();

    if (!success) {
        return interaction.editReply({
            embeds: [createErrorEmbed('Không thể xóa filters. Vui lòng thử lại!', client.config)]
        });
    }

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Đã Xóa Filters')
        .setDescription('Tất cả audio filters đã được xóa.\n\n' + '🎵 Âm thanh đã trở về trạng thái mặc định.')
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
