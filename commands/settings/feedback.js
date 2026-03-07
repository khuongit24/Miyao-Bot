import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { COLORS } from '../../config/design-system.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import logger from '../../utils/logger.js';
import FeedbackSubmission from '../../database/models/FeedbackSubmission.js';
import BugReport from '../../database/models/BugReport.js';

export default {
    data: new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('[ADMIN] Quản lý feedback và bug reports')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Xem danh sách feedbacks')
                .addIntegerOption(option =>
                    option.setName('page').setDescription('Trang (mỗi trang 5 items)').setRequired(false).setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Xem chi tiết feedback')
                .addIntegerOption(option =>
                    option.setName('id').setDescription('ID của feedback').setRequired(true).setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('bugs')
                .setDescription('Xem danh sách bug reports')
                .addIntegerOption(option =>
                    option.setName('page').setDescription('Trang (mỗi trang 5 items)').setRequired(false).setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('bug')
                .setDescription('Xem chi tiết bug report')
                .addIntegerOption(option =>
                    option.setName('id').setDescription('ID của bug report').setRequired(true).setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resolve')
                .setDescription('Đánh dấu bug report đã giải quyết')
                .addIntegerOption(option =>
                    option.setName('id').setDescription('ID của bug report').setRequired(true).setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('stats').setDescription('Xem thống kê feedback và bug reports')
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply({ ephemeral: true });
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'list':
                    await handleFeedbackList(interaction, client);
                    break;
                case 'view':
                    await handleFeedbackView(interaction, client);
                    break;
                case 'bugs':
                    await handleBugList(interaction, client);
                    break;
                case 'bug':
                    await handleBugView(interaction, client);
                    break;
                case 'resolve':
                    await handleBugResolve(interaction, client);
                    break;
                case 'stats':
                    await handleStats(interaction, client);
                    break;
                default:
                    await interaction.editReply({
                        content: '❌ Subcommand không hợp lệ!'
                    });
            }

            logger.command('feedback', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Feedback command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

/**
 * Handle feedback list
 */
async function handleFeedbackList(interaction, client) {
    const totalCount = await FeedbackSubmission.getCount();

    if (totalCount === 0) {
        return interaction.editReply({
            content: '📝 Chưa có feedback nào!'
        });
    }

    const page = interaction.options.getInteger('page') || 1;
    const perPage = 5;
    const totalPages = Math.ceil(totalCount / perPage);

    const pageFeedbacks = await FeedbackSubmission.getPaginated(page, perPage);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📝 Danh sách Feedbacks')
        .setDescription(`Tổng: **${totalCount}** feedbacks`)
        .setFooter({ text: `${client.config.bot.footer} • Trang ${page}/${totalPages}` })
        .setTimestamp();

    for (const feedback of pageFeedbacks) {
        const date = new Date(feedback.created_at).toLocaleString('vi-VN');
        const contentPreview = feedback.content.substring(0, 100);
        embed.addFields({
            name: `#${feedback.id} - ${feedback.subject}`,
            value:
                `👤 ${feedback.user_tag || 'Unknown'}\n` +
                `🏢 ${feedback.guild_name || 'Unknown'}\n` +
                `📅 ${date}\n` +
                `📄 ${contentPreview}${feedback.content.length > 100 ? '...' : ''}`,
            inline: false
        });
    }

    await interaction.editReply({
        embeds: [embed]
    });
}

/**
 * Handle feedback view
 */
async function handleFeedbackView(interaction, client) {
    const id = interaction.options.getInteger('id');
    const feedback = await FeedbackSubmission.getById(id);

    if (!feedback) {
        return interaction.editReply({
            content: `❌ Không tìm thấy feedback với ID ${id}!`
        });
    }

    const date = new Date(feedback.created_at).toLocaleString('vi-VN');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`📝 Feedback #${feedback.id}`)
        .addFields([
            { name: '📌 Tiêu đề', value: feedback.subject, inline: false },
            { name: '👤 Người gửi', value: `${feedback.user_tag || 'Unknown'} (${feedback.user_id})`, inline: true },
            { name: '🏢 Server', value: feedback.guild_name || 'Unknown', inline: true },
            { name: '📅 Thời gian', value: date, inline: true },
            { name: '📄 Nội dung', value: feedback.content, inline: false },
            { name: '📞 Liên hệ', value: feedback.contact || 'Không cung cấp', inline: false }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed]
    });
}

/**
 * Handle bug list
 */
async function handleBugList(interaction, client) {
    const totalCount = await BugReport.getCount();

    if (totalCount === 0) {
        return interaction.editReply({
            content: '🐛 Chưa có bug report nào!'
        });
    }

    const page = interaction.options.getInteger('page') || 1;
    const perPage = 5;
    const totalPages = Math.ceil(totalCount / perPage);

    const pageBugs = await BugReport.getPaginated(page, perPage);

    const embed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle('🐛 Danh sách Bug Reports')
        .setDescription(`Tổng: **${totalCount}** bug reports`)
        .setFooter({ text: `${client.config.bot.footer} • Trang ${page}/${totalPages}` })
        .setTimestamp();

    for (const bug of pageBugs) {
        const date = new Date(bug.created_at).toLocaleString('vi-VN');
        const statusEmoji = bug.status === 'RESOLVED' ? '✅' : '🔴';
        embed.addFields({
            name: `${statusEmoji} #${bug.id} - ${bug.title}`,
            value:
                `👤 ${bug.user_tag || 'Unknown'}\n` +
                `🏢 ${bug.guild_name || 'Unknown'}\n` +
                `📅 ${date}\n` +
                `📊 Status: **${bug.status}**`,
            inline: false
        });
    }

    await interaction.editReply({
        embeds: [embed]
    });
}

/**
 * Handle bug view
 */
async function handleBugView(interaction, client) {
    const id = interaction.options.getInteger('id');
    const bug = await BugReport.getById(id);

    if (!bug) {
        return interaction.editReply({
            content: `❌ Không tìm thấy bug report với ID ${id}!`
        });
    }

    const date = new Date(bug.created_at).toLocaleString('vi-VN');
    const statusEmoji = bug.status === 'RESOLVED' ? '✅' : '🔴';

    const embed = new EmbedBuilder()
        .setColor(bug.status === 'RESOLVED' ? COLORS.SUCCESS : COLORS.ERROR)
        .setTitle(`${statusEmoji} Bug Report #${bug.id}`)
        .addFields([
            { name: '🐛 Tên lỗi', value: bug.title, inline: false },
            { name: '👤 Người báo cáo', value: `${bug.user_tag || 'Unknown'} (${bug.user_id})`, inline: true },
            { name: '🏢 Server', value: bug.guild_name || 'Unknown', inline: true },
            { name: '📅 Thời gian', value: date, inline: true },
            { name: '📊 Status', value: `**${bug.status}**`, inline: true },
            { name: '📝 Các bước tái hiện', value: bug.steps, inline: false },
            { name: '✅ Kết quả mong đợi', value: bug.expected, inline: true },
            { name: '❌ Kết quả thực tế', value: bug.actual, inline: true },
            { name: '📞 Liên hệ', value: bug.contact || 'Không cung cấp', inline: false }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed]
    });
}

/**
 * Handle bug resolve
 */
async function handleBugResolve(interaction, client) {
    const id = interaction.options.getInteger('id');
    const bug = await BugReport.getById(id);

    if (!bug) {
        return interaction.editReply({
            content: `❌ Không tìm thấy bug report với ID ${id}!`
        });
    }

    if (bug.status === 'RESOLVED') {
        return interaction.editReply({
            content: `✅ Bug report #${id} đã được resolve trước đó!`
        });
    }

    const resolved = await BugReport.resolve(id, interaction.user.tag);

    if (!resolved) {
        return interaction.editReply({
            content: `❌ Không thể resolve bug report #${id}!`
        });
    }

    const embed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle('✅ Bug Report Resolved')
        .setDescription(`Bug report **#${id}** đã được đánh dấu là đã giải quyết!`)
        .addFields([
            { name: '🐛 Lỗi', value: bug.title, inline: false },
            { name: '👤 Resolved by', value: interaction.user.tag, inline: true },
            { name: '📅 Resolved at', value: new Date().toLocaleString('vi-VN'), inline: true }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed]
    });
}

/**
 * Handle stats
 */
async function handleStats(interaction, client) {
    const [feedbacks, bugReports, bugStats, feedbackCount] = await Promise.all([
        FeedbackSubmission.getAll(),
        BugReport.getAll(),
        BugReport.getStats(),
        FeedbackSubmission.getCount()
    ]);

    const { open: openBugs, resolved: resolvedBugs, total: totalBugs } = bugStats;

    // Get date range from both collections
    const allItems = [...feedbacks, ...bugReports];
    const dates = allItems.map(item => new Date(item.created_at)).sort((a, b) => a - b);
    const firstDate = dates.length > 0 ? dates[0].toLocaleDateString('vi-VN') : 'N/A';
    const lastDate = dates.length > 0 ? dates[dates.length - 1].toLocaleDateString('vi-VN') : 'N/A';

    // Top reporters
    const reporters = {};
    for (const item of allItems) {
        const tag = item.user_tag || 'Unknown';
        reporters[tag] = (reporters[tag] || 0) + 1;
    }
    const topReporters =
        Object.entries(reporters)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => `**${tag}**: ${count}`)
            .join('\n') || 'Chưa có dữ liệu';

    const totalItems = feedbackCount + totalBugs;

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📊 Thống kê Feedback & Bug Reports')
        .addFields([
            { name: '📝 Feedbacks', value: `**${feedbackCount}** feedbacks`, inline: true },
            { name: '🐛 Bug Reports', value: `**${totalBugs}** reports`, inline: true },
            { name: '📈 Tổng', value: `**${totalItems}** items`, inline: true },
            { name: '🔴 Open Bugs', value: `**${openBugs}**`, inline: true },
            { name: '✅ Resolved Bugs', value: `**${resolvedBugs}**`, inline: true },
            {
                name: '📊 Resolve Rate',
                value: totalBugs > 0 ? `**${Math.round((resolvedBugs / totalBugs) * 100)}%**` : '**N/A**',
                inline: true
            },
            { name: '📅 Khoảng thời gian', value: `${firstDate} - ${lastDate}`, inline: false },
            { name: '🏆 Top Contributors', value: topReporters, inline: false }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed]
    });
}
