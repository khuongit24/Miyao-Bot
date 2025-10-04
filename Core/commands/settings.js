/**
 * Settings Command
 * User preferences management
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import UserPreferences from '../database/models/UserPreferences.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { ValidationError, InvalidVolumeError } from '../utils/errors.js';
import { VOLUME } from '../utils/constants.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Cấu hình cài đặt cá nhân')
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Xem cài đặt hiện tại')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('volume')
                .setDescription('Đặt âm lượng mặc định')
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Mức âm lượng (0-100)')
                        .setMinValue(VOLUME.MIN)
                        .setMaxValue(VOLUME.MAX)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('autoresume')
                .setDescription('Tự động tiếp tục phát khi join lại')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Bật/tắt auto-resume')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('notifications')
                .setDescription('Nhận thông báo từ bot')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Bật/tắt thông báo')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('language')
                .setDescription('Chọn ngôn ngữ')
                .addStringOption(option =>
                    option.setName('lang')
                        .setDescription('Ngôn ngữ')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Tiếng Việt', value: 'vi' },
                            { name: 'English', value: 'en' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Đặt lại về mặc định')
        ),

    async execute(interaction, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'show':
                    await handleShow(interaction, client);
                    break;
                case 'volume':
                    await handleVolume(interaction, client);
                    break;
                case 'autoresume':
                    await handleAutoResume(interaction, client);
                    break;
                case 'notifications':
                    await handleNotifications(interaction, client);
                    break;
                case 'language':
                    await handleLanguage(interaction, client);
                    break;
                case 'reset':
                    await handleReset(interaction, client);
                    break;
                default:
                    throw new ValidationError('Subcommand không hợp lệ');
            }

            logger.command(`settings-${subcommand}`, interaction.user.id, interaction.guildId);

        } catch (error) {
            logger.error('Settings command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Show current settings
 */
async function handleShow(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const prefs = UserPreferences.get(interaction.user.id);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('⚙️ Cài Đặt Của Bạn')
        .setDescription('Cấu hình cá nhân hiện tại')
        .addFields([
            {
                name: '🔊 Âm lượng mặc định',
                value: `${prefs.defaultVolume}%`,
                inline: true
            },
            {
                name: '▶️ Auto-resume',
                value: prefs.autoResume ? '✅ Bật' : '❌ Tắt',
                inline: true
            },
            {
                name: '🔔 Thông báo',
                value: prefs.notificationsEnabled ? '✅ Bật' : '❌ Tắt',
                inline: true
            },
            {
                name: '🌐 Ngôn ngữ',
                value: prefs.language === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English',
                inline: true
            }
        ])
        .setFooter({ text: 'Dùng /settings <option> để thay đổi' })
        .setTimestamp();

    if (prefs.createdAt) {
        embed.addFields([{
            name: '📅 Tham gia',
            value: new Date(prefs.createdAt).toLocaleDateString('vi-VN'),
            inline: true
        }]);
    }

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Set default volume
 */
async function handleVolume(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const volume = interaction.options.getInteger('level');

    if (volume < VOLUME.MIN || volume > VOLUME.MAX) {
        throw new InvalidVolumeError(volume);
    }

    const success = UserPreferences.set(
        interaction.user.id,
        { defaultVolume: volume },
        interaction.user.username
    );

    if (!success) {
        throw new InternalError('Không thể cập nhật cài đặt');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật')
        .setDescription(`Âm lượng mặc định: **${volume}%**\n\nÂm lượng này sẽ được áp dụng khi bạn bắt đầu phát nhạc.`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Set auto-resume
 */
async function handleAutoResume(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean('enabled');

    const success = UserPreferences.set(
        interaction.user.id,
        { autoResume: enabled },
        interaction.user.username
    );

    if (!success) {
        throw new InternalError('Không thể cập nhật cài đặt');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật')
        .setDescription(`Auto-resume: **${enabled ? 'Bật' : 'Tắt'}**\n\n${enabled ? 'Bot sẽ tự động tiếp tục phát nhạc khi bạn join lại voice channel.' : 'Bot sẽ không tự động tiếp tục phát.'}`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Set notifications
 */
async function handleNotifications(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean('enabled');

    const success = UserPreferences.set(
        interaction.user.id,
        { notificationsEnabled: enabled },
        interaction.user.username
    );

    if (!success) {
        throw new InternalError('Không thể cập nhật cài đặt');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật')
        .setDescription(`Thông báo: **${enabled ? 'Bật' : 'Tắt'}**\n\n${enabled ? 'Bạn sẽ nhận được thông báo từ bot.' : 'Bạn sẽ không nhận thông báo.'}`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Set language
 */
async function handleLanguage(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const lang = interaction.options.getString('lang');

    const success = UserPreferences.set(
        interaction.user.id,
        { language: lang },
        interaction.user.username
    );

    if (!success) {
        throw new InternalError('Không thể cập nhật cài đặt');
    }

    const langName = lang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English';

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật')
        .setDescription(`Ngôn ngữ: **${langName}**\n\n*Lưu ý: Tính năng đa ngôn ngữ đang được phát triển.*`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Reset to default
 */
async function handleReset(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const success = UserPreferences.delete(interaction.user.id);

    if (!success) {
        throw new InternalError('Không thể đặt lại cài đặt');
    }

    const defaults = UserPreferences.getDefaults();

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Đặt Lại')
        .setDescription('Tất cả cài đặt đã được đặt lại về mặc định')
        .addFields([
            {
                name: '🔊 Âm lượng',
                value: `${defaults.defaultVolume}%`,
                inline: true
            },
            {
                name: '▶️ Auto-resume',
                value: defaults.autoResume ? 'Bật' : 'Tắt',
                inline: true
            },
            {
                name: '🔔 Thông báo',
                value: defaults.notificationsEnabled ? 'Bật' : 'Tắt',
                inline: true
            },
            {
                name: '🌐 Ngôn ngữ',
                value: defaults.language === 'vi' ? 'Tiếng Việt' : 'English',
                inline: true
            }
        ])
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
