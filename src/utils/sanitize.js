/**
 * Sanitize utilities — dependency-free module.
 * Extracted from input-validator.js to break the circular dependency
 * between logger.js ↔ input-validator.js.
 */

/**
 * Sanitize text for logging (remove sensitive data)
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeForLog(text) {
    if (!text || typeof text !== 'string') return '';

    return (
        text
            // Strip control characters (prevent log injection) but preserve newlines/tabs for readability
            // eslint-disable-next-line no-control-regex
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            // Mask Discord tokens
            .replace(/([A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,})/g, '[REDACTED_TOKEN]')
            // Mask email addresses
            .replace(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, '$1***@$2')
            // Mask IP addresses (partial)
            .replace(/(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}/g, '$1.***.**')
            // Mask credit card numbers
            .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[REDACTED_CC]')
            // Mask passwords in URLs
            .replace(/:\/\/([^:]+):([^@]+)@/g, '://$1:[REDACTED]@')
    );
}
