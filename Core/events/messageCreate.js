import logger from '../utils/logger.js';
import { createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';

export default {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bot messages
        if (message.author.bot) return;
        
        // Check if message starts with prefix
        const prefix = client.config.bot.prefix || '!';
        if (!message.content.startsWith(prefix)) return;
        
        // Parse command and args
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        // Get command
        const command = client.commands.get(commandName);
        
        if (!command) return;
        
        logger.debug(`Prefix command received: ${prefix}${commandName} from ${message.author.tag}`);
        
        try {
            // Create a fake interaction object for compatibility
            let botReplyMessage = null; // Store bot's reply message
            
            const fakeInteraction = {
                // Basic properties
                commandName: commandName,
                user: message.author,
                member: message.member,
                guild: message.guild,
                guildId: message.guildId,
                channel: message.channel,
                channelId: message.channelId,
                client: client,
                
                // Options handling
                options: {
                    _hoistedOptions: [],
                    getString: (name) => {
                        const optIndex = command.data.options?.findIndex(opt => opt.name === name);
                        if (optIndex === undefined || optIndex === -1) return null;
                        
                        // For the first string option, join all remaining args
                        const firstStringOption = command.data.options?.find(opt => opt.type === 3); // STRING type
                        if (firstStringOption && firstStringOption.name === name && args.length > 0) {
                            return args.join(' ');
                        }
                        
                        return args[optIndex] || null;
                    },
                    getInteger: (name) => {
                        const optIndex = command.data.options?.findIndex(opt => opt.name === name);
                        if (optIndex === undefined || optIndex === -1) return null;
                        
                        const value = parseInt(args[optIndex]);
                        return isNaN(value) ? null : value;
                    }
                },
                
                // Reply methods
                replied: false,
                deferred: false,
                
                reply: async (content) => {
                    fakeInteraction.replied = true;
                    if (typeof content === 'string') {
                        botReplyMessage = await message.reply(content);
                        return botReplyMessage;
                    }
                    botReplyMessage = await message.reply(content);
                    return botReplyMessage;
                },
                
                editReply: async (content) => {
                    // If we have a bot reply message, edit that
                    if (botReplyMessage) {
                        return await botReplyMessage.edit(content);
                    }
                    
                    // If deferred but no message yet, send a new reply
                    if (fakeInteraction.deferred) {
                        botReplyMessage = await message.reply(content);
                        fakeInteraction.replied = true;
                        return botReplyMessage;
                    }
                    
                    // Fallback: send as new message
                    botReplyMessage = await message.channel.send(content);
                    fakeInteraction.replied = true;
                    return botReplyMessage;
                },
                
                deferReply: async (options) => {
                    fakeInteraction.deferred = true;
                    // Send a "thinking" message that can be edited later
                    botReplyMessage = await message.reply({
                        embeds: [{
                            description: '⏳ Đang xử lý...',
                            color: parseInt(client.config?.bot?.color?.replace('#', '') || '5865F2', 16)
                        }]
                    });
                    return botReplyMessage;
                },
                
                followUp: async (content) => {
                    return await message.channel.send(content);
                }
            };
            
            // Execute command
            await command.execute(fakeInteraction, client);
            
            logger.command(commandName, message.author.id, message.guildId, 'prefix');
            
        } catch (error) {
            logger.error(`Prefix command error: ${commandName}`, error);
            
            const errorMessage = {
                embeds: [createErrorEmbed(
                    `❌ Đã xảy ra lỗi khi thực thi lệnh \`${prefix}${commandName}\`!\n\n` +
                    `**Lỗi:** ${error.message}\n\n` +
                    `*Thử sử dụng slash command \`/${commandName}\` để có trải nghiệm tốt hơn.*`,
                    client.config
                )]
            };
            
            try {
                await message.reply(errorMessage);
            } catch (replyError) {
                logger.error('Failed to send error message', replyError);
            }
        }
    }
};
