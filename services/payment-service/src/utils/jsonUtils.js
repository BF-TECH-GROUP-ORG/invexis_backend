/**
 * JSON Utilities for robust parsing and stringification
 */

/**
 * Robustly parse a value that might be a JSON string or an object.
 * Handles double-stringifications and recursively parses arrays.
 * @param {any} val - The value to parse
 * @returns {any} The parsed object or the original value
 */
const getParsed = (val) => {
    if (val === null || val === undefined) return val;

    let result = val;

    // 1. Recursive unwrap for strings
    if (typeof result === 'string') {
        const trimmed = result.trim();
        // Simple heuristic for JSON
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                const parsed = JSON.parse(trimmed);
                // If it successfully parsed and changed the type/value, recurse to handle double-stringification
                if (parsed !== result) {
                    return getParsed(parsed);
                }
            } catch (e) {
                // Not valid JSON, return as is
            }
        }
    }

    // 2. Recursively parse array elements
    if (Array.isArray(result)) {
        return result.map(item => getParsed(item));
    }

    return result;
};

/**
 * Prepare a value for database storage in a JSONB column.
 * This is CRITICAL to avoid the 'pg' driver formatting JS arrays as Postgres native arrays (which use {} curly braces).
 * Always returns a JSON string.
 * @param {any} val - The value to prepare
 * @param {boolean} isArray - Whether to enforce array structure
 * @returns {string} Fully serialized JSON string
 */
const toJSONB = (val, isArray = false) => {
    const parsed = getParsed(val);
    const final = isArray
        ? (Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []))
        : (parsed || {});
    return JSON.stringify(final);
};

module.exports = {
    getParsed,
    toJSONB
};
