const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../logger');

/**
 * Request document generation from document-service
 * @param {string} eventType - Type of document request
 * @param {object} payload - Document generation payload
 * @param {object} owner - Owner information (companyId, shopId, etc.)
 */
const requestDocument = async (eventType, payload, owner) => {
    try {
        const event = {
            type: eventType,
            payload,
            owner,
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString()
        };

        await publish(exchanges.topic, eventType, event);
        logger.info(`Document request emitted: ${eventType}`);
        return true;
    } catch (err) {
        logger.error(`Failed to emit document request: ${eventType}`, err);
        return false;
    }
};

/**
 * Request QR Code generation
 */
const requestQRCode = async (productId, sku, companyId) => {
    return requestDocument('document.product.qr.requested', {
        productId,
        sku,
        text: sku
    }, {
        level: 'company',
        companyId
    });
};

/**
 * Request Barcode generation
 */
const requestBarcode = async (productId, sku, companyId) => {
    return requestDocument('document.product.barcode.requested', {
        productId,
        sku,
        text: sku
    }, {
        level: 'company',
        companyId
    });
};

/**
 * Request Product Image upload
 */
const requestProductImage = async (productId, imageBuffer, companyId, format = 'jpg' || 'png' || 'jpeg') => {
    const imageData = imageBuffer.toString('base64');
    return requestDocument('document.product.image.requested', {
        productId,
        imageData,
        format
    }, {
        level: 'company',
        companyId
    });
};

/**
 * Request Product Video upload
 */
const requestProductVideo = async (productId, videoBuffer, companyId, format = 'mp4') => {
    const videoData = videoBuffer.toString('base64');
    return requestDocument('document.product.video.requested', {
        productId,
        videoData,
        format
    }, {
        level: 'company',
        companyId
    });
};

module.exports = {
    requestDocument,
    requestQRCode,
    requestBarcode,
    requestProductImage,
    requestProductVideo
};