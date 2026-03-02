/**
 * Money Utility
 * Handles conversion between Major Units (Decimal) and Minor Units (BigInt/Integer)
 * to prevent floating point errors for historical accuracy.
 */

class Money {
    /**
     * Convert Major Units (e.g., 150.50) to Minor Units (e.g., 15050)
     * @param {number|string} amount 
     * @param {number} decimals - Default is 2 (for cents/francs)
     * @returns {number}
     */
    static toMinor(amount, decimals = 2) {
        if (amount === null || amount === undefined) return 0;

        // Convert to string to avoid float issues during parsing
        const amountStr = amount.toString();
        const factor = Math.pow(10, decimals);

        // Use Math.round to handle floating point precision during multiplication
        return Math.round(parseFloat(amountStr) * factor);
    }

    /**
     * Convert Minor Units (e.g., 15050) to Major Units (e.g., 150.50)
     * @param {number} minorAmount 
     * @param {number} decimals 
     * @returns {number}
     */
    static toMajor(minorAmount, decimals = 2) {
        if (!minorAmount) return 0;
        const factor = Math.pow(10, decimals);
        return parseFloat((minorAmount / factor).toFixed(decimals));
    }

    /**
     * Format for display
     * @param {number} minorAmount 
     * @param {string} currency 
     * @returns {string}
     */
    static format(minorAmount, currency = 'XAF', decimals = 2) {
        const major = this.toMajor(minorAmount, decimals);
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(major);
    }

    /**
     * Deeply map known money fields in an object or array from minor to major units
     * Useful for .lean() query results where getters are bypassed.
     */
    static mapToMajor(input, decimals = 2, fields = ['totalAmount', 'balance', 'amountPaidNow', 'amountPaid', 'refundAmount', 'unitPrice', 'totalPrice', 'totalOutstanding', 'totalCreditSales', 'totalRepaid']) {
        if (!input) return input;

        if (Array.isArray(input)) {
            return input.map(item => this.mapToMajor(item, decimals, fields));
        }

        if (typeof input !== 'object') return input;

        const output = { ...input };
        for (const key in output) {
            if (fields.includes(key) && typeof output[key] === 'number') {
                output[key] = this.toMajor(output[key], decimals);
            } else if (typeof output[key] === 'object' && output[key] !== null) {
                // Handle nested objects/arrays recursively
                if (key !== '_id' && !(output[key] instanceof Date)) {
                    output[key] = this.mapToMajor(output[key], decimals, fields);
                }
            }
        }
        return output;
    }
}

module.exports = Money;
