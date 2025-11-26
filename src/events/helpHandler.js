import { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Handle help category selection from dropdown
 */
export async function handleHelpCategory(interaction, client) {
    try {
        const categoryValue = interaction.values[0];
        const helpCommand = client.commands.get('help');
        const category = helpCommand.categories[categoryValue];
        
        if (!category) {
            return await interaction.reply({
                content: '❌ Category không tồn tại!',
                ephemeral: true
            });
        }
        
        // Create embed for selected category
        const embed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle(`${category.emoji} ${category.title}`)
            .setDescription(category.description)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: `${client.config.bot.footer} • Version ${client.config.bot.version}` })
            .setTimestamp();
        
        // Update the message with new embed (keep components)
        await interaction.update({
            embeds: [embed]
        });
        
        logger.debug(`Help category selected: ${categoryValue} by ${interaction.user.tag}`);
        
    } catch (error) {
        logger.error('Help category handler error', error);
        await interaction.reply({
            content: '❌ Đã xảy ra lỗi khi xử lý category!',
            ephemeral: true
        }).catch(() => {});
    }
}

/**
 * Handle feedback button - Show modal
 */
export async function handleFeedback(interaction, client) {
    try {
        // Create modal
        const modal = new ModalBuilder()
            .setCustomId('feedback_modal')
            .setTitle('📝 Gửi góp ý cho Miyao Bot');
        
        // Create input fields
        const subjectInput = new TextInputBuilder()
            .setCustomId('feedback_subject')
            .setLabel('Tiêu đề')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('VD: Đề xuất thêm tính năng playlist')
            .setRequired(true)
            .setMaxLength(100);
        
        const contentInput = new TextInputBuilder()
            .setCustomId('feedback_content')
            .setLabel('Nội dung góp ý')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Mô tả chi tiết góp ý của bạn...')
            .setRequired(true)
            .setMaxLength(1000);
        
        const contactInput = new TextInputBuilder()
            .setCustomId('feedback_contact')
            .setLabel('Thông tin liên hệ (tùy chọn)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Email hoặc Discord username')
            .setRequired(false)
            .setMaxLength(100);
        
        // Add inputs to action rows
        const row1 = new ActionRowBuilder().addComponents(subjectInput);
        const row2 = new ActionRowBuilder().addComponents(contentInput);
        const row3 = new ActionRowBuilder().addComponents(contactInput);
        
        modal.addComponents(row1, row2, row3);
        
        // Show modal
        await interaction.showModal(modal);
        
        logger.debug(`Feedback modal shown to ${interaction.user.tag}`);
        
    } catch (error) {
        logger.error('Feedback handler error', error);
        await interaction.reply({
            content: '❌ Đã xảy ra lỗi khi hiển thị form góp ý!',
            ephemeral: true
        }).catch(() => {});
    }
}

/**
 * Handle bug report button - Show modal
 */
export async function handleBugReport(interaction, client) {
    try {
        // Create modal
        const modal = new ModalBuilder()
            .setCustomId('bugreport_modal')
            .setTitle('🐛 Báo cáo lỗi Miyao Bot');
        
        // Create input fields
        const titleInput = new TextInputBuilder()
            .setCustomId('bug_title')
            .setLabel('Tên lỗi')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('VD: Bot bị disconnect khi skip bài')
            .setRequired(true)
            .setMaxLength(100);
        
        const stepsInput = new TextInputBuilder()
            .setCustomId('bug_steps')
            .setLabel('Các bước tái hiện lỗi')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('1. Vào voice channel\n2. /play một bài\n3. /skip\n4. Bot disconnect')
            .setRequired(true)
            .setMaxLength(500);
        
        const expectedInput = new TextInputBuilder()
            .setCustomId('bug_expected')
            .setLabel('Kết quả mong đợi')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Bot nên phát bài tiếp theo trong queue')
            .setRequired(true)
            .setMaxLength(200);
        
        const actualInput = new TextInputBuilder()
            .setCustomId('bug_actual')
            .setLabel('Kết quả thực tế')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Bot bị disconnect khỏi voice channel')
            .setRequired(true)
            .setMaxLength(200);
        
        const contactInput = new TextInputBuilder()
            .setCustomId('bug_contact')
            .setLabel('Thông tin liên hệ (tùy chọn)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Discord username để liên hệ nếu cần')
            .setRequired(false)
            .setMaxLength(100);
        
        // Add inputs to action rows
        const row1 = new ActionRowBuilder().addComponents(titleInput);
        const row2 = new ActionRowBuilder().addComponents(stepsInput);
        const row3 = new ActionRowBuilder().addComponents(expectedInput);
        const row4 = new ActionRowBuilder().addComponents(actualInput);
        const row5 = new ActionRowBuilder().addComponents(contactInput);
        
        modal.addComponents(row1, row2, row3, row4, row5);
        
        // Show modal
        await interaction.showModal(modal);
        
        logger.debug(`Bug report modal shown to ${interaction.user.tag}`);
        
    } catch (error) {
        logger.error('Bug report handler error', error);
        await interaction.reply({
            content: '❌ Đã xảy ra lỗi khi hiển thị form báo cáo lỗi!',
            ephemeral: true
        }).catch(() => {});
    }
}

/**
 * Handle feedback modal submission
 */
export async function handleFeedbackSubmit(interaction, client) {
    try {
        // Get form data with validation
        const subject = interaction.fields.getTextInputValue('feedback_subject')?.trim();
        const content = interaction.fields.getTextInputValue('feedback_content')?.trim();
        const contact = interaction.fields.getTextInputValue('feedback_contact')?.trim() || 'Không cung cấp';
        
        // Validate inputs
        if (!subject || subject.length < 5) {
            return interaction.reply({
                content: '❌ Tiêu đề phải có ít nhất 5 ký tự!',
                ephemeral: true
            });
        }
        
        if (!content || content.length < 10) {
            return interaction.reply({
                content: '❌ Nội dung phải có ít nhất 10 ký tự!',
                ephemeral: true
            });
        }
        
        // Check for spam (same user submitting too frequently)
        const feedbackDir = path.join(__dirname, '..', '..', 'feedback');
        if (!fs.existsSync(feedbackDir)) {
            fs.mkdirSync(feedbackDir, { recursive: true });
        }
        
        const feedbackFile = path.join(feedbackDir, 'feedbacks.json');
        let feedbacks = [];
        
        if (fs.existsSync(feedbackFile)) {
            try {
                const data = fs.readFileSync(feedbackFile, 'utf8');
                feedbacks = JSON.parse(data);
            } catch (parseError) {
                logger.warn('Failed to parse feedbacks.json, creating new file');
                feedbacks = [];
            }
        }
        
        // Check last submission from this user (rate limit: 1 per minute)
        const userLastFeedback = feedbacks
            .filter(f => f.user.id === interaction.user.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (userLastFeedback) {
            const timeSinceLastFeedback = Date.now() - new Date(userLastFeedback.timestamp).getTime();
            if (timeSinceLastFeedback < 60000) { // 1 minute cooldown
                const remainingTime = Math.ceil((60000 - timeSinceLastFeedback) / 1000);
                return interaction.reply({
                    content: `⏳ Vui lòng đợi ${remainingTime}s trước khi gửi feedback tiếp theo!`,
                    ephemeral: true
                });
            }
        }
        
        // Create feedback entry
        const feedback = {
            type: 'FEEDBACK',
            timestamp: new Date().toISOString(),
            user: {
                id: interaction.user.id,
                tag: interaction.user.tag,
                username: interaction.user.username
            },
            guild: {
                id: interaction.guildId || 'DM',
                name: interaction.guild?.name || 'Direct Message'
            },
            subject,
            content,
            contact
        };
        
        // Generate ID (max existing ID + 1)
        const maxId = feedbacks.length > 0 ? Math.max(...feedbacks.map(f => f.id || 0)) : 0;
        feedback.id = maxId + 1;
        
        feedbacks.push(feedback);
        
        // Save with error handling
        try {
            fs.writeFileSync(feedbackFile, JSON.stringify(feedbacks, null, 2));
        } catch (writeError) {
            logger.error('Failed to write feedbacks.json', writeError);
            return interaction.reply({
                content: '❌ Không thể lưu feedback! Vui lòng thử lại sau.',
                ephemeral: true
            });
        }
        
        // Send confirmation
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Góp ý đã được gửi!')
            .setDescription(
                `Cảm ơn **${interaction.user.username}** đã gửi góp ý cho Miyao Bot!\n\n` +
                `**Tiêu đề:** ${subject}\n\n` +
                `Chúng mình sẽ xem xét và cải thiện bot dựa trên góp ý của bạn. ` +
                `Bạn có thể theo dõi tiến trình tại [GitHub](https://github.com/khuongit24).`
            )
            .addFields([
                { name: '📝 Feedback ID', value: `#${feedback.id}`, inline: true },
                { name: '📅 Thời gian', value: new Date().toLocaleString('vi-VN'), inline: true }
            ])
            .setFooter({ text: `${client.config.bot.footer} • Cảm ơn bạn đã đóng góp!` })
            .setTimestamp();
        
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
        
        logger.info(`Feedback #${feedback.id} received from ${interaction.user.tag} (${interaction.user.id}): "${subject}"`);
        
    } catch (error) {
        logger.error('Feedback submit handler error', error);
        
        // Try to respond if not already replied
        const errorMessage = '❌ Đã xảy ra lỗi không mong muốn! Vui lòng báo cáo cho admin.';
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: errorMessage,
                ephemeral: true
            }).catch(() => {});
        } else {
            await interaction.followUp({
                content: errorMessage,
                ephemeral: true
            }).catch(() => {});
        }
    }
}

/**
 * Handle bug report modal submission
 */
export async function handleBugReportSubmit(interaction, client) {
    try {
        // Get form data with validation
        const title = interaction.fields.getTextInputValue('bug_title')?.trim();
        const steps = interaction.fields.getTextInputValue('bug_steps')?.trim();
        const expected = interaction.fields.getTextInputValue('bug_expected')?.trim();
        const actual = interaction.fields.getTextInputValue('bug_actual')?.trim();
        const contact = interaction.fields.getTextInputValue('bug_contact')?.trim() || 'Không cung cấp';
        
        // Validate inputs
        if (!title || title.length < 5) {
            return interaction.reply({
                content: '❌ Tên lỗi phải có ít nhất 5 ký tự!',
                ephemeral: true
            });
        }
        
        if (!steps || steps.length < 10) {
            return interaction.reply({
                content: '❌ Các bước tái hiện phải có ít nhất 10 ký tự!',
                ephemeral: true
            });
        }
        
        if (!expected || expected.length < 5) {
            return interaction.reply({
                content: '❌ Kết quả mong đợi phải có ít nhất 5 ký tự!',
                ephemeral: true
            });
        }
        
        if (!actual || actual.length < 5) {
            return interaction.reply({
                content: '❌ Kết quả thực tế phải có ít nhất 5 ký tự!',
                ephemeral: true
            });
        }
        
        // Setup directory
        const feedbackDir = path.join(__dirname, '..', '..', 'feedback');
        if (!fs.existsSync(feedbackDir)) {
            fs.mkdirSync(feedbackDir, { recursive: true });
        }
        
        const bugReportFile = path.join(feedbackDir, 'bug-reports.json');
        let bugReports = [];
        
        if (fs.existsSync(bugReportFile)) {
            try {
                const data = fs.readFileSync(bugReportFile, 'utf8');
                bugReports = JSON.parse(data);
            } catch (parseError) {
                logger.warn('Failed to parse bug-reports.json, creating new file');
                bugReports = [];
            }
        }
        
        // Check for duplicate bug reports (same user, similar title, within 5 minutes)
        const userRecentBugs = bugReports.filter(b => {
            const timeDiff = Date.now() - new Date(b.timestamp).getTime();
            return b.user.id === interaction.user.id && timeDiff < 300000; // 5 minutes
        });
        
        const isDuplicate = userRecentBugs.some(b => 
            b.title.toLowerCase() === title.toLowerCase()
        );
        
        if (isDuplicate) {
            return interaction.reply({
                content: '⚠️ Bạn đã báo cáo lỗi tương tự gần đây! Vui lòng đợi trước khi gửi lại.',
                ephemeral: true
            });
        }
        
        // Rate limit check (1 per minute)
        const userLastBug = bugReports
            .filter(b => b.user.id === interaction.user.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (userLastBug) {
            const timeSinceLastBug = Date.now() - new Date(userLastBug.timestamp).getTime();
            if (timeSinceLastBug < 60000) { // 1 minute cooldown
                const remainingTime = Math.ceil((60000 - timeSinceLastBug) / 1000);
                return interaction.reply({
                    content: `⏳ Vui lòng đợi ${remainingTime}s trước khi gửi bug report tiếp theo!`,
                    ephemeral: true
                });
            }
        }
        
        // Create bug report entry
        const bugReport = {
            type: 'BUG_REPORT',
            timestamp: new Date().toISOString(),
            user: {
                id: interaction.user.id,
                tag: interaction.user.tag,
                username: interaction.user.username
            },
            guild: {
                id: interaction.guildId || 'DM',
                name: interaction.guild?.name || 'Direct Message'
            },
            title,
            steps,
            expected,
            actual,
            contact,
            status: 'OPEN',
            severity: 'MEDIUM' // Default severity
        };
        
        // Generate ID (max existing ID + 1)
        const maxId = bugReports.length > 0 ? Math.max(...bugReports.map(b => b.id || 0)) : 0;
        bugReport.id = maxId + 1;
        
        bugReports.push(bugReport);
        
        // Save with error handling
        try {
            fs.writeFileSync(bugReportFile, JSON.stringify(bugReports, null, 2));
        } catch (writeError) {
            logger.error('Failed to write bug-reports.json', writeError);
            return interaction.reply({
                content: '❌ Không thể lưu bug report! Vui lòng thử lại sau.',
                ephemeral: true
            });
        }
        
        // Send confirmation
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🐛 Báo cáo lỗi đã được gửi!')
            .setDescription(
                `Cảm ơn **${interaction.user.username}** đã báo cáo lỗi!\n\n` +
                `**Lỗi:** ${title}\n\n` +
                `Chúng mình sẽ kiểm tra và sửa lỗi này càng sớm càng tốt. ` +
                `Bạn có thể theo dõi tiến trình tại [GitHub Issues](https://github.com/khuongit24/issues).`
            )
            .addFields([
                { name: '🐛 Bug ID', value: `#${bugReport.id}`, inline: true },
                { name: '📊 Status', value: '🔴 OPEN', inline: true },
                { name: '📅 Thời gian', value: new Date().toLocaleString('vi-VN'), inline: true }
            ])
            .setFooter({ text: `${client.config.bot.footer} • Cảm ơn bạn đã giúp cải thiện bot!` })
            .setTimestamp();
        
        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
        
        logger.warn(`Bug Report #${bugReport.id} received from ${interaction.user.tag} (${interaction.user.id}): "${title}"`);
        
    } catch (error) {
        logger.error('Bug report submit handler error', error);
        
        // Try to respond if not already replied
        const errorMessage = '❌ Đã xảy ra lỗi không mong muốn! Vui lòng báo cáo trực tiếp cho admin.';
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: errorMessage,
                ephemeral: true
            }).catch(() => {});
        } else {
            await interaction.followUp({
                content: errorMessage,
                ephemeral: true
            }).catch(() => {});
        }
    }
}
