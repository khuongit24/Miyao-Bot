import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import logger from '../../utils/logger.js';

// Command categories with details
const categories = {
    home: {
        emoji: '🏠',
        title: 'Trang chủ',
        description: 'Chào mừng bạn đến với Miyao Music Bot!\n\n' +
                    '**Miyao** là bot phát nhạc độc quyền cho server lười với các tính năng:\n' +
                    '• 🎵 Phát nhạc từ nhiều nguồn (YouTube, Spotify, SoundCloud...)\n' +
                    '• 🎚️ Bộ lọc âm thanh chuyên nghiệp (8 options)\n' +
                    '• 📊 Giám sát hiệu suất real-time\n' +
                    '• 🔄 Auto-reconnect và error recovery\n' +
                    '• 💾 Lịch sử phát nhạc\n\n' +
                    '**Chọn category từ menu bên dưới để xem chi tiết!**'
    },
    playback: {
        emoji: '🎶',
        title: 'Lệnh phát nhạc',
        description: '**Các lệnh điều khiển phát nhạc:**\n\n' +
                    '`/play <query>` - Phát nhạc (URL hoặc tìm kiếm)\n' +
                    '`/pause` - Tạm dừng phát nhạc\n' +
                    '`/resume` - Tiếp tục phát nhạc\n' +
                    '`/skip` - Bỏ qua bài hiện tại\n' +
                    '`/stop` - Dừng và xóa hàng đợi\n' +
                    '`/nowplaying` - Thông tin bài đang phát\n\n' +
                    '**Ví dụ:**\n' +
                    '• `/play blue yung kai` - Tìm kiếm và phát\n' +
                    '• `/play https://youtube.com/watch?v=...` - Phát từ URL'
    },
    queue: {
        emoji: '📋',
        title: 'Quản lý hàng đợi',
        description: '**Các lệnh quản lý hàng đợi:**\n\n' +
                    '`/queue [page]` - Xem hàng đợi (pagination)\n' +
                    '`/shuffle` - Xáo trộn hàng đợi\n' +
                    '`/clear` - Xóa toàn bộ hàng đợi\n' +
                    '`/remove <position>` - Xóa bài tại vị trí\n' +
                    '`/move <from> <to>` - Di chuyển bài trong queue\n' +
                    '`/jump <position>` - Nhảy tới bài và phát ngay\n' +
                    '`/history` - Xem lịch sử đã phát\n\n' +
                    '**Lưu ý:** Vị trí bắt đầu từ 1'
    },
    control: {
        emoji: '🎛️',
        title: 'Điều khiển âm thanh',
        description: '**Các lệnh điều chỉnh âm thanh:**\n\n' +
                    '`/volume <0-100>` - Điều chỉnh âm lượng\n' +
                    '`/loop <mode>` - Chế độ lặp\n' +
                    '  • `off` - Tắt lặp\n' +
                    '  • `track` - Lặp bài hiện tại\n' +
                    '  • `queue` - Lặp cả queue\n' +
                    '`/seek <time>` - Tua đến thời điểm (MM:SS)\n' +
                    '`/filter <option>` - Áp dụng audio filter\n' +
                    '  • Equalizers: `bass`, `pop`, `jazz`, `rock`\n' +
                    '  • Effects: `nightcore`, `vaporwave`, `8d`\n' +
                    '  • `clear` - Xóa tất cả filters'
    },
    info: {
        emoji: '📊',
        title: 'Thông tin & Giám sát',
        description: '**Các lệnh thông tin:**\n\n' +
                    '`/help` - Hiển thị hướng dẫn này\n' +
                    '`/ping` - Kiểm tra độ trễ bot\n' +
                    '`/stats` - Thống kê hiệu suất bot\n' +
                    '  • Cache hit rate, memory usage\n' +
                    '  • Active queues, node health\n' +
                    '`/nodes` - Trạng thái Lavalink nodes\n' +
                    '  • CPU/Memory per node\n' +
                    '  • Health score (0-100)\n' +
                    '  • Best node recommendation'
    },
    tips: {
        emoji: '💡',
        title: 'Tips & Tricks',
        description: '**Mẹo sử dụng hiệu quả:**\n\n' +
                    '🔊 **Voice Channel:**\n' +
                    '• Bạn phải ở trong voice channel để sử dụng\n' +
                    '• Bot tự động rời khi kênh trống (5 phút)\n\n' +
                    '🎵 **Nguồn nhạc:**\n' +
                    '• YouTube, Spotify, SoundCloud\n' +
                    '• Hỗ trợ playlist (auto-queue)\n' +
                    '• Tìm kiếm thông minh với 5 kết quả\n\n' +
                    '🎚️ **Audio Quality:**\n' +
                    '• Sử dụng filters để tùy chỉnh âm thanh\n' +
                    '• Nightcore/Vaporwave cho hiệu ứng đặc biệt\n' +
                    '• 8D audio cho trải nghiệm không gian\n\n' +
                    '⚡ **Performance:**\n' +
                    '• Bot có caching thông minh (94% faster)\n' +
                    '• Auto-recovery khi bị disconnect\n' +
                    '• Health monitoring cho stability'
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Hiển thị danh sách lệnh và hướng dẫn sử dụng'),
    
    async execute(interaction, client) {
        try {
            // Create dropdown menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('help_category')
                .setPlaceholder('📚 Chọn category để xem chi tiết')
                .addOptions([
                    {
                        label: 'Trang chủ',
                        description: 'Giới thiệu về Miyao Music Bot',
                        value: 'home',
                        emoji: '🏠'
                    },
                    {
                        label: 'Phát nhạc',
                        description: 'Lệnh điều khiển phát nhạc cơ bản',
                        value: 'playback',
                        emoji: '🎶'
                    },
                    {
                        label: 'Quản lý Queue',
                        description: 'Lệnh quản lý hàng đợi nhạc',
                        value: 'queue',
                        emoji: '📋'
                    },
                    {
                        label: 'Điều khiển âm thanh',
                        description: 'Volume, loop, seek, filters',
                        value: 'control',
                        emoji: '🎛️'
                    },
                    {
                        label: 'Thông tin & Giám sát',
                        description: 'Stats, nodes, ping',
                        value: 'info',
                        emoji: '📊'
                    },
                    {
                        label: 'Tips & Tricks',
                        description: 'Mẹo sử dụng hiệu quả',
                        value: 'tips',
                        emoji: '💡'
                    }
                ]);
            
            // Create action buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
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
                .setFooter({ text: `${client.config.bot.footer}` })
                .setTimestamp();
            
            await interaction.reply({
                embeds: [embed],
                components: [
                    new ActionRowBuilder().addComponents(selectMenu),
                    buttons
                ]
            });
            
            logger.command('help', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Help command error', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi hiển thị hướng dẫn!',
                ephemeral: true
            });
        }
    },
    
    // Category data for handler
    categories
};
