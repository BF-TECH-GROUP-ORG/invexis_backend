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
            width: 300,
            color: {
                light: '#ffffffff' // White background
            }
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
            scale: 5,              // Increased scale for better scanning
            height: 5,            // Increased height
            includetext: true,     // Show human-readable text
            textxalign: 'center',
            backgroundcolor: 'ffffff', // White background
            padding: 10,           // Quiet zone
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