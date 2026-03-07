/**
 * Menu Handlers
 * Handles interactions for Music Settings menus (Filter, Volume)
 * @module MenuHandlers
 */

import { MUSIC } from '../../utils/button-ids.js';
import { createNowPlayingEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import {
    createNowPlayingButtons,
    createFilterSelectMenu,
    createVolumeSelectMenu
} from '../../UI/components/MusicControls.js';
import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/design-system.js';
import logger from '../../utils/logger.js';

/**
 * Handle settings button interaction (⚙️)
 * Shows filter and volume select menus for the current queue
 * @param {Interaction} interaction
 * @param {Client} client
 */
export async function handleSettingsButton(interaction, client) {
    const guildId = interaction.guildId;
    const queue = client.musicManager.getQueue(guildId);

    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc đang phát để chỉnh cài đặt!', client.config)],
            ephemeral: true
        });
    }

    try {
        const activeFilters = queue.getActiveFilters?.() || [];
        const currentVolume = queue.volume ?? 50;

        const filterRows = createFilterSelectMenu(activeFilters);
        const volumeRows = createVolumeSelectMenu(currentVolume);

        const settingsEmbed = new EmbedBuilder()
            .setTitle('⚙️ Cài đặt phát nhạc')
            .setDescription(
                `**Bài đang phát:** ${queue.current.info?.title || 'Không rõ'}\n\n` +
                    `🔊 **Âm lượng:** ${currentVolume}%\n` +
                    `🎚️ **Filter:** ${activeFilters.length > 0 ? activeFilters.join(', ') : 'Không có'}\n` +
                    `🔁 **Lặp lại:** ${queue.loop || 'Tắt'}`
            )
            .setColor(COLORS.INFO)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        await interaction.reply({
            embeds: [settingsEmbed],
            components: [...filterRows, ...volumeRows],
            ephemeral: true
        });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Settings button error', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    embeds: [createErrorEmbed('Có lỗi khi mở cài đặt.', client.config)],
                    ephemeral: true
                })
                .catch(() => {});
        }
    }
}

/**
 * Handle filter select menu interaction
 * @param {Interaction} interaction
 * @param {Client} client
 */
export async function handleFilterSelect(interaction, client) {
    await interaction.deferUpdate();

    const guildId = interaction.guildId;
    const queue = client.musicManager.getQueue(guildId);

    if (!queue || !queue.current) {
        return interaction.followUp({
            content: '❌ Không có nhạc đang phát!',
            ephemeral: true
        });
    }

    const value = interaction.values[0];

    try {
        let success = false;
        let message = '';

        switch (value) {
            case 'clear':
                if (typeof queue.clearFilters === 'function') {
                    success = await queue.clearFilters();
                    message = 'Đã tắt tất cả hiệu ứng.';
                } else {
                    logger.warn('Filter method clearFilters not available on player');
                    message = 'Tính năng xóa filter chưa khả dụng.';
                }
                break;
            case 'bass':
            case 'pop':
            case 'rock':
            case 'jazz':
                if (typeof queue.setEqualizer === 'function') {
                    success = await queue.setEqualizer(value);
                    const eqNames = { bass: 'Bass Boost', pop: 'Pop', rock: 'Rock', jazz: 'Jazz' };
                    message = `Đã bật chế độ ${eqNames[value]}.`;
                } else {
                    logger.warn('Filter method setEqualizer not available on player');
                    message = 'Tính năng Equalizer chưa khả dụng.';
                }
                break;
            case 'nightcore':
                if (typeof queue.setNightcore === 'function') {
                    success = await queue.setNightcore(true);
                    message = 'Đã bật Nightcore.';
                } else {
                    logger.warn('Filter method setNightcore not available on player');
                    message = 'Tính năng Nightcore chưa khả dụng.';
                }
                break;
            case 'vaporwave':
                if (typeof queue.setVaporwave === 'function') {
                    success = await queue.setVaporwave(true);
                    message = 'Đã bật Vaporwave.';
                } else {
                    logger.warn('Filter method setVaporwave not available on player');
                    message = 'Tính năng Vaporwave chưa khả dụng.';
                }
                break;
            case 'karaoke':
                if (typeof queue.setKaraoke === 'function') {
                    success = await queue.setKaraoke(true);
                    message = 'Đã bật Karaoke.';
                } else {
                    logger.warn('Filter method setKaraoke not available on player');
                    message = 'Tính năng Karaoke chưa khả dụng.';
                }
                break;
            case '8d':
                if (typeof queue.set8D === 'function') {
                    success = await queue.set8D(true);
                    message = 'Đã bật 8D Audio.';
                } else {
                    logger.warn('Filter method set8D not available on player');
                    message = 'Tính năng 8D Audio chưa khả dụng.';
                }
                break;
            default:
                break;
        }

        if (success) {
            // Update the Now Playing message to show new filters
            const embed = createNowPlayingEmbed(queue.current, queue, client.config);
            const buttons = createNowPlayingButtons(queue);

            // Menu interactions are ephemeral; NP message updates are handled separately

            await interaction.followUp({
                content: `✅ ${message}`,
                ephemeral: true
            });

            // Try to update the main player message if we can access it
            // (Queue generally tracks the last NP message)
            if (queue.nowPlayingMessageId && queue.textChannel?.id) {
                const channel = await client.channels.fetch(queue.textChannel.id);
                if (channel) {
                    const msg = await channel.messages.fetch(queue.nowPlayingMessageId).catch(() => null);
                    if (msg) {
                        await msg.edit({ embeds: [embed], components: buttons });
                    }
                }
            }
        } else {
            await interaction.followUp({
                content: `❌ Không thể áp dụng filter: ${value}`,
                ephemeral: true
            });
        }
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Filter select error', error);
        await interaction
            .followUp({
                content: '❌ Có lỗi khi áp dụng filter.',
                ephemeral: true
            })
            .catch(() => {});
    }
}

/**
 * Handle volume select menu interaction
 * @param {Interaction} interaction
 * @param {Client} client
 */
export async function handleVolumeSelect(interaction, client) {
    await interaction.deferUpdate();

    const guildId = interaction.guildId;
    const queue = client.musicManager.getQueue(guildId);

    if (!queue) return;

    const volume = parseInt(interaction.values[0]);
    if (isNaN(volume)) return;

    // Clamp volume to 0-100 range
    const clampedVolume = Math.max(0, Math.min(100, volume));

    try {
        await queue.setVolume(clampedVolume);

        const embed = createNowPlayingEmbed(queue.current, queue, client.config);
        const buttons = createNowPlayingButtons(queue);

        await interaction.followUp({
            content: `🔊 Đã chỉnh âm lượng: **${clampedVolume}%**`,
            ephemeral: true
        });

        // Update NP message
        if (queue.nowPlayingMessageId && queue.textChannel?.id) {
            const channel = await client.channels.fetch(queue.textChannel.id);
            if (channel) {
                const msg = await channel.messages.fetch(queue.nowPlayingMessageId).catch(() => null);
                if (msg) {
                    await msg.edit({ embeds: [embed], components: buttons });
                }
            }
        }
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Volume select error', error);
        await interaction
            .followUp({
                content: '❌ Có lỗi khi chỉnh âm lượng.',
                ephemeral: true
            })
            .catch(() => {});
    }
}
