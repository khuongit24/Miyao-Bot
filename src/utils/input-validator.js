/**
 * Input Validator
 * Validates and sanitizes user inputs to prevent abuse and injection attacks
 */

import logger from './logger.js';

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether input is valid
 * @property {string} [error] - Error message if invalid
 * @property {*} [sanitized] - Sanitized value if valid
 */

/**
 * Validate search query
 * @param {string} query - Search query
 * @returns {ValidationResult}
 */
export function validateSearchQuery(query) {
    if (!query || typeof query !== 'string') {
        return {
            valid: false,
            error: 'Truy vấn tìm kiếm không hợp lệ'
        };
    }

    // Remove leading/trailing whitespace
    const trimmed = query.trim();

    // Check length
    if (trimmed.length === 0) {
        return {
            valid: false,
            error: 'Truy vấn tìm kiếm không được để trống'
        };
    }

    if (trimmed.length > 200) {
        return {
            valid: false,
            error: 'Truy vấn tìm kiếm quá dài (tối đa 200 ký tự)'
        };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
        /<script[^>]*>.*?<\/script>/gi, // Script tags
        /javascript:/gi, // JavaScript protocol
        /on\w+\s*=/gi, // Event handlers
        /data:text\/html/gi, // Data URIs
        /<iframe/gi, // Iframes
        /eval\s*\(/gi, // Eval calls
        /expression\s*\(/gi, // CSS expressions
        /vbscript:/gi // VBScript
    ];

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(trimmed)) {
            logger.warn('Suspicious search query detected', { query: trimmed });
            return {
                valid: false,
                error: 'Truy vấn tìm kiếm chứa nội dung không hợp lệ'
            };
        }
    }

    // Check for excessive special characters (potential injection)
    const specialCharCount = (trimmed.match(/[<>{}[\]\\|`~]/g) || []).length;
    if (specialCharCount > 10) {
        logger.warn('Excessive special characters in query', { query: trimmed, count: specialCharCount });
        return {
            valid: false,
            error: 'Truy vấn tìm kiếm chứa quá nhiều ký tự đặc biệt'
        };
    }

    // Sanitize by removing potential dangerous characters but keeping useful ones
    const sanitized = trimmed
        .replace(/[<>{}[\]\\|`]/g, '') // Remove potentially dangerous chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

    if (sanitized.length === 0) {
        return {
            valid: false,
            error: 'Truy vấn tìm kiếm không hợp lệ sau khi xử lý'
        };
    }

    return {
        valid: true,
        sanitized
    };
}

/**
 * Validate playlist name
 * @param {string} name - Playlist name
 * @returns {ValidationResult}
 */
export function validatePlaylistName(name) {
    if (!name || typeof name !== 'string') {
        return {
            valid: false,
            error: 'Tên playlist không hợp lệ'
        };
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
        return {
            valid: false,
            error: 'Tên playlist không được để trống'
        };
    }

    if (trimmed.length > 100) {
        return {
            valid: false,
            error: 'Tên playlist quá dài (tối đa 100 ký tự)'
        };
    }

    // Only allow alphanumeric, spaces, hyphens, underscores, and Vietnamese characters
    const validPattern = /^[\p{L}\p{N}\s\-_]+$/u;
    if (!validPattern.test(trimmed)) {
        return {
            valid: false,
            error: 'Tên playlist chỉ được chứa chữ, số, dấu cách, gạch ngang và gạch dưới'
        };
    }

    // Check for reserved names
    const reservedNames = ['system', 'admin', 'root', 'default', 'null', 'undefined'];
    if (reservedNames.includes(trimmed.toLowerCase())) {
        return {
            valid: false,
            error: 'Tên playlist này không được phép sử dụng'
        };
    }

    return {
        valid: true,
        sanitized: trimmed
    };
}

/**
 * Validate playlist description
 * @param {string} description - Playlist description
 * @returns {ValidationResult}
 */
export function validatePlaylistDescription(description) {
    if (!description) {
        return {
            valid: true,
            sanitized: ''
        };
    }

    if (typeof description !== 'string') {
        return {
            valid: false,
            error: 'Mô tả playlist không hợp lệ'
        };
    }

    const trimmed = description.trim();

    if (trimmed.length > 500) {
        return {
            valid: false,
            error: 'Mô tả playlist quá dài (tối đa 500 ký tự)'
        };
    }

    // Remove potentially dangerous HTML/script content
    const sanitized = trimmed
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '') // Remove all HTML tags
        .replace(/javascript:/gi, '')
        .trim();

    return {
        valid: true,
        sanitized
    };
}

/**
 * Validate volume value
 * @param {number} volume - Volume value (0-100)
 * @returns {ValidationResult}
 */
export function validateVolume(volume) {
    const num = Number(volume);

    if (isNaN(num)) {
        return {
            valid: false,
            error: 'Âm lượng phải là một số'
        };
    }

    if (num < 0 || num > 100) {
        return {
            valid: false,
            error: 'Âm lượng phải trong khoảng 0-100'
        };
    }

    return {
        valid: true,
        sanitized: Math.round(num)
    };
}

/**
 * Validate queue position
 * @param {number} position - Queue position
 * @param {number} maxPosition - Maximum valid position
 * @returns {ValidationResult}
 */
export function validateQueuePosition(position, maxPosition) {
    const num = Number(position);

    if (isNaN(num)) {
        return {
            valid: false,
            error: 'Vị trí phải là một số'
        };
    }

    if (!Number.isInteger(num)) {
        return {
            valid: false,
            error: 'Vị trí phải là số nguyên'
        };
    }

    if (num < 1 || num > maxPosition) {
        return {
            valid: false,
            error: `Vị trí phải trong khoảng 1-${maxPosition}`
        };
    }

    return {
        valid: true,
        sanitized: num
    };
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {ValidationResult}
 */
export function validateURL(url) {
    if (!url || typeof url !== 'string') {
        return {
            valid: false,
            error: 'URL không hợp lệ'
        };
    }

    try {
        const parsed = new URL(url);

        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return {
                valid: false,
                error: 'Chỉ chấp nhận URL với giao thức HTTP hoặc HTTPS'
            };
        }

        // Block localhost and private IPs
        const hostname = parsed.hostname.toLowerCase();
        const privatePatterns = [
            /^localhost$/,
            /^127\.\d+\.\d+\.\d+$/,
            /^192\.168\.\d+\.\d+$/,
            /^10\.\d+\.\d+\.\d+$/,
            /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
            /^\[::[01]\]$/, // IPv6 localhost
            /^\[::1\]$/ // IPv6 localhost
        ];

        for (const pattern of privatePatterns) {
            if (pattern.test(hostname)) {
                logger.warn('Attempt to access private URL', { url });
                return {
                    valid: false,
                    error: 'Không được phép truy cập URL nội bộ'
                };
            }
        }

        return {
            valid: true,
            sanitized: url.trim()
        };
    } catch (error) {
        return {
            valid: false,
            error: 'URL không hợp lệ'
        };
    }
}

/**
 * Validate Discord ID (user, guild, channel)
 * @param {string} id - Discord ID
 * @returns {ValidationResult}
 */
export function validateDiscordId(id) {
    if (!id || typeof id !== 'string') {
        return {
            valid: false,
            error: 'ID không hợp lệ'
        };
    }

    // Discord IDs are 17-19 digit snowflakes
    if (!/^\d{17,19}$/.test(id)) {
        return {
            valid: false,
            error: 'ID Discord không hợp lệ'
        };
    }

    return {
        valid: true,
        sanitized: id
    };
}

/**
 * Validate filter name
 * @param {string} filterName - Filter name
 * @param {string[]} validFilters - Array of valid filter names
 * @returns {ValidationResult}
 */
export function validateFilterName(filterName, validFilters) {
    if (!filterName || typeof filterName !== 'string') {
        return {
            valid: false,
            error: 'Tên filter không hợp lệ'
        };
    }

    const normalized = filterName.toLowerCase().trim();

    if (!validFilters.includes(normalized)) {
        return {
            valid: false,
            error: `Filter không tồn tại. Filter hợp lệ: ${validFilters.join(', ')}`
        };
    }

    return {
        valid: true,
        sanitized: normalized
    };
}

/**
 * Sanitize text for logging (remove sensitive data)
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeForLog(text) {
    if (!text || typeof text !== 'string') return '';

    return (
        text
            // Mask Discord tokens
            .replace(/([A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,})/g, '[REDACTED_TOKEN]')
            // Mask API keys (various formats)
            .replace(/([a-zA-Z0-9_-]{32,})/g, match => {
                // Only mask if it looks like an API key (has specific patterns)
                if (/^[A-Za-z0-9_-]{32,}$/.test(match) && !/^https?:/.test(match)) {
                    return '[REDACTED_KEY]';
                }
                return match;
            })
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

/**
 * Validate generic string input
 * @param {string} input - Input string
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum length
 * @param {number} options.maxLength - Maximum length
 * @param {RegExp} options.pattern - Regex pattern to match
 * @param {string} options.fieldName - Field name for error messages
 * @returns {ValidationResult}
 */
export function validateString(input, options = {}) {
    const { minLength = 0, maxLength = 1000, pattern = null, fieldName = 'Giá trị' } = options;

    if (input === null || input === undefined) {
        return {
            valid: false,
            error: `${fieldName} không được để trống`
        };
    }

    if (typeof input !== 'string') {
        return {
            valid: false,
            error: `${fieldName} phải là chuỗi ký tự`
        };
    }

    const trimmed = input.trim();

    if (trimmed.length < minLength) {
        return {
            valid: false,
            error: `${fieldName} phải có ít nhất ${minLength} ký tự`
        };
    }

    if (trimmed.length > maxLength) {
        return {
            valid: false,
            error: `${fieldName} không được vượt quá ${maxLength} ký tự`
        };
    }

    if (pattern && !pattern.test(trimmed)) {
        return {
            valid: false,
            error: `${fieldName} không đúng định dạng`
        };
    }

    return {
        valid: true,
        sanitized: trimmed
    };
}

/**
 * Validate number input
 * @param {*} input - Input value
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {boolean} options.integer - Must be integer
 * @param {string} options.fieldName - Field name for error messages
 * @returns {ValidationResult}
 */
export function validateNumber(input, options = {}) {
    const { min = -Infinity, max = Infinity, integer = false, fieldName = 'Giá trị' } = options;

    const num = Number(input);

    if (isNaN(num)) {
        return {
            valid: false,
            error: `${fieldName} phải là một số`
        };
    }

    if (integer && !Number.isInteger(num)) {
        return {
            valid: false,
            error: `${fieldName} phải là số nguyên`
        };
    }

    if (num < min || num > max) {
        return {
            valid: false,
            error: `${fieldName} phải trong khoảng ${min}-${max}`
        };
    }

    return {
        valid: true,
        sanitized: integer ? Math.round(num) : num
    };
}

export default {
    validateSearchQuery,
    validatePlaylistName,
    validatePlaylistDescription,
    validateVolume,
    validateQueuePosition,
    validateURL,
    validateDiscordId,
    validateFilterName,
    sanitizeForLog,
    validateString,
    validateNumber
};
