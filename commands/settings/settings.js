/**
 * Settings Command
 * User preferences and server settings management
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import UserPreferences from '../../database/models/UserPreferences.js';
import GuildSettings from '../../database/models/GuildSettings.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { ValidationError, InvalidVolumeError } from '../../utils/errors.js';
import { COLORS } from '../../config/design-system.js';
import { VOLUME } from '../../utils/constants.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Cấu hình cài đặt cá nhân và server')
        .addSubcommand(subcommand => subcommand.setName('show').setDescription('Xem cài đặt hiện tại'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('volume')
                .setDescription('Đặt âm lượng mặc định')
                .addIntegerOption(option =>
                    option
                        .setName('level')
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
                    option.setName('enabled').setDescription('Bật/tắt auto-resume').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('notifications')
                .setDescription('Nhận thông báo từ bot')
                .addBooleanOption(option =>
                    option.setName('enabled').setDescription('Bật/tắt thông báo').setRequired(true)
                )
        )
        .addSubcommand(subcommand => subcommand.setName('reset').setDescription('Đặt lại về mặc định'))
        // Server settings subcommands (require Manage Server permission)
        .addSubcommand(subcommand =>
            subcommand
                .setName('djrole')
                .setDescription('⚙️ [Admin] Đặt role DJ để kiểm soát nhạc')
                .addRoleOption(option =>
                    option.setName('role').setDescription('Role được quyền DJ (để trống để xóa)').setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('djonly')
                .setDescription('⚙️ [Admin] Chỉ DJ mới dùng được lệnh điều khiển')
                .addBooleanOption(option =>
                    option.setName('enabled').setDescription('Bật/tắt chế độ DJ-only').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('voteskip')
                .setDescription('⚙️ [Admin] Cấu hình vote skip')
                .addBooleanOption(option =>
                    option.setName('enabled').setDescription('Bật/tắt vote skip').setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('percentage')
                        .setDescription('Phần trăm cần thiết để skip (10-100)')
                        .setMinValue(10)
                        .setMaxValue(100)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('247')
                .setDescription('⚙️ [Admin] Bật/tắt chế độ 24/7 (bot không rời voice)')
                .addBooleanOption(option =>
                    option.setName('enabled').setDescription('Bật/tắt 24/7 mode').setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('duplicates')
                .setDescription('⚙️ [Admin] Cho phép/chặn bài hát trùng lặp trong hàng đợi')
                .addBooleanOption(option =>
                    option.setName('allow').setDescription('Cho phép bài hát trùng lặp?').setRequired(true)
                )
        )
        .addSubcommand(subcommand => subcommand.setName('server').setDescription('⚙️ [Admin] Xem cài đặt server')),

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
                case 'reset':
                    await handleReset(interaction, client);
                    break;
                // Server settings
                case 'djrole':
                    await handleDJRole(interaction, client);
                    break;
                case 'djonly':
                    await handleDJOnly(interaction, client);
                    break;
                case 'voteskip':
                    await handleVoteSkip(interaction, client);
                    break;
                case '247':
                    await handle247(interaction, client);
                    break;
                case 'duplicates':
                    await handleDuplicates(interaction, client);
                    break;
                case 'server':
                    await handleServerSettings(interaction, client);
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
                value: '🇻🇳 Tiếng Việt (chỉ hỗ trợ)',
                inline: true
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    if (prefs.createdAt) {
        embed.addFields([
            {
                name: '📅 Tham gia',
                value: new Date(prefs.createdAt).toLocaleDateString('vi-VN'),
                inline: true
            }
        ]);
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

    const success = UserPreferences.set(interaction.user.id, { defaultVolume: volume }, interaction.user.username);

    if (!success) {
        throw new Error('Không thể cập nhật cài đặt');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật')
        .setDescription(`Âm lượng mặc định: **${volume}%**\n\nÂm lượng này sẽ được áp dụng khi bạn bắt đầu phát nhạc.`)
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Set auto-resume
 */
async function handleAutoResume(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean('enabled');

    const success = UserPreferences.set(interaction.user.id, { autoResume: enabled }, interaction.user.username);

    if (!success) {
        throw new Error('Không thể cập nhật cài đặt');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật')
        .setDescription(
            `Auto-resume: **${enabled ? 'Bật' : 'Tắt'}**\n\n${enabled ? 'Bot sẽ tự động tiếp tục phát nhạc khi bạn join lại voice channel.' : 'Bot sẽ không tự động tiếp tục phát.'}`
        )
        .setFooter({ text: client.config.bot.footer })
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
        throw new Error('Không thể cập nhật cài đặt');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật')
        .setDescription(
            `Thông báo: **${enabled ? 'Bật' : 'Tắt'}**\n\n${enabled ? 'Bạn sẽ nhận được thông báo từ bot.' : 'Bạn sẽ không nhận thông báo.'}`
        )
        .setFooter({ text: client.config.bot.footer })
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
        throw new Error('Không thể đặt lại cài đặt');
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
                value: '🇻🇳 Tiếng Việt (chỉ hỗ trợ)',
                inline: true
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Check if user has admin permissions
 */
function checkAdminPermission(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        throw new ValidationError('Bạn cần quyền **Quản lý Server** để sử dụng lệnh này!');
    }
}

/**
 * Set DJ role
 */
async function handleDJRole(interaction, client) {
    checkAdminPermission(interaction);
    await interaction.deferReply({ ephemeral: true });

    const role = interaction.options.getRole('role');

    const success = GuildSettings.set(interaction.guildId, { djRoleId: role ? role.id : null }, interaction.guild.name);

    if (!success) {
        throw new Error('Không thể cập nhật cài đặt server');
    }

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('✅ Đã Cập Nhật DJ Role')
        .setDescription(
            role
                ? `DJ Role được đặt thành: **${role.name}**\n\nThành viên có role này có thể sử dụng các lệnh điều khiển nhạc khi bật chế độ DJ-only.`
                : 'DJ Role đã được **xóa**.\n\nMọi người đều có thể điều khiển nhạc.'
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Set DJ-only mode
 */
async function handleDJOnly(interaction, client) {
    checkAdminPermission(interaction);
    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean('enabled');
    const guildSettings = GuildSettings.get(interaction.guildId);

    if (enabled && !guildSettings.djRoleId) {
        throw new ValidationError(
            'Vui lòng đặt DJ Role trước khi bật chế độ DJ-only!\nSử dụng: `/settings djrole @role`'
        );
    }

    const success = GuildSettings.set(interaction.guildId, { djOnlyMode: enabled }, interaction.guild.name);

    if (!success) {
        throw new Error('Không thể cập nhật cài đặt server');
    }

    const embed = new EmbedBuilder()
        .setColor(enabled ? COLORS.WARNING : COLORS.SETTINGS_ENABLED)
        .setTitle(`✅ Chế Độ DJ-Only: ${enabled ? 'BẬT' : 'TẮT'}`)
        .setDescription(
            enabled
                ? '🎧 **Chế độ DJ-Only đã được bật!**\n\nChỉ những người có role DJ mới có thể:\n• Skip bài hát\n• Dừng phát nhạc\n• Xóa queue\n• Thay đổi âm lượng\n• Sử dụng các bộ lọc\n\n*Administrators luôn có quyền DJ.*'
                : '🎵 **Chế độ DJ-Only đã tắt!**\n\nTất cả mọi người đều có thể điều khiển nhạc.'
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Configure vote skip
 */
async function handleVoteSkip(interaction, client) {
    checkAdminPermission(interaction);
    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean('enabled');
    const percentage = interaction.options.getInteger('percentage') || 50;

    const success = GuildSettings.set(
        interaction.guildId,
        {
            voteSkipEnabled: enabled,
            voteSkipPercentage: percentage
        },
        interaction.guild.name
    );

    if (!success) {
        throw new Error('Không thể cập nhật cài đặt server');
    }

    const embed = new EmbedBuilder()
        .setColor(enabled ? COLORS.SETTINGS_ENABLED : COLORS.WARNING)
        .setTitle(`✅ Vote Skip: ${enabled ? 'BẬT' : 'TẮT'}`)
        .setDescription(
            enabled
                ? '🗳️ **Vote Skip đã được bật!**\n\n' +
                      `• Cần **${percentage}%** số người trong voice channel vote để skip\n` +
                      '• DJ và Admin có thể skip trực tiếp\n\n' +
                      '*Nhấn nút 🗳️ trong Now Playing để vote skip*'
                : '⏭️ **Vote Skip đã tắt!**\n\nBài hát sẽ được skip ngay khi có người nhấn nút skip.'
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Configure 24/7 mode
 */
async function handle247(interaction, client) {
    checkAdminPermission(interaction);
    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean('enabled');

    const success = GuildSettings.set(interaction.guildId, { twentyFourSeven: enabled }, interaction.guild.name);

    if (!success) {
        throw new Error('Không thể cập nhật cài đặt server');
    }

    const embed = new EmbedBuilder()
        .setColor(enabled ? COLORS.FILTER_ACTIVE : COLORS.INFO)
        .setTitle(`✅ Chế Độ 24/7: ${enabled ? 'BẬT' : 'TẮT'}`)
        .setDescription(
            enabled
                ? '🌙 **Chế độ 24/7 đã được bật!**\n\n' +
                      '• Bot sẽ **không tự động rời** voice channel\n' +
                      '• Bot sẽ ở lại ngay cả khi hết nhạc hoặc không có ai\n' +
                      '• Bot sẽ tự động kết nối lại nếu bị disconnect\n\n' +
                      '*Lưu ý: Bạn vẫn có thể dùng /stop để đuổi bot ra khỏi voice*'
                : '🔄 **Chế độ 24/7 đã tắt!**\n\n' +
                      'Bot sẽ tự động rời voice channel khi:\n' +
                      '• Hết nhạc trong queue\n' +
                      '• Không có ai trong voice channel'
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Configure duplicate track handling
 */
async function handleDuplicates(interaction, client) {
    checkAdminPermission(interaction);
    await interaction.deferReply({ ephemeral: true });

    const allowDuplicates = interaction.options.getBoolean('allow');

    const success = GuildSettings.set(
        interaction.guildId,
        { allowDuplicates: allowDuplicates },
        interaction.guild.name
    );

    if (!success) {
        throw new Error('Không thể cập nhật cài đặt server');
    }

    // Update current queue if exists
    const queue = client.musicManager.getQueue(interaction.guildId);
    if (queue) {
        queue.setRemoveDuplicates(!allowDuplicates);

        // Optionally remove existing duplicates if disallowing
        if (!allowDuplicates) {
            const result = queue.removeDuplicatesFromQueue();
            if (result.removed > 0) {
                logger.info('Removed duplicates from existing queue', {
                    guildId: interaction.guildId,
                    removed: result.removed
                });
            }
        }
    }

    const embed = new EmbedBuilder()
        .setColor(allowDuplicates ? COLORS.INFO : COLORS.FILTER_ACTIVE)
        .setTitle(`✅ Bài Hát Trùng Lặp: ${allowDuplicates ? 'CHO PHÉP' : 'CHẶN'}`)
        .setDescription(
            allowDuplicates
                ? '🔄 **Cho phép bài hát trùng lặp!**\n\n' +
                      '• Cùng một bài hát có thể xuất hiện nhiều lần trong hàng đợi\n' +
                      '• Phù hợp khi muốn nghe đi nghe lại bài yêu thích'
                : '🚫 **Chặn bài hát trùng lặp!**\n\n' +
                      '• Bài hát đã có trong hàng đợi sẽ bị bỏ qua\n' +
                      '• Giúp hàng đợi đa dạng hơn\n' +
                      (queue ? `• ${queue.tracks.length} bài còn lại trong hàng đợi\n` : '') +
                      '\n*Áp dụng cho cả bài đang phát và hàng đợi*'
        )
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Show server settings
 */
async function handleServerSettings(interaction, client) {
    checkAdminPermission(interaction);
    await interaction.deferReply({ ephemeral: true });

    const settings = GuildSettings.get(interaction.guildId);
    const djRole = settings.djRoleId ? interaction.guild.roles.cache.get(settings.djRoleId) : null;

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('⚙️ Cài Đặt Server')
        .setDescription(`Cấu hình cho **${interaction.guild.name}**`)
        .addFields([
            {
                name: '🎧 DJ Role',
                value: djRole ? `<@&${djRole.id}>` : '*Chưa đặt*',
                inline: true
            },
            {
                name: '🔒 DJ-Only Mode',
                value: settings.djOnlyMode ? '✅ Bật' : '❌ Tắt',
                inline: true
            },
            {
                name: '🗳️ Vote Skip',
                value: settings.voteSkipEnabled ? `✅ Bật (${settings.voteSkipPercentage}%)` : '❌ Tắt',
                inline: true
            },
            {
                name: '🌙 24/7 Mode',
                value: settings.twentyFourSeven ? '✅ Bật' : '❌ Tắt',
                inline: true
            },
            {
                name: '📢 Thông báo bài hát',
                value: settings.announceSongs ? '✅ Bật' : '❌ Tắt',
                inline: true
            },
            {
                name: '🔊 Âm lượng mặc định',
                value: `${settings.defaultVolume}%`,
                inline: true
            },
            {
                name: '🔄 Cho phép trùng lặp',
                value: settings.allowDuplicates ? '✅ Cho phép' : '🚫 Chặn',
                inline: true
            },
            {
                name: '📋 Giới hạn hàng đợi',
                value: `${settings.maxQueueSize} bài`,
                inline: true
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
