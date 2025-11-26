const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

/**
 * Generate QR Code Buffer
 * @param {string} text 
 * @returns {Promise<Buffer>}
 */
const generateQRCodeBuffer = async (text) => {
    try {
        return await QRCode.toBuffer(text, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 300
        });
    } catch (err) {
        throw new Error(`Failed to generate QR Code: ${err.message}`);
    }
};

/**
 * Generate Barcode Buffer (Code 128)
 * @param {string} text 
 * @returns {Promise<Buffer>}
 */
const generateBarcodeBuffer = async (text) => {
    return new Promise((resolve, reject) => {
        bwipjs.toBuffer({
            bcid: 'code128',       // Barcode type
            text: text,            // Text to encode
            scale: 3,              // 3x scaling factor
            height: 10,            // Bar height, in millimeters
            includetext: true,     // Show human-readable text
            textxalign: 'center',  // Always good to align text
        }, (err, png) => {
            if (err) {
                reject(new Error(`Failed to generate Barcode: ${err.message}`));
            } else {
                resolve(png);
            }
        });
    });
};

module.exports = {
    generateQRCodeBuffer,
    generateBarcodeBuffer
};
