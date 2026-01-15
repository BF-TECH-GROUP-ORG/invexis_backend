const rabbitmq = require('/app/shared/rabbitmq.js');
const logger = require('../config/logger');
const InventoryDocument = require('../models/InventoryDocument');
const { uploadStream } = require('../services/cloudinaryService');
const crypto = require('crypto');

/**
 * Retry helper for robust operations
 */
const withRetry = async (fn, retries = 3, delay = 1000) => {
    try {
        return await fn();
    } catch (err) {
        if (retries === 0) throw err;
        logger.warn(`Operation failed, retrying in ${delay}ms... (${retries} retries left) - ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 2);
    }
};

const handleProductQRRequest = async (event) => {
    const { payload, owner, eventId } = event;
    logger.info(`Generating QR Code for product: ${payload.productId}`);

    try {
        const { generateQrStream } = require('../services/codeGenerator');
        const qrStream = await generateQrStream(payload.text || payload.sku);
        const publicId = `qr_${payload.productId}_${Date.now()}`;
        const folder = `invexis/companies/${owner.companyId}/products/qr`;

        const result = await withRetry(() => uploadStream(qrStream, folder, publicId, 'png'));

        const docId = crypto.randomUUID();
        const doc = new InventoryDocument({
            documentId: docId,
            type: 'qrcode',
            category: 'product',
            owner: owner,
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: { productId: payload.productId, sku: payload.sku }
        });
        await doc.save();

        await rabbitmq.publish('events_topic', 'document.product.qr.created', {
            type: 'document.product.qr.created',
            documentId: docId,
            url: result.secure_url,
            productId: payload.productId,
            owner: owner
        });

        logger.info(`QR Code generated: ${docId}`);
    } catch (err) {
        logger.error(`Failed to generate QR for product ${payload.productId}`, err);
    }
};

const handleProductBarcodeRequest = async (event) => {
    const { payload, owner, eventId } = event;

    logger.info(`Generating Barcode for product: ${payload.productId}`);

    try {
        const { generateBarcodeStream } = require('../services/codeGenerator');
        const barcodeStream = generateBarcodeStream(payload.text || payload.sku);
        const publicId = `barcode_${payload.productId}_${Date.now()}`;
        const folder = `invexis/companies/${owner.companyId}/products/barcodes`;

        const result = await withRetry(() => uploadStream(barcodeStream, folder, publicId, 'png'));

        const docId = crypto.randomUUID();
        const doc = new InventoryDocument({
            documentId: docId,
            type: 'barcode',
            category: 'product',
            owner: owner,
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: { productId: payload.productId, sku: payload.sku }
        });
        await doc.save();

        await rabbitmq.publish('events_topic', 'document.product.barcode.created', {
            type: 'document.product.barcode.created',
            documentId: docId,
            url: result.secure_url,
            productId: payload.productId,
            owner: owner
        });

        logger.info(`Barcode generated: ${docId}`);
    } catch (err) {
        logger.error(`Failed to generate barcode for product ${payload.productId}`, err);
    }
};

const handleProductImageRequest = async (event) => {
    const { payload, owner, eventId } = event;

    logger.info(`Uploading product image for: ${payload.productId}`);

    try {
        // Payload should contain base64 image or buffer
        const imageBuffer = Buffer.from(payload.imageData, 'base64');
        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(imageBuffer);

        const publicId = `product_${payload.productId}_${Date.now()}`;
        const folder = `invexis/companies/${owner.companyId}/products/images`;

        const result = await withRetry(() => uploadStream(bufferStream, folder, publicId, payload.format || 'jpg'));

        const docId = crypto.randomUUID();
        const doc = new InventoryDocument({
            documentId: docId,
            type: 'image',
            category: 'product',
            owner: owner,
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: { productId: payload.productId }
        });
        await doc.save();

        await rabbitmq.publish('events_topic', 'document.product.image.created', {
            type: 'document.product.image.created',
            documentId: docId,
            url: result.secure_url,
            productId: payload.productId,
            owner: owner
        });

        logger.info(`Product image uploaded: ${docId}`);
    } catch (err) {
        logger.error(`Failed to upload image for product ${payload.productId}`, err);
    }
};

const handleProductVideoRequest = async (event) => {
    const { payload, owner } = event;
    logger.info(`Uploading product video for: ${payload.productId}`);

    try {
        const videoBuffer = Buffer.from(payload.videoData, 'base64');
        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(videoBuffer);

        const publicId = `product_video_${payload.productId}_${Date.now()}`;
        const folder = `invexis/companies/${owner.companyId}/products/videos`;

        // Request 'video' resource type explicitly
        const result = await withRetry(() => uploadStream(bufferStream, folder, publicId, payload.format || 'mp4', 'video'));

        const docId = crypto.randomUUID();
        const doc = new InventoryDocument({
            documentId: docId,
            type: 'video',
            category: 'product',
            owner: owner,
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: { productId: payload.productId }
        });
        await doc.save();

        await rabbitmq.publish('events_topic', 'document.product.video.created', {
            type: 'document.product.video.created',
            documentId: docId,
            url: result.secure_url,
            productId: payload.productId,
            owner: owner
        });

        logger.info(`Product video uploaded: ${docId}`);
    } catch (err) {
        logger.error(`Failed to upload video for product ${payload.productId}`, err);
    }
};

const handleDocumentEvent = async (event, key) => {
    if (key === 'document.product.qr.requested') {
        await handleProductQRRequest(event);
    } else if (key === 'document.product.barcode.requested') {
        await handleProductBarcodeRequest(event);
    } else if (key === 'document.product.image.requested') {
        await handleProductImageRequest(event);
    } else if (key === 'document.product.video.requested') {
        await handleProductVideoRequest(event);
    } else if (key === 'document.company.verification.requested') {
        const { handleCompanyVerificationDocRequest } = require('./companyDocumentHandlers');
        await handleCompanyVerificationDocRequest(event);
    } else {
        logger.warn(`No handler for document event key: ${key}`);
    }
};

module.exports = handleDocumentEvent;
