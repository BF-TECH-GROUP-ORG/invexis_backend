const crypto = require('crypto');

/**
 * Generate a unique SKU
 * Format: BRAND-CAT-RANDOM
 * @param {string} brand 
 * @param {string} categoryName 
 * @returns {string}
 */
const generateSKU = (brand, categoryName) => {
    const brandPrefix = (brand || 'GEN').substring(0, 3).toUpperCase();
    const catPrefix = (categoryName || 'GEN').substring(0, 3).toUpperCase();
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${brandPrefix}-${catPrefix}-${random}`;
};

/**
 * Generate a mock ASIN (Amazon Standard Identification Number)
 * Format: B0 + 8 alphanumeric characters
 * @returns {string}
 */
const generateASIN = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = 'B0';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Generate a mock UPC (Universal Product Code)
 * Format: 12 digits
 * @returns {string}
 */
const generateUPC = () => {
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
};

/**
 * Generate a unique Barcode
 * Format: BC + Timestamp + Random
 * @returns {string}
 */
const generateBarcode = () => {
    return `BC${Date.now()}${Math.floor(Math.random() * 9999)}`;
};

/**
 * Generate a unique QR Code string
 * Format: QR + Timestamp + Random
 * @returns {string}
 */
const generateQRCode = () => {
    return `QR${Date.now()}${Math.floor(Math.random() * 9999)}`;
};

module.exports = {
    generateSKU,
    generateASIN,
    generateUPC,
    generateBarcode,
    generateQRCode
};
