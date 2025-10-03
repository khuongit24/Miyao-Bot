import { REST, Routes } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is not defined in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('❌ CLIENT_ID is not defined in .env file');
    process.exit(1);
}

const commands = [];

/**
 * Load all commands
 */
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'Core', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    console.log(`📂 Loading ${commandFiles.length} commands...`);
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(`file://${filePath}`);
        
        if ('data' in command.default && 'execute' in command.default) {
            commands.push(command.default.data.toJSON());
            console.log(`  ✅ Loaded: ${command.default.data.name}`);
        } else {
            console.log(`  ⚠️ Skipped: ${file} (missing data or execute)`);
        }
    }
}

/**
 * Deploy commands to Discord
 */
async function deployCommands() {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log(`\n🚀 Started refreshing ${commands.length} application (/) commands.`);
        
        // Deploy commands
        let data;
        
        if (process.env.GUILD_ID) {
            // Guild-specific deployment (faster for testing)
            console.log(`📍 Deploying to guild: ${process.env.GUILD_ID}`);
            data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
        } else {
            // Global deployment (takes up to 1 hour to propagate)
            console.log('🌍 Deploying globally (may take up to 1 hour)');
            data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );
        }
        
        console.log(`\n✅ Successfully reloaded ${data.length} application (/) commands.`);
        console.log('\n📋 Deployed commands:');
        data.forEach(cmd => {
            console.log(`  - /${cmd.name}: ${cmd.description}`);
        });
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
        process.exit(1);
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🎵 Miyao Music Bot - Command Deployment\n');
    console.log('═══════════════════════════════════════\n');
    
    await loadCommands();
    await deployCommands();
    
    console.log('\n═══════════════════════════════════════');
    console.log('✨ Deployment complete!');
}

main();
