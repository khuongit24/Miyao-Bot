import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeForLog } from './input-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sanitize format - removes sensitive data
const sanitizeFormat = winston.format(info => {
    // Sanitize message
    if (typeof info.message === 'string') {
        info.message = sanitizeForLog(info.message);
    }

    // Sanitize metadata
    if (info.error && typeof info.error === 'object') {
        if (info.error.message) {
            info.error.message = sanitizeForLog(info.error.message);
        }
        if (info.error.stack) {
            info.error.stack = sanitizeForLog(info.error.stack);
        }
    }

    // Sanitize other metadata
    for (const key in info) {
        if (typeof info[key] === 'string' && key !== 'level' && key !== 'timestamp') {
            info[key] = sanitizeForLog(info[key]);
        }
    }

    return info;
})();

// Custom format for console
const consoleFormat = winston.format.combine(
    sanitizeFormat,
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            log += `\n${JSON.stringify(meta, null, 2)}`;
        }
        return log;
    })
);

// Custom format for file
const fileFormat = winston.format.combine(
    sanitizeFormat,
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: fileFormat,
    defaultMeta: { service: 'miyao-bot' },
    transports: [
        // Console transport
        new winston.transports.Console({
            format: consoleFormat
        }),
        // File transport - all logs
        new winston.transports.File({
            filename: path.join(process.cwd(), 'Miyao.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5,
            tailable: true
        }),
        // File transport - errors only
        new winston.transports.File({
            filename: path.join(process.cwd(), 'Miyao-error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 3,
            tailable: true
        })
    ],
    exceptionHandlers: [
        new winston.transports.File({
            filename: path.join(process.cwd(), 'Miyao-exceptions.log')
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(process.cwd(), 'Miyao-rejections.log')
        })
    ]
});

// Custom logging methods
logger.command = (commandName, userId, guildId) => {
    logger.info(`Command executed: ${commandName}`, {
        type: 'command',
        command: commandName,
        user: userId,
        guild: guildId
    });
};

logger.music = (action, details) => {
    logger.info(`Music action: ${action}`, {
        type: 'music',
        action,
        ...details
    });
};

// Override error method to handle Error objects
const originalError = logger.error.bind(logger);
logger.error = (message, error) => {
    if (error instanceof Error) {
        originalError(message, {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        });
    } else if (typeof message === 'object' && message instanceof Error) {
        originalError(message.message, {
            error: {
                name: message.name,
                message: message.message,
                stack: message.stack
            }
        });
    } else {
        originalError(message, error);
    }
};

export default logger;
