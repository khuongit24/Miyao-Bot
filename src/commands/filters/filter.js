/**
 * Filter Command
 * Apply audio filters for music playback
 * @version 1.9.0 - Added Karaoke, Speed, Pitch subcommands
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireCurrentTrack } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError, FilterError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

// Filter descriptions for better UX
const FILTER_INFO = {
    bass: { name: '🎸 Bass Boost', description: 'Tăng cường âm bass' },
    pop: { name: '🎵 Pop', description: 'Equalizer nhạc Pop' },
    jazz: { name: '🎹 Jazz', description: 'Âm thanh ấm áp' },
    rock: { name: '🎤 Rock', description: 'Tăng cường mid-range' },
    nightcore: { name: '🌙 Nightcore', description: 'Tăng tốc độ & pitch' },
    vaporwave: { name: '🌊 Vaporwave', description: 'Giảm tốc độ & pitch' },
    '8d': { name: '🔊 8D Audio', description: 'Hiệu ứng xoay 360°' }
};

export default {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Áp dụng hiệu ứng âm thanh (bass, nightcore, 8D, karaoke...)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('preset')
                .setDescription('Sử dụng các bộ lọc có sẵn')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('Loại filter')
                        .setRequired(true)
                        .addChoices(
                            { name: '🎸 Bass Boost', value: 'bass' },
                            { name: '🎵 Pop', value: 'pop' },
                            { name: '🎹 Jazz', value: 'jazz' },
                            { name: '🎤 Rock', value: 'rock' },
                            { name: '🌙 Nightcore', value: 'nightcore' },
                            { name: '🌊 Vaporwave', value: 'vaporwave' },
                            { name: '🔊 8D Audio', value: '8d' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('karaoke')
                .setDescription('Bật/tắt chế độ Karaoke (loại bỏ giọng hát)')
                .addBooleanOption(option => option.setName('enabled').setDescription('Bật hoặc tắt').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('speed')
                .setDescription('Điều chỉnh tốc độ phát (0.5x - 2.0x)')
                .addNumberOption(option =>
                    option
                        .setName('value')
                        .setDescription('Tốc độ (mặc định 1.0)')
                        .setRequired(true)
                        .setMinValue(0.5)
                        .setMaxValue(2.0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('pitch')
                .setDescription('Điều chỉnh cao độ (0.5x - 2.0x)')
                .addNumberOption(option =>
                    option
                        .setName('value')
                        .setDescription('Cao độ (mặc định 1.0)')
                        .setRequired(true)
                        .setMinValue(0.5)
                        .setMaxValue(2.0)
                )
        )
        .addSubcommand(subcommand => subcommand.setName('clear').setDescription('Xóa tất cả hiệu ứng'))
        .addSubcommand(subcommand => subcommand.setName('status').setDescription('Xem các hiệu ứng đang bật')),

    async execute(interaction, client) {
        await interaction.deferReply();

        try {
            // Check resilience
            if (!isMusicSystemAvailable(client.musicManager)) {
                return sendErrorResponse(
                    interaction,
                    new Error(getDegradedModeMessage('nhạc').description),
                    client.config
                );
            }

            // Middleware & Voice Checks
            const { queue } = requireCurrentTrack(client.musicManager, interaction.guildId);
            const member = interaction.member;

            if (!member.voice.channel) throw new UserNotInVoiceError();
            if (member.voice.channel.id !== queue.voiceChannelId) throw new DifferentVoiceChannelError();

            const subcommand = interaction.options.getSubcommand();

            // BUG-070: Verify player exists and is connected before applying filters
            if (subcommand !== 'status' && (!queue.player || !queue.player.node)) {
                throw new FilterError('Player chưa sẵn sàng. Hãy đợi bài hát bắt đầu phát.');
            }

            switch (subcommand) {
                case 'preset': {
                    const type = interaction.options.getString('type');
                    await handlePreset(interaction, queue, type, client);
                    break;
                }
                case 'karaoke': {
                    const enabled = interaction.options.getBoolean('enabled');
                    await handleKaraoke(interaction, queue, enabled, client);
                    break;
                }
                case 'speed': {
                    const value = interaction.options.getNumber('value');
                    await handleTimescale(interaction, queue, { speed: value }, client);
                    break;
                }
                case 'pitch': {
                    const value = interaction.options.getNumber('value');
                    await handleTimescale(interaction, queue, { pitch: value }, client);
                    break;
                }
                case 'clear':
                    await handleClear(interaction, client, queue);
                    break;
                case 'status':
                    await handleStatus(interaction, client, queue);
                    break;
            }

            logger.command(`filter-${subcommand}`, interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

async function handlePreset(interaction, queue, type, client) {
    let success = false;

    switch (type) {
        case 'bass':
            success = await queue.setEqualizer('bass');
            break;
        case 'pop':
            success = await queue.setEqualizer('pop');
            break;
        case 'jazz':
            success = await queue.setEqualizer('jazz');
            break;
        case 'rock':
            success = await queue.setEqualizer('rock');
            break;
        case 'nightcore':
            success = await queue.setNightcore(true);
            break;
        case 'vaporwave':
            success = await queue.setVaporwave(true);
            break;
        case '8d':
            success = await queue.set8D(true);
            break;
    }

    if (!success) throw new FilterError(FILTER_INFO[type]?.name || type);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`✅ Đã áp dụng ${FILTER_INFO[type].name}`)
        .setDescription(FILTER_INFO[type].description)
        .setFooter({ text: `${client.config.bot.footer}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleKaraoke(interaction, queue, enabled, client) {
    const success = await queue.setKaraoke(enabled);
    if (!success) throw new FilterError('Karaoke');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(enabled ? '✅ Đã bật Karaoke' : '✅ Đã tắt Karaoke')
        .setDescription(enabled ? 'Đang loại bỏ giọng hát...' : 'Đã khôi phục giọng hát gốc.')
        .setFooter({ text: `${client.config.bot.footer}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleTimescale(interaction, queue, options, client) {
    const success = await queue.setTimescale(options);
    if (!success) throw new FilterError('Timescale');

    const type = options.speed !== undefined ? 'Tốc độ' : 'Cao độ';
    const currentTimescale = queue.filterManager?.filters?.timescale;

    let description;
    if (currentTimescale) {
        description = `Tốc độ: **${currentTimescale.speed}x** | Cao độ: **${currentTimescale.pitch}x**`;
    } else {
        description = 'Tốc độ: **1.0x** | Cao độ: **1.0x**';
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`✅ Đã chỉnh ${type}`)
        .setDescription(description)
        .setFooter({ text: `${client.config.bot.footer}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleClear(interaction, client, queue) {
    const success = await queue.clearFilters();
    if (!success) throw new FilterError('Clear');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã xóa tất cả hiệu ứng')
        .setDescription('Âm thanh đã trở về mặc định.')
        .setFooter({ text: `${client.config.bot.footer}` })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction, client, queue) {
    const activeFilters = queue.getActiveFilters();

    if (activeFilters.length === 0) {
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(client.config.bot.color)
                    .setTitle('📋 Filters')
                    .setDescription('Không có hiệu ứng nào đang bật.')
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp()
            ]
        });
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📋 Filters Đang Hoạt Động')
        .setDescription(activeFilters.map(f => `• **${f}**`).join('\n'))
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
