import logger from '../utils/logger.js';
import { createErrorEmbed } from '../UI/embeds/MusicEmbeds.js';
import { COLORS } from '../config/design-system.js';

// P2-12: Rate limiting for prefix commands
const prefixCooldowns = new Map();
const COOLDOWN_MS = 3000; // 3-second cooldown per user
const MAX_ERROR_LENGTH = 128;

/**
 * Sanitize error messages to avoid leaking stack traces or internals to users.
 * @param {Error} error
 * @returns {string}
 */
function sanitizeErrorMessage(error) {
    const safeMessages = [
        'TIMEOUT',
        'NOT_FOUND',
        'PERMISSION',
        'INVALID',
        'MISSING',
        'COOLDOWN',
        'LIMIT',
        'QUEUE',
        'PLAYER'
    ];
    const msg = error.message || 'Unknown error';
    // Only pass through messages that look like intentional user-facing errors
    if (safeMessages.some(keyword => msg.toUpperCase().includes(keyword))) {
        return msg.slice(0, MAX_ERROR_LENGTH);
    }
    return 'Đã xảy ra lỗi nội bộ. Vui lòng thử lại sau.';
}

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

        // P2-12: Rate limiting check
        const now = Date.now();
        const userCooldownKey = `${message.author.id}:${commandName}`;
        const lastUsed = prefixCooldowns.get(userCooldownKey);
        if (lastUsed && now - lastUsed < COOLDOWN_MS) {
            const remaining = ((COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
            return message
                .reply({ content: `⏳ Vui lòng đợi ${remaining}s trước khi dùng lại lệnh này.` })
                .catch(() => {});
        }
        prefixCooldowns.set(userCooldownKey, now);

        // P2-12: Permission check
        if (command.data?.default_member_permissions) {
            const requiredPerms = BigInt(command.data.default_member_permissions);
            if (!message.member?.permissions?.has(requiredPerms)) {
                return message
                    .reply({
                        embeds: [createErrorEmbed('❌ Bạn không có quyền sử dụng lệnh này.', client.config)]
                    })
                    .catch(() => {});
            }
        }

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
                // FIX-PB04: Fixed prefix command arg parsing for subcommand flows
                options: {
                    _hoistedOptions: [],
                    _subcommandUsed: false,
                    _getActiveSubcommandName: function () {
                        if (this._subcommandUsed && args.length > 0) return args[0];
                        const commandSubcommands = command.data.options?.filter(opt => opt.type === 1) || [];
                        if (args.length > 0 && commandSubcommands.some(opt => opt.name === args[0])) {
                            this._subcommandUsed = true;
                            return args[0];
                        }
                        return null;
                    },
                    _getOptionArgs: function () {
                        const activeSubcommand = this._getActiveSubcommandName();
                        return activeSubcommand ? args.slice(1) : args;
                    },
                    _getOptionDefinitions: function () {
                        const activeSubcommand = this._getActiveSubcommandName();
                        if (activeSubcommand) {
                            const subCmd = command.data.options?.find(
                                opt => opt.type === 1 && opt.name === activeSubcommand
                            );
                            return subCmd?.options || [];
                        }
                        return (command.data.options || []).filter(opt => opt.type !== 1 && opt.type !== 2);
                    },
                    getSubcommand: function () {
                        // For playlist command, default to 'menu' if no subcommand provided
                        if (commandName === 'playlist' && args.length === 0) {
                            this._subcommandUsed = true;
                            return 'menu';
                        }
                        // Commands that use subcommands (playlist, feedback, settings)
                        const subcommandCommands = ['playlist', 'feedback', 'settings', 'filter'];
                        if (subcommandCommands.includes(commandName) && args.length > 0) {
                            this._subcommandUsed = true;
                            return args[0];
                        }
                        // Otherwise return first arg as subcommand, or null
                        if (args.length > 0) {
                            this._subcommandUsed = true;
                            return args[0];
                        }
                        return null;
                    },
                    _getOptionValue: function (name, parseType = 'raw') {
                        const optionArgs = this._getOptionArgs();
                        const optionDefs = this._getOptionDefinitions();
                        if (optionArgs.length === 0 || optionDefs.length === 0) return null;

                        const optIndex = optionDefs.findIndex(opt => opt.name === name);
                        if (optIndex === -1 || optIndex >= optionArgs.length) return null;

                        const optionDef = optionDefs[optIndex];
                        let rawValue = optionArgs[optIndex];

                        if (
                            optionDef.type === 3 &&
                            optIndex === optionDefs.length - 1 &&
                            optionArgs.length > optIndex + 1
                        ) {
                            rawValue = optionArgs.slice(optIndex).join(' ');
                        }

                        if (parseType === 'int') {
                            const value = parseInt(rawValue, 10);
                            return isNaN(value) ? null : value;
                        }

                        if (parseType === 'bool') {
                            if (typeof rawValue !== 'string') return null;
                            const normalized = rawValue.toLowerCase();
                            if (['true', '1', 'yes', 'y', 'on', 'có', 'co'].includes(normalized)) return true;
                            if (['false', '0', 'no', 'n', 'off', 'không', 'khong'].includes(normalized)) return false;
                            return null;
                        }

                        return rawValue ?? null;
                    },
                    getString: function (name) {
                        const optionArgs = this._getOptionArgs();
                        if (optionArgs.length === 0) return null;

                        const positionalValue = this._getOptionValue(name, 'raw');
                        if (positionalValue !== null) return positionalValue;

                        const stringOptions = this._getOptionDefinitions().filter(opt => opt.type === 3);
                        if (stringOptions.length === 1 && stringOptions[0].name === name) {
                            return optionArgs.join(' ') || null;
                        }

                        return null;
                    },
                    getInteger: function (name) {
                        const optionArgs = this._getOptionArgs();
                        const value = this._getOptionValue(name, 'int');
                        if (value !== null) return value;

                        for (let i = 0; i < optionArgs.length; i++) {
                            const value = parseInt(optionArgs[i], 10);
                            if (!isNaN(value)) return value;
                        }

                        return null;
                    },
                    getBoolean: function (name) {
                        return this._getOptionValue(name, 'bool');
                    }
                },

                // Reply methods
                replied: false,
                deferred: false,

                reply: async content => {
                    fakeInteraction.replied = true;
                    if (typeof content === 'string') {
                        botReplyMessage = await message.reply(content);
                        return botReplyMessage;
                    }
                    botReplyMessage = await message.reply(content);
                    return botReplyMessage;
                },

                editReply: async content => {
                    // If we have a bot reply message, edit that
                    if (botReplyMessage) {
                        return botReplyMessage.edit(content);
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

                deferReply: async options => {
                    fakeInteraction.deferred = true;
                    // If ephemeral, skip showing the processing message
                    if (options?.ephemeral) {
                        return null;
                    }
                    // Send a "thinking" message that can be edited later
                    botReplyMessage = await message.reply({
                        embeds: [
                            {
                                description: '⏳ Đang xử lý...',
                                color: parseInt((client.config?.bot?.color || COLORS.PRIMARY).replace('#', ''), 16)
                            }
                        ]
                    });
                    return botReplyMessage;
                },

                followUp: async content => {
                    return message.channel.send(content);
                },

                deleteReply: async () => {
                    if (botReplyMessage) {
                        try {
                            await botReplyMessage.delete();
                            botReplyMessage = null;
                        } catch {
                            // Message may already be deleted
                        }
                    }
                },

                fetchReply: async () => {
                    return botReplyMessage || null;
                },

                showModal: async () => {
                    logger.warn(`showModal() is not supported for prefix commands (${commandName})`);
                },

                isRepliable: () => true,

                // Interaction type-check methods
                isChatInputCommand: () => true,
                isButton: () => false,
                isStringSelectMenu: () => false,
                isModalSubmit: () => false,
                isContextMenuCommand: () => false,
                isAutocomplete: () => false
            };

            // Execute command
            await command.execute(fakeInteraction, client);

            logger.command(commandName, message.author.id, message.guildId, 'prefix');
        } catch (error) {
            logger.error(`Prefix command error: ${commandName}`, error);

            // P2-12: Sanitize error messages - don't expose stack traces to users
            const safeMessage = sanitizeErrorMessage(error);
            const errorMessage = {
                embeds: [
                    createErrorEmbed(
                        `❌ Đã xảy ra lỗi khi thực thi lệnh \`${prefix}${commandName}\`!\n\n` +
                            `**Lỗi:** ${safeMessage}\n\n` +
                            `*Thử sử dụng slash command \`/${commandName}\` để có trải nghiệm tốt hơn.*`,
                        client.config
                    )
                ]
            };

            try {
                await message.reply(errorMessage);
            } catch (replyError) {
                logger.error('Failed to send error message', replyError);
            }
        }
    }
};
