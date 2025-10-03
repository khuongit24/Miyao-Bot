/**
 * Auto Setup Script - Miyao Music Bot
 * Tự động cấu hình CLIENT_ID và GUILD_ID từ Discord API
 */

import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║   MIYAO BOT - AUTO SETUP                     ║');
console.log('╚══════════════════════════════════════════════╝\n');

// Check if token exists
if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN === 'your_bot_token_here') {
    console.error('❌ DISCORD_TOKEN chưa được cấu hình trong file .env!');
    console.error('📝 Vui lòng mở file .env và điền token của bạn.');
    console.error('🔗 Lấy token tại: https://discord.com/developers/applications\n');
    process.exit(1);
}

console.log('🔍 Đang kết nối tới Discord...');

// Create minimal client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Setup timeout
const timeout = setTimeout(() => {
    console.error('\n❌ Timeout: Không thể kết nối tới Discord sau 30s');
    console.error('📝 Vui lòng kiểm tra:\n');
    console.error('   1. DISCORD_TOKEN có đúng không?');
    console.error('   2. Internet connection có ổn định không?');
    console.error('   3. Discord có đang bảo trì không?\n');
    process.exit(1);
}, 30000);

client.once('clientReady', async () => {
    clearTimeout(timeout);
    
    console.log(`✅ Đã kết nối thành công!\n`);
    console.log(`📋 Thông tin Bot:`);
    console.log(`   • Tên: ${client.user.tag}`);
    console.log(`   • ID: ${client.user.id}`);
    console.log(`   • Số server: ${client.guilds.cache.size}\n`);
    
    // Get CLIENT_ID
    const clientId = client.user.id;
    
    // Get GUILD_ID (first guild)
    let guildId = 'auto';
    if (client.guilds.cache.size > 0) {
        const firstGuild = client.guilds.cache.first();
        guildId = firstGuild.id;
        console.log(`📌 Server được chọn: ${firstGuild.name} (${guildId})`);
        
        if (client.guilds.cache.size > 1) {
            console.log(`\n⚠️  Bot đang ở ${client.guilds.cache.size} servers:`);
            client.guilds.cache.forEach((guild, index) => {
                console.log(`   ${index + 1}. ${guild.name} (${guild.id})`);
            });
            console.log(`\n💡 Bot sẽ dùng server đầu tiên: ${firstGuild.name}`);
            console.log(`💡 Để thay đổi, chỉnh GUILD_ID trong file .env\n`);
        }
    } else {
        console.log('⚠️  Bot chưa ở server nào!');
        console.log('📝 Vui lòng mời bot vào server trước.\n');
    }
    
    // Read current .env
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Update CLIENT_ID and GUILD_ID
    const updates = [];
    
    if (envContent.includes('CLIENT_ID=auto') || envContent.includes('CLIENT_ID=your_bot_client_id_here')) {
        envContent = envContent.replace(/CLIENT_ID=.*/g, `CLIENT_ID=${clientId}`);
        updates.push(`CLIENT_ID → ${clientId}`);
    }
    
    if (guildId !== 'auto') {
        if (envContent.includes('GUILD_ID=auto') || envContent.includes('GUILD_ID=your_server_id_here')) {
            envContent = envContent.replace(/GUILD_ID=.*/g, `GUILD_ID=${guildId}`);
            updates.push(`GUILD_ID → ${guildId}`);
        }
    }
    
    // Save updated .env
    if (updates.length > 0) {
        fs.writeFileSync(envPath, envContent, 'utf-8');
        console.log('✅ Đã cập nhật file .env:');
        updates.forEach(update => console.log(`   • ${update}`));
        console.log('');
    } else {
        console.log('ℹ️  File .env đã được cấu hình đầy đủ.\n');
    }
    
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   ✅ AUTO SETUP HOÀN TẤT!                    ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    
    // Destroy client
    client.destroy();
    process.exit(0);
});

client.on('error', (error) => {
    clearTimeout(timeout);
    console.error('\n❌ Lỗi kết nối Discord:');
    console.error(error.message);
    console.error('\n📝 Vui lòng kiểm tra DISCORD_TOKEN trong file .env\n');
    process.exit(1);
});

// Login
try {
    await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
    clearTimeout(timeout);
    console.error('\n❌ Không thể đăng nhập Discord:');
    console.error(error.message);
    console.error('\n📝 Vui lòng kiểm tra DISCORD_TOKEN có đúng không.\n');
    process.exit(1);
}
