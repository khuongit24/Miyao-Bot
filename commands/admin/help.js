import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { COLORS } from '../../config/design-system.js';
import { HELP_CATEGORY_OPTIONS } from '../../config/help-categories.js';
import logger from '../../utils/logger.js';

// All available commands with descriptions for search
const allCommands = [
    // Playback
    {
        name: 'play',
        description: 'Phát nhạc từ URL hoặc tìm kiếm',
        category: 'playback',
        aliases: ['p', 'phát', 'nghe']
    },
    { name: 'pause', description: 'Tạm dừng phát nhạc', category: 'playback', aliases: ['tạm dừng'] },
    { name: 'resume', description: 'Tiếp tục phát nhạc', category: 'playback', aliases: ['tiếp tục', 'unpause'] },
    { name: 'skip', description: 'Bỏ qua bài hiện tại', category: 'playback', aliases: ['s', 'next', 'bỏ qua'] },
    { name: 'stop', description: 'Dừng và ngắt kết nối', category: 'playback', aliases: ['dừng', 'disconnect', 'dc'] },
    { name: 'nowplaying', description: 'Thông tin bài đang phát', category: 'playback', aliases: ['np', 'đang phát'] },
    { name: 'seek', description: 'Tua đến thời điểm', category: 'playback', aliases: ['tua'] },
    // Queue
    { name: 'queue', description: 'Xem hàng đợi phát nhạc', category: 'queue', aliases: ['q', 'hàng đợi'] },
    { name: 'shuffle', description: 'Xáo trộn hàng đợi', category: 'queue', aliases: ['xáo', 'random'] },
    { name: 'clear', description: 'Xóa toàn bộ hàng đợi', category: 'queue', aliases: ['xóa'] },
    { name: 'remove', description: 'Xóa bài tại vị trí', category: 'queue', aliases: ['rm', 'xóa bài'] },
    { name: 'move', description: 'Di chuyển bài trong queue', category: 'queue', aliases: ['mv', 'di chuyển'] },
    { name: 'jump', description: 'Nhảy tới bài và phát ngay', category: 'queue', aliases: ['nhảy', 'goto'] },
    { name: 'loop', description: 'Chế độ lặp (off/track/queue)', category: 'queue', aliases: ['repeat', 'lặp'] },
    { name: 'history', description: 'Xem lịch sử đã phát', category: 'queue', aliases: ['lịch sử'] },
    // Control
    {
        name: 'volume',
        description: 'Điều chỉnh âm lượng (0-100)',
        category: 'control',
        aliases: ['vol', 'v', 'âm lượng']
    },
    { name: 'filter', description: 'Áp dụng audio filter', category: 'control', aliases: ['f', 'hiệu ứng'] },
    {
        name: 'autoplay',
        description: 'Bật/tắt tự động phát nhạc liên quan',
        category: 'control',
        aliases: ['ap', 'auto']
    },
    // Discovery
    {
        name: 'discover',
        description: 'Gợi ý nhạc mới dựa trên sở thích',
        category: 'discovery',
        aliases: ['khám phá', 'gợi ý']
    },
    { name: 'trending', description: 'Nhạc đang thịnh hành', category: 'discovery', aliases: ['hot', 'thịnh hành'] },
    { name: 'similar', description: 'Tìm nhạc tương tự', category: 'discovery', aliases: ['tương tự', 'like'] },
    { name: 'lyrics', description: 'Xem lời bài hát', category: 'discovery', aliases: ['ly', 'lời'] },
    // Playlist
    { name: 'playlist', description: 'Quản lý playlist cá nhân', category: 'playlist', aliases: ['pl'] },
    // Stats
    { name: 'mystats', description: 'Thống kê nghe nhạc cá nhân', category: 'stats', aliases: ['thống kê'] },
    { name: 'serverstats', description: 'Thống kê server', category: 'stats', aliases: ['server'] },
    { name: 'leaderboard', description: 'Bảng xếp hạng', category: 'stats', aliases: ['lb', 'top'] },
    { name: 'stats', description: 'Thống kê bot (Admin)', category: 'stats', aliases: [] },
    { name: 'nodes', description: 'Trạng thái Lavalink nodes', category: 'stats', aliases: [] },
    // Settings
    {
        name: 'settings',
        description: 'Cài đặt cá nhân và server',
        category: 'settings',
        aliases: ['config', 'cài đặt']
    },
    // Admin
    {
        name: 'help',
        description: 'Hiển thị hướng dẫn sử dụng',
        category: 'admin',
        aliases: ['h', 'trợ giúp', 'hướng dẫn']
    },
    { name: 'ping', description: 'Kiểm tra độ trễ bot', category: 'admin', aliases: [] },
    { name: 'metrics', description: 'Dashboard hiệu năng hệ thống', category: 'admin', aliases: [] },
    { name: 'save', description: 'Lưu queue hiện tại vào playlist', category: 'queue', aliases: ['lưu'] },
    { name: 'voteskip', description: 'Bỏ phiếu skip bài hát', category: 'queue', aliases: ['vs'] },
    { name: 'feedback', description: 'Gửi góp ý hoặc báo cáo lỗi', category: 'settings', aliases: ['góp ý'] },
    // v1.11.1: Added missing commands (HELP-H01)
    {
        name: 'search',
        description: 'Tìm kiếm bài hát từ nhiều nguồn',
        category: 'discovery',
        aliases: ['tìm kiếm'],
        usage: '/search <query> [source]'
    },
    {
        name: 'replay',
        description: 'Phát lại bài hát hiện tại từ đầu',
        category: 'playback',
        aliases: ['phát lại'],
        usage: '/replay'
    },
    {
        name: 'mypreferences',
        description: 'Quản lý cài đặt cá nhân',
        category: 'settings',
        aliases: ['cài đặt cá nhân'],
        usage: '/mypreferences'
    }
];

// Command categories with details
const categories = {
    home: {
        emoji: '🏠',
        title: 'Trang chủ',
        description:
            'Chào mừng bạn đến với Miyao Music Bot!\n\n' +
            '**Miyao** là bot phát nhạc chuyên nghiệp với các tính năng:\n' +
            '• 🎵 Phát nhạc từ nhiều nguồn (YouTube, Spotify, SoundCloud...)\n' +
            '• 🎚️ Bộ lọc âm thanh chuyên nghiệp (Bass, Nightcore, 8D...)\n' +
            '• 📝 Playlist & Favorites cá nhân\n' +
            '• 📊 Thống kê nghe nhạc chi tiết\n' +
            '• 🔍 Khám phá nhạc mới & Lyrics\n' +
            '• 🔄 Auto-reconnect và error recovery\n\n' +
            '**🚀 Bắt đầu nhanh:**\n' +
            '1. Vào một kênh thoại\n' +
            '2. Gõ `/play <tên bài hát>`\n' +
            '3. Tận hưởng âm nhạc! 🎶\n\n' +
            '**Chọn category từ menu bên dưới để xem chi tiết!**\n\n' +
            '💡 **Mẹo:** Dùng `/help search <từ khóa>` để tìm lệnh nhanh!'
    },
    playback: {
        emoji: '🎶',
        title: 'Phát nhạc',
        description:
            '**Lệnh điều khiển phát nhạc:**\n\n' +
            '`/play <query>` - Phát nhạc (URL hoặc tìm kiếm)\n' +
            '`/pause` - Tạm dừng phát nhạc\n' +
            '`/resume` - Tiếp tục phát nhạc\n' +
            '`/skip` - Bỏ qua bài hiện tại\n' +
            '`/stop` - Dừng và ngắt kết nối\n' +
            '`/nowplaying` - Thông tin bài đang phát\n' +
            '`/seek <time>` - Tua đến thời điểm\n\n' +
            '**Ví dụ:**\n' +
            '• `/play blue yung kai` - Tìm kiếm và phát\n' +
            '• `/play https://youtube.com/...` - Phát từ URL'
    },
    queue: {
        emoji: '📋',
        title: 'Hàng đợi',
        description:
            '**Lệnh quản lý hàng đợi:**\n\n' +
            '`/queue [page]` - Xem hàng đợi\n' +
            '`/shuffle` - Xáo trộn hàng đợi\n' +
            '`/clear` - Xóa toàn bộ hàng đợi\n' +
            '`/remove <pos>` - Xóa bài tại vị trí\n' +
            '`/move <from> <to>` - Di chuyển bài\n' +
            '`/jump <pos>` - Nhảy tới bài và phát ngay\n' +
            '`/loop <mode>` - Chế độ lặp (off/track/queue)\n' +
            '`/history` - Xem lịch sử đã phát\n\n' +
            '**Lưu ý:** Vị trí bắt đầu từ 1'
    },
    control: {
        emoji: '🎛️',
        title: 'Âm thanh & Filters',
        description:
            '**Lệnh điều chỉnh âm thanh:**\n\n' +
            '`/volume <0-100>` - Điều chỉnh âm lượng\n' +
            '`/filter <type>` - Áp dụng audio filter\n' +
            '  • 🎸 `bass` - Bass Boost\n' +
            '  • 🎵 `pop` / 🎹 `jazz` / 🎤 `rock`\n' +
            '  • 🌙 `nightcore` - Nhanh hơn, cao hơn\n' +
            '  • 🌊 `vaporwave` - Chậm hơn, trầm hơn\n' +
            '  • 🔊 `8d` - Hiệu ứng xoay không gian\n' +
            '  • ❌ `clear` - Xóa tất cả filters\n' +
            '`/autoplay` - Bật/tắt tự động phát nhạc liên quan'
    },
    discovery: {
        emoji: '🔍',
        title: 'Khám phá',
        description:
            '**Lệnh khám phá nhạc:**\n\n' +
            '`/discover [genre] [mood]` - Gợi ý nhạc mới\n' +
            '  • Dựa trên lịch sử nghe của bạn\n' +
            '  • Lọc theo thể loại và tâm trạng\n' +
            '`/trending [region]` - Nhạc đang thịnh hành\n' +
            '  • Global, VN, Korea, Japan, US, UK\n' +
            '`/similar [query]` - Tìm nhạc tương tự\n' +
            '`/lyrics [query]` - Xem lời bài hát\n' +
            '  • Hỗ trợ lyrics đồng bộ\n\n' +
            '**Mẹo:** Để trống query để dùng bài đang phát!'
    },
    playlist: {
        emoji: '📁',
        title: 'Playlist',
        description:
            '**Quản lý playlist cá nhân:**\n\n' +
            '`/playlist create <tên>` - Tạo playlist mới\n' +
            '`/playlist list` - Xem tất cả playlist\n' +
            '`/playlist add <tên> <query>` - Thêm bài vào playlist\n' +
            '`/playlist play <tên>` - Phát playlist\n' +
            '`/playlist remove <tên> <vị trí>` - Xóa bài khỏi playlist\n' +
            '`/save <tên>` - Lưu nhanh queue hiện tại vào playlist\n\n' +
            '💡 **Mẹo:** Nhấn nút ❤️ trên Now Playing để thêm bài vào playlist yêu thích!'
    },
    stats: {
        emoji: '📊',
        title: 'Thống kê',
        description:
            '**Lệnh xem thống kê:**\n\n' +
            '`/mystats` - Thống kê cá nhân của bạn\n' +
            '  • Top bài hát, thời gian nghe\n' +
            '  • Thói quen nghe nhạc\n' +
            '`/serverstats` - Thống kê server\n' +
            '`/leaderboard` - Bảng xếp hạng\n' +
            '  • Người nghe nhiều nhất\n' +
            '  • Bài hát phổ biến nhất\n\n' +
            '**Admin:**\n' +
            '`/stats` - Thống kê bot\n' +
            '`/nodes` - Trạng thái Lavalink nodes'
    },
    settings: {
        emoji: '⚙️',
        title: 'Cài đặt',
        description:
            '**Cài đặt cá nhân:**\n\n' +
            '`/settings show` - Xem cài đặt hiện tại\n' +
            '`/settings volume <level>` - Âm lượng mặc định\n' +
            '`/settings autoresume <on/off>` - Auto-resume\n\n' +
            '**Cài đặt server (Admin):**\n' +
            '`/settings djrole <role>` - Đặt DJ role\n' +
            '`/settings djonly <on/off>` - Chế độ DJ-only\n' +
            '`/settings voteskip <on/off>` - Vote skip\n' +
            '`/settings 247 <on/off>` - Chế độ 24/7'
    },
    tips: {
        emoji: '💡',
        title: 'Tips & Tricks',
        description:
            '**Mẹo sử dụng hiệu quả:**\n\n' +
            '🔊 **Voice Channel:**\n' +
            '• Phải ở trong voice channel để sử dụng\n' +
            '• Bot tự động rời khi không có ai\n\n' +
            '🎵 **Nguồn nhạc:**\n' +
            '• YouTube, Spotify, SoundCloud\n' +
            '• Hỗ trợ playlist tự động queue\n' +
            '• Nhấn nút ❤️ để thêm vào yêu thích\n\n' +
            '🎚️ **Audio Quality:**\n' +
            '• Thử Nightcore cho nhạc sôi động\n' +
            '• 8D Audio cho trải nghiệm đặc biệt\n\n' +
            '⚡ **Shortcuts:**\n' +
            '• Click phải tin nhắn có link → "Thêm vào Queue"'
    }
};

/**
 * Search commands by keyword
 * @param {string} keyword - Search keyword
 * @returns {Array} Matching commands
 */
function searchCommands(keyword) {
    const searchLower = keyword.toLowerCase();

    return allCommands.filter(cmd => {
        // Search in name
        if (cmd.name.toLowerCase().includes(searchLower)) return true;
        // Search in description
        if (cmd.description.toLowerCase().includes(searchLower)) return true;
        // Search in aliases
        if (cmd.aliases.some(alias => alias.toLowerCase().includes(searchLower))) return true;
        return false;
    });
}

/**
 * Get category emoji
 * @param {string} categoryKey - Category key
 * @returns {string} Emoji
 */
function getCategoryEmoji(categoryKey) {
    const emojis = {
        playback: '🎶',
        queue: '📋',
        control: '🎛️',
        discovery: '🔍',
        playlist: '❤️',
        stats: '📊',
        settings: '⚙️',
        admin: '👑'
    };
    return emojis[categoryKey] || '📌';
}

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Hiển thị danh sách lệnh và hướng dẫn sử dụng')
        .addSubcommand(subcommand => subcommand.setName('menu').setDescription('Hiển thị menu help với các category'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('search')
                .setDescription('Tìm kiếm lệnh theo từ khóa')
                .addStringOption(option =>
                    option
                        .setName('keyword')
                        .setDescription('Từ khóa tìm kiếm (tên lệnh, mô tả, hoặc alias)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('command')
                .setDescription('Xem chi tiết một lệnh cụ thể')
                .addStringOption(option =>
                    option.setName('name').setDescription('Tên lệnh cần xem').setRequired(true).setAutocomplete(true)
                )
        ),

    async execute(interaction, client) {
        try {
            const subcommand = interaction.options.getSubcommand(false) || 'menu';

            if (subcommand === 'search') {
                return await handleSearchCommand(interaction, client);
            }

            if (subcommand === 'command') {
                return await handleCommandDetails(interaction, client);
            }

            // Default: show menu
            return await handleMenuCommand(interaction, client);
        } catch (error) {
            logger.error('Help command error', error);

            const errorMsg = '❌ Đã xảy ra lỗi khi hiển thị hướng dẫn!';
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMsg });
            } else {
                await interaction.reply({ content: errorMsg, ephemeral: true });
            }
        }
    },

    // Autocomplete handler for command names
    async autocomplete(interaction, client) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const filtered = allCommands
            .filter(
                cmd =>
                    cmd.name.toLowerCase().includes(focusedValue) ||
                    cmd.aliases.some(alias => alias.toLowerCase().includes(focusedValue))
            )
            .slice(0, 25);

        await interaction.respond(
            filtered.map(cmd => ({
                name: `/${cmd.name} - ${cmd.description.substring(0, 50)}`,
                value: cmd.name
            }))
        );
    },

    // Category data for handler
    categories,
    allCommands,
    searchCommands
};

/**
 * Handle menu subcommand (default help view)
 */
async function handleMenuCommand(interaction, client) {
    // Create dropdown menu
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category')
        .setPlaceholder('📚 Chọn category để xem chi tiết')
        .addOptions(HELP_CATEGORY_OPTIONS);

    // Create action buttons
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_feedback')
            .setLabel('Gửi góp ý')
            .setEmoji('✉️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('help_report')
            .setLabel('Báo cáo lỗi')
            .setEmoji('🐛')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setLabel('GitHub')
            .setEmoji('💻')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/khuongit24/Miyao-Bot')
    );

    // Create initial embed (home)
    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`${categories.home.emoji} ${categories.home.title}`)
        .setDescription(categories.home.description)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: `${client.config.bot.footer} • Tổng ${allCommands.length} lệnh` })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
    });

    logger.command('help-menu', interaction.user.id, interaction.guildId);
}

/**
 * Handle search subcommand
 */
async function handleSearchCommand(interaction, client) {
    const keyword = interaction.options.getString('keyword');
    const results = searchCommands(keyword);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`🔍 Kết quả tìm kiếm: "${keyword}"`)
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    if (results.length === 0) {
        embed.setDescription(
            `Không tìm thấy lệnh nào khớp với **"${keyword}"**\n\n` +
                '**Gợi ý:**\n' +
                '• Thử từ khóa ngắn hơn\n' +
                '• Dùng `/help menu` để xem tất cả category\n' +
                '• Thử tìm bằng tiếng Việt hoặc tiếng Anh'
        );
        embed.setColor(COLORS.WARNING);
    } else {
        const description = results
            .slice(0, 10)
            .map(cmd => {
                const emoji = getCategoryEmoji(cmd.category);
                return `${emoji} \`/${cmd.name}\` - ${cmd.description}`;
            })
            .join('\n');

        embed.setDescription(
            `Tìm thấy **${results.length}** lệnh:\n\n${description}` +
                (results.length > 10 ? `\n\n*...và ${results.length - 10} kết quả khác*` : '')
        );

        // Add aliases info
        const aliasInfo = results
            .slice(0, 5)
            .filter(cmd => cmd.aliases.length > 0)
            .map(cmd => `\`/${cmd.name}\`: ${cmd.aliases.map(a => `\`${a}\``).join(', ')}`)
            .join('\n');

        if (aliasInfo) {
            embed.addFields([
                {
                    name: '📝 Alias (từ khóa thay thế)',
                    value: aliasInfo,
                    inline: false
                }
            ]);
        }
    }

    // Quick action buttons
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_show_menu')
            .setLabel('Xem Menu')
            .setEmoji('📚')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('help_show_all_commands')
            .setLabel('Tất cả lệnh')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
        embeds: [embed],
        components: [buttons]
    });

    logger.command('help-search', interaction.user.id, interaction.guildId, { keyword, results: results.length });
}

/**
 * Handle command details subcommand
 */
async function handleCommandDetails(interaction, client) {
    const cmdName = interaction.options.getString('name').toLowerCase();
    const command = allCommands.find(cmd => cmd.name === cmdName);

    if (!command) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('❌ Lệnh không tồn tại')
            .setDescription(`Không tìm thấy lệnh \`/${cmdName}\`\n\n` + 'Dùng `/help search <từ khóa>` để tìm lệnh.')
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const emoji = getCategoryEmoji(command.category);

    const embed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`${emoji} /${command.name}`)
        .setDescription(command.description)
        .addFields([
            {
                name: '📂 Danh mục',
                value: categories[command.category]?.title || command.category,
                inline: true
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    // Add aliases if available
    if (command.aliases.length > 0) {
        embed.addFields([
            {
                name: '📝 Tên gọi khác',
                value: command.aliases.map(a => `\`${a}\``).join(', '),
                inline: true
            }
        ]);
    }

    // Add usage examples based on command
    const examples = getCommandExamples(command.name);
    if (examples) {
        embed.addFields([
            {
                name: '💡 Ví dụ sử dụng',
                value: examples,
                inline: false
            }
        ]);
    }

    await interaction.reply({ embeds: [embed] });

    logger.command('help-command', interaction.user.id, interaction.guildId, { command: cmdName });
}

/**
 * Get usage examples for a command
 */
function getCommandExamples(cmdName) {
    const examples = {
        play: '`/play blue - yung kai`\n`/play https://youtube.com/watch?v=...`\n`/play spotify:track:...`',
        seek: '`/seek 1:30` - Tua đến phút 1:30\n`/seek 2:45` - Tua đến phút 2:45\n`/seek 1:00:00` - Tua đến giờ thứ 1',
        volume: '`/volume 50` - Đặt âm lượng 50%',
        filter: '`/filter bass` - Bật bass boost\n`/filter nightcore` - Bật nightcore\n`/filter clear` - Tắt tất cả',
        loop: '`/loop track` - Lặp bài hiện tại\n`/loop queue` - Lặp toàn bộ queue\n`/loop off` - Tắt lặp',
        playlist: '`/playlist create MyPlaylist`\n`/playlist play Chill Music`\n`/playlist add MyPlaylist https://...`',
        discover: '`/discover genre:pop mood:happy` - Gợi ý nhạc pop vui vẻ',
        trending: '`/trending source:vn` - Nhạc hot tại Việt Nam',
        settings: '`/settings volume 80` - Đặt âm lượng mặc định\n`/settings djrole @DJ` - Đặt DJ role'
    };

    return examples[cmdName] || null;
}
