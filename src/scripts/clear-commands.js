import { REST, Routes } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

/**
 * Clear all global commands
 */
async function clearGlobalCommands() {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('🗑️  Clearing all global commands...');
        
        // Set empty array to clear all commands
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        
        console.log('✅ Successfully cleared all global commands!');
    } catch (error) {
        console.error('❌ Error clearing commands:', error);
    }
}

/**
 * Clear all guild commands
 */
async function clearGuildCommands() {
    if (!process.env.GUILD_ID) {
        console.log('⚠️  No GUILD_ID specified, skipping guild command clearing');
        return;
    }
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log(`🗑️  Clearing guild commands for ${process.env.GUILD_ID}...`);
        
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: [] }
        );
        
        console.log('✅ Successfully cleared all guild commands!');
    } catch (error) {
        console.error('❌ Error clearing guild commands:', error);
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🎵 Miyao Music Bot - Clear Duplicate Commands\n');
    console.log('═══════════════════════════════════════\n');
    
    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID in .env');
        process.exit(1);
    }
    
    // Clear global commands first (removes duplicates)
    await clearGlobalCommands();
    
    console.log('\n═══════════════════════════════════════');
    console.log('✨ Done! Now run: npm run deploy');
    console.log('   This will deploy ONLY to your guild (no duplicates)');
}

main();
