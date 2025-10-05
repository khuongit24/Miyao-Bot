/**
 * Environment Variable Validation Utility
 * Validates all required and optional environment variables at startup
 * Version: 1.6.0
 */

import logger from './logger.js';
import crypto from 'crypto';

/**
 * Required environment variables that MUST be present
 */
const REQUIRED_VARS = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'LAVALINK_PASSWORD',
  'METRICS_API_KEY'
];

/**
 * Optional environment variables with default values
 */
const OPTIONAL_VARS = {
  // Lavalink
  LAVALINK_HOST: '127.0.0.1',
  LAVALINK_PORT: '2333',
  
  // Metrics
  METRICS_PORT: '3000',
  METRICS_ALLOWED_IPS: '',
  
  // Database
  DATABASE_PATH: './data/miyao.db',
  DATABASE_DEBUG: 'false',
  DATABASE_BACKUP_INTERVAL: '24',
  
  // Logging
  LOG_LEVEL: 'info',
  LOG_FILE: './logs/miyao.log',
  LOG_CONSOLE: 'true',
  LOG_FORMAT: 'pretty',
  
  // Environment
  NODE_ENV: 'development',
  
  // Rate Limiting
  RATE_LIMIT_MAX_COMMANDS: '5',
  RATE_LIMIT_WINDOW_MS: '10000',
  RATE_LIMIT_GUILD_QUEUE_OPS: '20',
  RATE_LIMIT_GUILD_SEARCHES: '10',
  
  // Performance
  ENABLE_REQUEST_COALESCING: 'true',
  ENABLE_EMBED_CACHING: 'true',
  CACHE_TTL: '300',
  SEARCH_CACHE_TTL: '300000',
  
  // Features
  ENABLE_AUTOPLAY: 'true',
  ENABLE_LYRICS: 'true',
  ENABLE_PLAYLISTS: 'true',
  ENABLE_DISCOVERY: 'true',
  
  // Content Filtering
  CONTENT_FILTER_ENABLED: 'false',
  CONTENT_FILTER_PROVIDER: 'none',
  CONTENT_FILTER_API_KEY: '',
  
  // Alerts
  ALERT_WEBHOOK_URL: '',
  ALERT_CRITICAL_ONLY: 'true',
  
  // Advanced
  SHOUKAKU_RESUME_KEY: 'MiyaoBot',
  SHOUKAKU_RESUME_TIMEOUT: '30',
  MAX_QUEUE_SIZE: '1000',
  MAX_PLAYLIST_SIZE: '500',
  DEFAULT_VOLUME: '50',
  DEV_MODE: 'false',
  DEV_USER_IDS: '',
  MEMORY_LIMIT: '512',
  
  // Internationalization
  DEFAULT_LANGUAGE: 'vi',
  AVAILABLE_LANGUAGES: 'en,vi',
  
  // Monitoring
  ENABLE_DETAILED_METRICS: 'true',
  ENABLE_PROMETHEUS: 'false',
  PROMETHEUS_PORT: '9090',
  
  // Security
  ENABLE_AUDIT_LOG: 'true',
  AUDIT_LOG_RETENTION_DAYS: '90',
  ENABLE_IP_WHITELIST: 'false',
  
  // Bot Config
  PREFIX: '!',
  CORS_ORIGIN: '*'
};

/**
 * Validation rules for specific variables
 */
const VALIDATION_RULES = {
  DISCORD_TOKEN: {
    test: (val) => val.length > 50,
    message: 'DISCORD_TOKEN must be a valid Discord bot token (length > 50)'
  },
  CLIENT_ID: {
    test: (val) => /^\d+$/.test(val) || val === 'auto',
    message: 'CLIENT_ID must be a numeric Discord application ID or "auto"'
  },
  METRICS_API_KEY: {
    test: (val) => val.length >= 32,
    message: 'METRICS_API_KEY must be at least 32 characters long for security'
  },
  LAVALINK_PORT: {
    test: (val) => {
      const port = parseInt(val);
      return !isNaN(port) && port > 0 && port < 65536;
    },
    message: 'LAVALINK_PORT must be a valid port number (1-65535)'
  },
  METRICS_PORT: {
    test: (val) => {
      const port = parseInt(val);
      return !isNaN(port) && port > 0 && port < 65536;
    },
    message: 'METRICS_PORT must be a valid port number (1-65535)'
  },
  NODE_ENV: {
    test: (val) => ['development', 'production', 'test'].includes(val),
    message: 'NODE_ENV must be one of: development, production, test'
  },
  LOG_LEVEL: {
    test: (val) => ['error', 'warn', 'info', 'debug', 'trace'].includes(val),
    message: 'LOG_LEVEL must be one of: error, warn, info, debug, trace'
  },
  DEFAULT_VOLUME: {
    test: (val) => {
      const vol = parseInt(val);
      return !isNaN(vol) && vol >= 0 && vol <= 100;
    },
    message: 'DEFAULT_VOLUME must be between 0 and 100'
  },
  MAX_QUEUE_SIZE: {
    test: (val) => {
      const size = parseInt(val);
      return !isNaN(size) && size > 0 && size <= 10000;
    },
    message: 'MAX_QUEUE_SIZE must be between 1 and 10000'
  },
  MAX_PLAYLIST_SIZE: {
    test: (val) => {
      const size = parseInt(val);
      return !isNaN(size) && size > 0 && size <= 1000;
    },
    message: 'MAX_PLAYLIST_SIZE must be between 1 and 1000'
  },
  CONTENT_FILTER_PROVIDER: {
    test: (val) => ['none', 'perspective', 'azure'].includes(val),
    message: 'CONTENT_FILTER_PROVIDER must be one of: none, perspective, azure'
  },
  DEFAULT_LANGUAGE: {
    test: (val) => ['en', 'vi'].includes(val),
    message: 'DEFAULT_LANGUAGE must be one of: en, vi'
  }
};

/**
 * Validate environment variables
 * @returns {Object} Validation result with status and errors
 */
export function validateEnvironment() {
  const errors = [];
  const warnings = [];
  
  logger.info('🔍 Validating environment variables...');
  
  // Check required variables
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }
  
  // Apply defaults for optional variables
  for (const [varName, defaultValue] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      process.env[varName] = defaultValue;
      if (varName !== 'ALERT_WEBHOOK_URL' && varName !== 'CONTENT_FILTER_API_KEY' && varName !== 'DEV_USER_IDS') {
        logger.debug(`Using default value for ${varName}: ${defaultValue}`);
      }
    }
  }
  
  // Validate formats and rules
  for (const [varName, rule] of Object.entries(VALIDATION_RULES)) {
    const value = process.env[varName];
    if (value && !rule.test(value)) {
      errors.push(`${varName}: ${rule.message}`);
    }
  }
  
  // Security checks
  if (process.env.METRICS_API_KEY === 'CHANGE_THIS_TO_SECURE_KEY_MIN_32_CHARS' || 
      process.env.METRICS_API_KEY === 'generate_a_strong_random_key_here_min_32_chars') {
    errors.push('METRICS_API_KEY is using default/example value. Please generate a secure random key!');
  }
  
  if (process.env.LAVALINK_PASSWORD === 'youshallnotpass' && process.env.NODE_ENV === 'production') {
    warnings.push('LAVALINK_PASSWORD is using default value. Consider changing it in production!');
  }
  
  // Content filter validation
  if (process.env.CONTENT_FILTER_ENABLED === 'true') {
    if (process.env.CONTENT_FILTER_PROVIDER === 'none') {
      warnings.push('CONTENT_FILTER_ENABLED is true but CONTENT_FILTER_PROVIDER is "none"');
    }
    if (process.env.CONTENT_FILTER_PROVIDER !== 'none' && !process.env.CONTENT_FILTER_API_KEY) {
      errors.push('CONTENT_FILTER_API_KEY is required when CONTENT_FILTER_PROVIDER is not "none"');
    }
  }
  
  // IP Whitelist validation
  if (process.env.METRICS_ALLOWED_IPS) {
    const ips = process.env.METRICS_ALLOWED_IPS.split(',');
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^::1$|^[0-9a-fA-F:]+$/;
    for (const ip of ips) {
      if (!ipRegex.test(ip.trim())) {
        warnings.push(`Invalid IP address in METRICS_ALLOWED_IPS: ${ip.trim()}`);
      }
    }
  }
  
  // Dev mode validation
  if (process.env.DEV_MODE === 'true' && !process.env.DEV_USER_IDS) {
    warnings.push('DEV_MODE is enabled but DEV_USER_IDS is empty');
  }
  
  // Report results
  if (warnings.length > 0) {
    logger.warn('⚠️  Environment validation warnings:');
    warnings.forEach(warning => logger.warn(`   - ${warning}`));
  }
  
  if (errors.length > 0) {
    logger.error('❌ Environment validation failed:');
    errors.forEach(error => logger.error(`   - ${error}`));
    logger.error('');
    logger.error('💡 Please check your .env file and fix the errors above.');
    logger.error('   See .env.example for reference.');
    return { valid: false, errors, warnings };
  }
  
  logger.info('✅ Environment validation passed');
  if (warnings.length > 0) {
    logger.info(`   (with ${warnings.length} warning${warnings.length > 1 ? 's' : ''})`);
  }
  
  return { valid: true, errors: [], warnings };
}

/**
 * Generate a secure random API key
 * @param {number} length - Key length in bytes (default: 32)
 * @returns {string} Hex string of random bytes
 */
export function generateSecureKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Get environment info summary
 * @returns {Object} Summary of current environment configuration
 */
export function getEnvironmentInfo() {
  return {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    features: {
      autoplay: process.env.ENABLE_AUTOPLAY === 'true',
      lyrics: process.env.ENABLE_LYRICS === 'true',
      playlists: process.env.ENABLE_PLAYLISTS === 'true',
      discovery: process.env.ENABLE_DISCOVERY === 'true',
      contentFilter: process.env.CONTENT_FILTER_ENABLED === 'true',
      auditLog: process.env.ENABLE_AUDIT_LOG === 'true'
    },
    performance: {
      requestCoalescing: process.env.ENABLE_REQUEST_COALESCING === 'true',
      embedCaching: process.env.ENABLE_EMBED_CACHING === 'true',
      cacheTTL: parseInt(process.env.CACHE_TTL)
    },
    limits: {
      maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE),
      maxPlaylistSize: parseInt(process.env.MAX_PLAYLIST_SIZE),
      rateLimit: {
        maxCommands: parseInt(process.env.RATE_LIMIT_MAX_COMMANDS),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS)
      }
    },
    language: {
      default: process.env.DEFAULT_LANGUAGE,
      available: process.env.AVAILABLE_LANGUAGES.split(',')
    }
  };
}

/**
 * Validate environment and exit if invalid
 */
export function validateEnvironmentOrExit() {
  const result = validateEnvironment();
  if (!result.valid) {
    logger.error('🛑 Bot cannot start with invalid environment configuration');
    process.exit(1);
  }
  return result;
}

export default {
  validateEnvironment,
  validateEnvironmentOrExit,
  generateSecureKey,
  getEnvironmentInfo
};
