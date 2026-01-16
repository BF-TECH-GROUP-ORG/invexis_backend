/**
 * src/utils/dataSanitizer.js
 * Utility to clean and sanitize data from upstream services
 */
const logger = require('./logger');

const cleanValue = (val, fallback = '') => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'string') {
        const trimmed = val.trim();
        // Check for common obfuscation patterns or placeholders
        if (trimmed === '****' || trimmed === '***' || trimmed.includes('****')) {
            return fallback;
        }
        return trimmed;
    }
    return val;
};

const cleanAmount = (val, fallback = 0) => {
    if (val === undefined || val === null) return fallback;

    // If it's already a number, just ensure it's not NaN
    if (typeof val === 'number') {
        return isNaN(val) ? fallback : val;
    }

    // If it's a string, clean it first then parse
    const cleaned = cleanValue(val, null);
    if (cleaned === null) return fallback;

    // Remove currency symbols or commas if present
    const numericStr = cleaned.toString().replace(/[^\d.-]/g, '');
    const parsed = parseFloat(numericStr);

    return isNaN(parsed) ? fallback : parsed;
};

/**
 * Robustly extract a field from various possible locations in a data object
 * @param {Object} data 
 * @param {Array<string>} paths 
 * @param {any} fallback 
 */
const extractField = (data, paths, fallback) => {
    if (!data) return fallback;

    for (const path of paths) {
        const parts = path.split('.');
        let current = data;
        for (const part of parts) {
            current = current?.[part];
        }
        if (current !== undefined && current !== null) {
            const cleaned = cleanValue(current, null);
            if (cleaned !== null) return cleaned;
        }
    }
    return fallback;
};

module.exports = { cleanValue, cleanAmount, extractField };
