const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const stream = require('stream');

const generateQrStream = async (text) => {
    // QRCode returns stream to callback, or buffer. 
    // We want a stream to pipe.
    const passthrough = new stream.PassThrough();
    QRCode.toFileStream(passthrough, text);
    return passthrough;
};

const generateBarcodeStream = (text, type = 'code128') => {
    const passthrough = new stream.PassThrough();

    bwipjs.toBuffer({
        bcid: type,       // Barcode type
        text: text,       // Text to encode
        scale: 3,         // 3x scaling factor
        height: 10,       // Bar height, in millimeters
        includetext: true,            // Show human-readable text
        textxalign: 'center',        // Always good to set this
    }, (err, png) => {
        if (err) {
            passthrough.emit('error', err);
        } else {
            passthrough.end(png);
        }
    });

    return passthrough;
};

module.exports = { generateQrStream, generateBarcodeStream };
