/**
 * @file i18n.js
 * @description Internationalization support for Miyao Bot
 * @version 1.6.0
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Available locales
const LOCALES = ['vi', 'en'];
const DEFAULT_LOCALE = 'vi';

// Loaded translations
const translations = {};

/**
 * Load translation files
 */
export function loadTranslations() {
    try {
        for (const locale of LOCALES) {
            const filePath = join(__dirname, 'locales', `${locale}.json`);
            try {
                const content = readFileSync(filePath, 'utf8');
                translations[locale] = JSON.parse(content);
                logger.info(`Loaded ${locale} translations`, { keys: Object.keys(translations[locale]).length });
            } catch (error) {
                logger.warn(`Failed to load ${locale} translations`, { error: error.message });
                translations[locale] = {};
            }
        }
    } catch (error) {
        logger.error('Failed to load translations', { error: error.message });
    }
}

/**
 * Get translated string
 * @param {string} key - Translation key (e.g., 'command.play.description')
 * @param {string} locale - Locale code (e.g., 'vi', 'en')
 * @param {Object} replacements - Variables to replace in translation
 * @returns {string} Translated string
 */
export function t(key, locale = DEFAULT_LOCALE, replacements = {}) {
    // Validate locale
    if (!LOCALES.includes(locale)) {
        locale = DEFAULT_LOCALE;
    }

    // Get translation
    let text = translations[locale]?.[key];

    // Fallback to default locale if not found
    if (!text && locale !== DEFAULT_LOCALE) {
        text = translations[DEFAULT_LOCALE]?.[key];
    }

    // Fallback to key if translation not found
    if (!text) {
        logger.debug(`Translation key not found: ${key}`, { locale });
        return key;
    }

    // Replace variables: {name} -> value
    for (const [k, v] of Object.entries(replacements)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }

    return text;
}

/**
 * Get user's preferred locale from database
 * @param {string} userId - Discord user ID
 * @returns {Promise<string>} Locale code
 */
export async function getUserLocale(userId) {
    try {
        const { default: UserPreferences } = await import('../database/models/UserPreferences.js');
        const prefs = UserPreferences.get(userId);
        return prefs?.locale || DEFAULT_LOCALE;
    } catch (error) {
        logger.error('Failed to get user locale', { userId, error: error.message });
        return DEFAULT_LOCALE;
    }
}

/**
 * Set user's preferred locale
 * @param {string} userId - Discord user ID
 * @param {string} locale - Locale code
 * @returns {Promise<boolean>} Success
 */
export async function setUserLocale(userId, locale) {
    if (!LOCALES.includes(locale)) {
        throw new Error(`Invalid locale: ${locale}. Available: ${LOCALES.join(', ')}`);
    }

    try {
        const { default: UserPreferences } = await import('../database/models/UserPreferences.js');
        UserPreferences.set(userId, { locale });
        logger.info('User locale updated', { userId, locale });
        return true;
    } catch (error) {
        logger.error('Failed to set user locale', { userId, locale, error: error.message });
        return false;
    }
}

/**
 * Get all available locales
 * @returns {Array<{code: string, name: string}>}
 */
export function getAvailableLocales() {
    return [
        { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
        { code: 'en', name: 'English', flag: '🇬🇧' }
    ];
}

// Initialize translations on module load
loadTranslations();

export default {
    t,
    getUserLocale,
    setUserLocale,
    getAvailableLocales,
    loadTranslations
};
