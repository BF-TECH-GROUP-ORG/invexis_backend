const Product = require('../../models/Product');
const logger = require('../logger');

/**
 * Handle document creation events from document-service
 * @param {object} event - Event payload
 * @param {string} routingKey - Routing key
 */
const handleDocumentEvent = async (event, routingKey) => {
    try {
        logger.info(`Received document event: ${routingKey}`);

        if (routingKey === 'document.product.qr.created') {
            const { productId, url } = event;
            if (productId && url) {
                const product = await Product.findById(productId);
                if (product) {
                    product.qrCodeUrl = url;
                    await product.save();
                    logger.info(`✅ Product ${productId} updated with QR Code: ${url}`);
                } else {
                    logger.warn(`⚠️ Product ${productId} not found for QR update`);
                }
            }
        } else if (routingKey === 'document.product.barcode.created') {
            const { productId, url } = event;
            if (productId && url) {
                const product = await Product.findById(productId);
                if (product) {
                    product.barcodeUrl = url;
                    await product.save();
                    logger.info(`✅ Product ${productId} updated with Barcode: ${url}`);
                } else {
                    logger.warn(`⚠️ Product ${productId} not found for Barcode update`);
                }
            }
        } else if (routingKey === 'document.product.image.created') {
            const { productId, url } = event;
            if (productId && url) {
                const product = await Product.findById(productId);
                if (product) {
                    // Add to images array if not already present
                    if (!product.images) product.images = [];
                    if (!product.images.includes(url)) {
                        product.images.push(url);
                    }
                    await product.save();
                    logger.info(`✅ Product ${productId} updated with image: ${url}`);
                } else {
                    logger.warn(`⚠️ Product ${productId} not found for image update`);
                }
            }
        } else if (routingKey === 'document.product.video.created') {
            const { productId, url } = event;
            if (productId && url) {
                const product = await Product.findById(productId);
                if (product) {
                    // Add to videoUrls array if not already present
                    if (!product.videoUrls) product.videoUrls = [];
                    if (!product.videoUrls.includes(url)) {
                        product.videoUrls.push(url);
                    }
                    await product.save();
                    logger.info(`✅ Product ${productId} updated with video: ${url}`);
                } else {
                    logger.warn(`⚠️ Product ${productId} not found for video update`);
                }
            }
        }

    } catch (err) {
        logger.error('❌ Error handling document event:', err);
        throw err;
    }
};

module.exports = handleDocumentEvent;
