import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
                    await interaction.reply({
                        content: '❌ Subcommand không hợp lệ!',
                        ephemeral: true
                    });
            }

            logger.command('feedback', interaction.user.id, interaction.guildId);
        } catch (error) {
            logger.error('Feedback command error', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xử lý lệnh feedback!',
                ephemeral: true
            });
        }
    }
};

/**
 * Load feedbacks from file
 */
function loadFeedbacks() {
    const feedbackDir = path.join(__dirname, '..', '..', 'feedback');
    const feedbackFile = path.join(feedbackDir, 'feedbacks.json');

    if (!fs.existsSync(feedbackFile)) {
        return [];
    }

    const data = fs.readFileSync(feedbackFile, 'utf8');
    return JSON.parse(data);
}

/**
 * Load bug reports from file
 */
function loadBugReports() {
    const feedbackDir = path.join(__dirname, '..', '..', 'feedback');
    const bugReportFile = path.join(feedbackDir, 'bug-reports.json');

    if (!fs.existsSync(bugReportFile)) {
        return [];
    }

    const data = fs.readFileSync(bugReportFile, 'utf8');
    return JSON.parse(data);
}

/**
 * Save bug reports to file
 */
function saveBugReports(bugReports) {
    const feedbackDir = path.join(__dirname, '..', '..', 'feedback');
    const bugReportFile = path.join(feedbackDir, 'bug-reports.json');

    if (!fs.existsSync(feedbackDir)) {
        fs.mkdirSync(feedbackDir, { recursive: true });
    }

    fs.writeFileSync(bugReportFile, JSON.stringify(bugReports, null, 2));
}

/**
 * Handle feedback list
 */
async function handleFeedbackList(interaction, client) {
    const feedbacks = loadFeedbacks();

    if (feedbacks.length === 0) {
        return interaction.reply({
            content: '📝 Chưa có feedback nào!',
            ephemeral: true
        });
    }

    const page = interaction.options.getInteger('page') || 1;
    const perPage = 5;
    const totalPages = Math.ceil(feedbacks.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;

    const pageFeedbacks = feedbacks.slice(start, end);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📝 Danh sách Feedbacks')
        .setDescription(`Tổng: **${feedbacks.length}** feedbacks`)
        .setFooter({ text: `${client.config.bot.footer} • Trang ${page}/${totalPages}` })
        .setTimestamp();

    for (const feedback of pageFeedbacks) {
        const date = new Date(feedback.timestamp).toLocaleString('vi-VN');
        embed.addFields({
            name: `#${feedback.id} - ${feedback.subject}`,
            value:
                `👤 ${feedback.user.tag}\n` +
                `🏢 ${feedback.guild.name}\n` +
                `📅 ${date}\n` +
                `📄 ${feedback.content.substring(0, 100)}${feedback.content.length > 100 ? '...' : ''}`,
            inline: false
        });
    }

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

/**
 * Handle feedback view
 */
async function handleFeedbackView(interaction, client) {
    const id = interaction.options.getInteger('id');
    const feedbacks = loadFeedbacks();
    const feedback = feedbacks.find(f => f.id === id);

    if (!feedback) {
        return interaction.reply({
            content: `❌ Không tìm thấy feedback với ID ${id}!`,
            ephemeral: true
        });
    }

    const date = new Date(feedback.timestamp).toLocaleString('vi-VN');

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`📝 Feedback #${feedback.id}`)
        .addFields([
            { name: '📌 Tiêu đề', value: feedback.subject, inline: false },
            { name: '👤 Người gửi', value: `${feedback.user.tag} (${feedback.user.id})`, inline: true },
            { name: '🏢 Server', value: feedback.guild.name, inline: true },
            { name: '📅 Thời gian', value: date, inline: true },
            { name: '📄 Nội dung', value: feedback.content, inline: false },
            { name: '📞 Liên hệ', value: feedback.contact, inline: false }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

/**
 * Handle bug list
 */
async function handleBugList(interaction, client) {
    const bugReports = loadBugReports();

    if (bugReports.length === 0) {
        return interaction.reply({
            content: '🐛 Chưa có bug report nào!',
            ephemeral: true
        });
    }

    const page = interaction.options.getInteger('page') || 1;
    const perPage = 5;
    const totalPages = Math.ceil(bugReports.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;

    const pageBugs = bugReports.slice(start, end);

    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🐛 Danh sách Bug Reports')
        .setDescription(`Tổng: **${bugReports.length}** bug reports`)
        .setFooter({ text: `${client.config.bot.footer} • Trang ${page}/${totalPages}` })
        .setTimestamp();

    for (const bug of pageBugs) {
        const date = new Date(bug.timestamp).toLocaleString('vi-VN');
        const statusEmoji = bug.status === 'RESOLVED' ? '✅' : '🔴';
        embed.addFields({
            name: `${statusEmoji} #${bug.id} - ${bug.title}`,
            value: `👤 ${bug.user.tag}\n` + `🏢 ${bug.guild.name}\n` + `📅 ${date}\n` + `📊 Status: **${bug.status}**`,
            inline: false
        });
    }

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

/**
 * Handle bug view
 */
async function handleBugView(interaction, client) {
    const id = interaction.options.getInteger('id');
    const bugReports = loadBugReports();
    const bug = bugReports.find(b => b.id === id);

    if (!bug) {
        return interaction.reply({
            content: `❌ Không tìm thấy bug report với ID ${id}!`,
            ephemeral: true
        });
    }

    const date = new Date(bug.timestamp).toLocaleString('vi-VN');
    const statusEmoji = bug.status === 'RESOLVED' ? '✅' : '🔴';

    const embed = new EmbedBuilder()
        .setColor(bug.status === 'RESOLVED' ? '#00FF00' : '#FF6B6B')
        .setTitle(`${statusEmoji} Bug Report #${bug.id}`)
        .addFields([
            { name: '🐛 Tên lỗi', value: bug.title, inline: false },
            { name: '👤 Người báo cáo', value: `${bug.user.tag} (${bug.user.id})`, inline: true },
            { name: '🏢 Server', value: bug.guild.name, inline: true },
            { name: '📅 Thời gian', value: date, inline: true },
            { name: '📊 Status', value: `**${bug.status}**`, inline: true },
            { name: '📝 Các bước tái hiện', value: bug.steps, inline: false },
            { name: '✅ Kết quả mong đợi', value: bug.expected, inline: true },
            { name: '❌ Kết quả thực tế', value: bug.actual, inline: true },
            { name: '📞 Liên hệ', value: bug.contact, inline: false }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

/**
 * Handle bug resolve
 */
async function handleBugResolve(interaction, client) {
    const id = interaction.options.getInteger('id');
    const bugReports = loadBugReports();
    const bugIndex = bugReports.findIndex(b => b.id === id);

    if (bugIndex === -1) {
        return interaction.reply({
            content: `❌ Không tìm thấy bug report với ID ${id}!`,
            ephemeral: true
        });
    }

    const bug = bugReports[bugIndex];

    if (bug.status === 'RESOLVED') {
        return interaction.reply({
            content: `✅ Bug report #${id} đã được resolve trước đó!`,
            ephemeral: true
        });
    }

    // Update status
    bugReports[bugIndex].status = 'RESOLVED';
    bugReports[bugIndex].resolvedAt = new Date().toISOString();
    bugReports[bugIndex].resolvedBy = interaction.user.tag;

    saveBugReports(bugReports);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Bug Report Resolved')
        .setDescription(`Bug report **#${id}** đã được đánh dấu là đã giải quyết!`)
        .addFields([
            { name: '🐛 Lỗi', value: bug.title, inline: false },
            { name: '👤 Resolved by', value: interaction.user.tag, inline: true },
            { name: '📅 Resolved at', value: new Date().toLocaleString('vi-VN'), inline: true }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

/**
 * Handle stats
 */
async function handleStats(interaction, client) {
    const feedbacks = loadFeedbacks();
    const bugReports = loadBugReports();

    const openBugs = bugReports.filter(b => b.status === 'OPEN').length;
    const resolvedBugs = bugReports.filter(b => b.status === 'RESOLVED').length;

    // Get date range
    const allItems = [...feedbacks, ...bugReports];
    const dates = allItems.map(item => new Date(item.timestamp)).sort((a, b) => a - b);
    const firstDate = dates.length > 0 ? dates[0].toLocaleDateString('vi-VN') : 'N/A';
    const lastDate = dates.length > 0 ? dates[dates.length - 1].toLocaleDateString('vi-VN') : 'N/A';

    // Top reporters
    const reporters = {};
    for (const item of allItems) {
        const tag = item.user.tag;
        reporters[tag] = (reporters[tag] || 0) + 1;
    }
    const topReporters =
        Object.entries(reporters)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag, count]) => `**${tag}**: ${count}`)
            .join('\n') || 'Chưa có dữ liệu';

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle('📊 Thống kê Feedback & Bug Reports')
        .addFields([
            { name: '📝 Feedbacks', value: `**${feedbacks.length}** feedbacks`, inline: true },
            { name: '🐛 Bug Reports', value: `**${bugReports.length}** reports`, inline: true },
            { name: '📈 Tổng', value: `**${feedbacks.length + bugReports.length}** items`, inline: true },
            { name: '🔴 Open Bugs', value: `**${openBugs}**`, inline: true },
            { name: '✅ Resolved Bugs', value: `**${resolvedBugs}**`, inline: true },
            {
                name: '📊 Resolve Rate',
                value:
                    bugReports.length > 0 ? `**${Math.round((resolvedBugs / bugReports.length) * 100)}%**` : '**N/A**',
                inline: true
            },
            { name: '📅 Khoảng thời gian', value: `${firstDate} - ${lastDate}`, inline: false },
            { name: '🏆 Top Contributors', value: topReporters, inline: false }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}
