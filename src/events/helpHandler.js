import {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import logger from '../utils/logger.js';
import { COLORS } from '../config/design-system.js';
import { HELP_CATEGORY_OPTIONS } from '../config/help-categories.js';
import path from 'path';
import { fileURLToPath } from 'url';
import FeedbackSubmission from '../database/models/FeedbackSubmission.js';
import BugReport from '../database/models/BugReport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Handle showing the main help menu (from button click)
 * Uses categories from help.js command for single source of truth
 */
export async function handleShowHelpMenu(interaction, client) {
    try {
        const helpCommand = client.commands.get('help');
        if (!helpCommand?.categories) {
            return await interaction.reply({
                content: '❌ Không thể tải menu trợ giúp!',
                ephemeral: true
            });
        }

        const categories = helpCommand.categories;

        // Build select menu using help.js categories
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('📂 Chọn danh mục lệnh...')
            .addOptions(HELP_CATEGORY_OPTIONS);

        // Build action buttons
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('help_feedback')
                .setLabel('Gửi góp ý')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✉️'),
            new ButtonBuilder()
                .setCustomId('help_report')
                .setLabel('Báo cáo lỗi')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🐛'),
            new ButtonBuilder()
                .setLabel('GitHub')
                .setStyle(ButtonStyle.Link)
                .setURL('https://github.com/khuongit24/Miyao-Bot')
                .setEmoji('💻')
        );

        // Create embed using home category from help.js
        const homeCategory = categories.home;
        const embed = new EmbedBuilder()
            .setColor(client.config?.bot?.color || COLORS.PRIMARY)
            .setTitle(`${homeCategory.emoji} ${homeCategory.title}`)
            .setDescription(homeCategory.description)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({
                text: `${client.config?.bot?.footer || client.user.username} • Version ${client.config?.bot?.version || '1.0'}`,
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.update({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
        });

        logger.debug(`Help menu shown to ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Handle show help menu error', error);
        await interaction
            .reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị menu trợ giúp!',
                ephemeral: true
            })
            .catch(() => {});
    }
}

/**
 * Handle showing all commands list (from button click)
 */
export async function handleShowAllCommands(interaction, client) {
    try {
        // Get all commands from the client
        const commands = [...client.commands.values()];

        // Group commands by category
        const categories = {};
        const categoryEmojis = {
            music: '🎵',
            queue: '📋',
            playlist: '📁',
            discovery: '🔍',
            filters: '🎛️',
            settings: '⚙️',
            social: '👥',
            stats: '📊',
            admin: '🔧'
        };

        for (const cmd of commands) {
            // Infer category from command path or use 'other'
            let category = 'other';
            if (cmd.filePath) {
                const pathMatch = cmd.filePath.match(/commands[/\\]([^/\\]+)[/\\]/);
                if (pathMatch) {
                    category = pathMatch[1].toLowerCase();
                }
            } else if (cmd.data?.name) {
                // Try to infer from command name
                const name = cmd.data.name.toLowerCase();
                if (
                    ['play', 'pause', 'resume', 'stop', 'skip', 'seek', 'volume', 'nowplaying', 'replay'].includes(name)
                ) {
                    category = 'music';
                } else if (['queue', 'clear', 'shuffle', 'loop', 'remove', 'move', 'jump'].includes(name)) {
                    category = 'queue';
                } else if (['playlist'].includes(name)) {
                    category = 'playlist';
                } else if (['discover', 'similar', 'trending', 'lyrics'].includes(name)) {
                    category = 'discovery';
                } else if (['filter', 'autoplay'].includes(name)) {
                    category = 'filters';
                } else if (['settings', 'dj'].includes(name)) {
                    category = 'settings';
                } else if (['share', 'history'].includes(name)) {
                    category = 'social';
                } else if (['mystats', 'serverstats', 'leaderboard', 'toptracks'].includes(name)) {
                    category = 'stats';
                } else if (['help', 'ping', 'nodes', 'metrics'].includes(name)) {
                    category = 'admin';
                }
            }

            if (!categories[category]) {
                categories[category] = [];
            }

            categories[category].push(cmd.data?.name || 'unknown');
        }

        // Build embed with all commands
        const embed = new EmbedBuilder()
            .setColor(client.config?.bot?.color || COLORS.PRIMARY)
            .setAuthor({
                name: `${client.user.username} - Tất cả lệnh`,
                iconURL: client.user.displayAvatarURL()
            })
            .setTitle('📋 Danh sách tất cả lệnh')
            .setDescription(
                `Tổng cộng **${commands.length}** lệnh có sẵn.\n` +
                    'Dùng `/help command:<tên lệnh>` để xem chi tiết.\n\n'
            )
            .setFooter({
                text: `${client.config?.bot?.footer || client.user.username}`,
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        // Add each category as a field
        const sortedCategories = [
            'music',
            'queue',
            'playlist',
            'discovery',
            'filters',
            'settings',
            'social',
            'stats',
            'admin',
            'other'
        ];

        for (const categoryKey of sortedCategories) {
            const cmdList = categories[categoryKey];
            if (cmdList && cmdList.length > 0) {
                const emoji = categoryEmojis[categoryKey] || '📁';
                const categoryName = categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
                const commandsStr = cmdList
                    .sort()
                    .map(c => `\`/${c}\``)
                    .join(' ');

                embed.addFields({
                    name: `${emoji} ${categoryName} (${cmdList.length})`,
                    value: commandsStr.length > 1024 ? commandsStr.slice(0, 1020) + '...' : commandsStr,
                    inline: false
                });
            }
        }

        // Build navigation button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('help_show_menu')
                .setLabel('Về Menu chính')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🏠'),
            new ButtonBuilder()
                .setCustomId('help_feedback')
                .setLabel('Gửi góp ý')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✉️'),
            new ButtonBuilder()
                .setCustomId('help_report')
                .setLabel('Báo cáo lỗi')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🐛')
        );

        await interaction.update({
            embeds: [embed],
            components: [row]
        });

        logger.debug(`All commands list shown to ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Handle show all commands error', error);
        await interaction
            .reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị danh sách lệnh!',
                ephemeral: true
            })
            .catch(() => {});
    }
}

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
                content: '❌ Danh mục không tồn tại!',
                ephemeral: true
            });
        }

        // Create embed for selected category
        const embed = new EmbedBuilder()
            .setColor(client.config?.bot?.color || COLORS.PRIMARY)
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
        await interaction
            .reply({
                content: '❌ Đã xảy ra lỗi khi xử lý category!',
                ephemeral: true
            })
            .catch(() => {});
    }
}

/**
 * Handle feedback button - Show modal
 */
export async function handleFeedback(interaction, client) {
    try {
        // Create modal
        const modal = new ModalBuilder().setCustomId('feedback_modal').setTitle('📝 Gửi góp ý cho Miyao Bot');

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
        await interaction
            .reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị form góp ý!',
                ephemeral: true
            })
            .catch(() => {});
    }
}

/**
 * Handle bug report button - Show modal
 */
export async function handleBugReport(interaction, client) {
    try {
        // Create modal
        const modal = new ModalBuilder().setCustomId('bugreport_modal').setTitle('🐛 Báo cáo lỗi Miyao Bot');

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
        await interaction
            .reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị form báo cáo lỗi!',
                ephemeral: true
            })
            .catch(() => {});
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

        if (subject.length > 100) {
            return interaction.reply({
                content: '❌ Tiêu đề không được vượt quá 100 ký tự!',
                ephemeral: true
            });
        }

        if (content.length > 2000) {
            return interaction.reply({
                content: '❌ Nội dung không được vượt quá 2000 ký tự!',
                ephemeral: true
            });
        }

        // Check last submission from this user (rate limit: 1 per minute)
        const userLastFeedback = await FeedbackSubmission.getLastByUser(interaction.user.id);

        if (userLastFeedback) {
            const timeSinceLastFeedback = Date.now() - new Date(userLastFeedback.created_at).getTime();
            if (timeSinceLastFeedback < 60000) {
                // 1 minute cooldown
                const remainingTime = Math.ceil((60000 - timeSinceLastFeedback) / 1000);
                return interaction.reply({
                    content: `⏳ Vui lòng đợi ${remainingTime}s trước khi gửi feedback tiếp theo!`,
                    ephemeral: true
                });
            }
        }

        const feedbackId = await FeedbackSubmission.create({
            type: 'FEEDBACK',
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            username: interaction.user.username,
            guildId: interaction.guildId || 'DM',
            guildName: interaction.guild?.name || 'Direct Message',
            subject,
            content,
            contact
        });

        if (!feedbackId) {
            return interaction.reply({
                content: '❌ Không thể lưu feedback! Vui lòng thử lại sau.',
                ephemeral: true
            });
        }

        // Send confirmation
        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle('✅ Góp ý đã được gửi!')
            .setDescription(
                `Cảm ơn **${interaction.user.username}** đã gửi góp ý cho Miyao Bot!\n\n` +
                    `**Tiêu đề:** ${subject}\n\n` +
                    'Chúng mình sẽ xem xét và cải thiện bot dựa trên góp ý của bạn. ' +
                    'Bạn có thể theo dõi tiến trình tại [GitHub](https://github.com/khuongit24).'
            )
            .addFields([
                { name: '📝 Feedback ID', value: `#${feedbackId}`, inline: true },
                { name: '📅 Thời gian', value: new Date().toLocaleString('vi-VN'), inline: true }
            ])
            .setFooter({ text: `${client.config.bot.footer} • Cảm ơn bạn đã đóng góp!` })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        logger.info(
            `Feedback #${feedbackId} received from ${interaction.user.tag} (${interaction.user.id}): "${subject}"`
        );
    } catch (error) {
        logger.error('Feedback submit handler error', error);

        // Try to respond if not already replied
        const errorMessage = '❌ Đã xảy ra lỗi không mong muốn! Vui lòng báo cáo cho admin.';
        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    content: errorMessage,
                    ephemeral: true
                })
                .catch(() => {});
        } else {
            await interaction
                .followUp({
                    content: errorMessage,
                    ephemeral: true
                })
                .catch(() => {});
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

        // FIX-EV-C01: Migrated from JSON file to database to eliminate read/write race conditions
        // Check for duplicate bug reports (same user, similar title, within 5 minutes)
        const recentBugs = await BugReport.getRecentByUser(interaction.user.id, 300000);
        const isDuplicate = recentBugs.some(b => b.title.toLowerCase() === title.toLowerCase());

        if (isDuplicate) {
            return interaction.reply({
                content: '⚠️ Bạn đã báo cáo lỗi tương tự gần đây! Vui lòng đợi trước khi gửi lại.',
                ephemeral: true
            });
        }

        // Rate limit check (1 per minute)
        const lastBug = await BugReport.getLastByUser(interaction.user.id);

        if (lastBug) {
            const timeSinceLastBug = Date.now() - new Date(lastBug.created_at).getTime();
            if (timeSinceLastBug < 60000) {
                const remainingTime = Math.ceil((60000 - timeSinceLastBug) / 1000);
                return interaction.reply({
                    content: `⏳ Vui lòng đợi ${remainingTime}s trước khi gửi bug report tiếp theo!`,
                    ephemeral: true
                });
            }
        }

        // Create bug report in database (atomic — no race condition)
        const bugReportId = await BugReport.create({
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            username: interaction.user.username,
            guildId: interaction.guildId || 'DM',
            guildName: interaction.guild?.name || 'Direct Message',
            title,
            steps,
            expected,
            actual,
            contact,
            status: 'OPEN',
            severity: 'MEDIUM'
        });

        if (!bugReportId) {
            return interaction.reply({
                content: '❌ Không thể lưu bug report! Vui lòng thử lại sau.',
                ephemeral: true
            });
        }

        // Send confirmation
        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle('🐛 Báo cáo lỗi đã được gửi!')
            .setDescription(
                `Cảm ơn **${interaction.user.username}** đã báo cáo lỗi!\n\n` +
                    `**Lỗi:** ${title}\n\n` +
                    'Chúng mình sẽ kiểm tra và sửa lỗi này càng sớm càng tốt. ' +
                    'Bạn có thể theo dõi tiến trình tại [GitHub Issues](https://github.com/khuongit24/Miyao-Bot/issues).'
            )
            .addFields([
                { name: '🐛 Bug ID', value: `#${bugReportId}`, inline: true },
                { name: '📊 Trạng thái', value: '🔴 Đang mở', inline: true },
                { name: '📅 Thời gian', value: new Date().toLocaleString('vi-VN'), inline: true }
            ])
            .setFooter({ text: `${client.config.bot.footer} • Cảm ơn bạn đã giúp cải thiện bot!` })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        logger.warn(
            `Bug Report #${bugReportId} received from ${interaction.user.tag} (${interaction.user.id}): "${title}"`
        );
    } catch (error) {
        logger.error('Bug report submit handler error', error);

        // Try to respond if not already replied
        const errorMessage = '❌ Đã xảy ra lỗi không mong muốn! Vui lòng báo cáo trực tiếp cho admin.';
        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    content: errorMessage,
                    ephemeral: true
                })
                .catch(() => {});
        } else {
            await interaction
                .followUp({
                    content: errorMessage,
                    ephemeral: true
                })
                .catch(() => {});
        }
    }
}
