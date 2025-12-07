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
 * Load all commands recursively from subfolders (slash commands and context menus)
 */
async function loadCommands() {
    // Scripts are now inside src/scripts, so go up one level to reach commands
    const commandsPath = path.join(__dirname, '..', 'commands');

    /**
     * Recursively load commands from a directory
     * @param {string} dirPath - Directory path to scan
     * @param {string} category - Category name for logging
     */
    async function loadFromDirectory(dirPath, category = '') {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively load from subdirectory
                await loadFromDirectory(fullPath, entry.name);
            } else if (entry.name.endsWith('.js')) {
                try {
                    const command = await import(`file://${fullPath}`);

                    // Handle regular slash commands
                    if ('data' in command.default && 'execute' in command.default) {
                        commands.push(command.default.data.toJSON());
                        console.log(
                            `  ✅ Loaded slash command: ${command.default.data.name}${category ? ` [${category}]` : ''}`
                        );
                    }
                    // Handle context menu files with multiple exports
                    else if (entry.name === 'context-menus.js') {
                        // Load both context menu commands
                        if (command.addToQueueContextMenu) {
                            commands.push(command.addToQueueContextMenu.data.toJSON());
                            console.log(`  ✅ Loaded context menu: ${command.addToQueueContextMenu.data.name}`);
                        }
                        if (command.addToPlaylistContextMenu) {
                            commands.push(command.addToPlaylistContextMenu.data.toJSON());
                            console.log(`  ✅ Loaded context menu: ${command.addToPlaylistContextMenu.data.name}`);
                        }
                    } else {
                        console.log(`  ⚠️ Skipped: ${entry.name} (missing data or execute)`);
                    }
                } catch (error) {
                    console.error(`  ❌ Error loading ${entry.name}:`, error.message);
                }
            }
        }
    }

    console.log('📂 Loading commands from categorized structure...');
    await loadFromDirectory(commandsPath);
    console.log(`\n📊 Total commands loaded: ${commands.length}`);
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
            data = await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
                body: commands
            });
        } else {
            // Global deployment (takes up to 1 hour to propagate)
            console.log('🌍 Deploying globally (may take up to 1 hour)');
            data = await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
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

    // Explicitly exit to prevent hanging (REST client may keep process alive)
    process.exit(0);
}

main();
