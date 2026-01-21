const rabbitmq = require('/app/shared/rabbitmq.js');
const logger = require('../config/logger');
const SalesDocument = require('../models/SalesDocument');
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

const handleInvoiceRequest = async (event) => {
    const { payload, owner, eventId } = event;
    const { invoiceGenerator } = require('../services/invoiceGenerator');
    // Lazy require or top level? Standard is top level but cycle risk is low here.
    const InvoiceGenerator = require('../services/invoiceGenerator');

    logger.info(`Generating Invoice PDF for Invoice: ${payload.invoiceData.invoiceNumber}`);

    const pdfStream = InvoiceGenerator.generate(payload);

    const companyId = owner.companyId && owner.companyId !== 'unknown' ? owner.companyId : (payload.companyId || 'unknown');
    const saleId = payload.saleData.saleId || 'unknown';
    const publicId = `invoice_${payload.invoiceData.invoiceNumber}_${Date.now()}`;
    const folder = `invexis/companies/${companyId}/sales/${saleId}/invoices`;

    try {
        const result = await withRetry(() => uploadStream(pdfStream, folder, publicId, 'pdf'));

        const docId = crypto.randomUUID();
        const doc = new SalesDocument({
            documentId: docId,
            type: 'invoice',
            category: 'invoice',
            owner: owner,
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: { sourceEventId: eventId, invoiceNumber: payload.invoiceData.invoiceNumber }
        });
        await doc.save();

        // Emit result so Sales service can update the sales record
        await rabbitmq.publish('events_topic', 'document.invoice.created', {
            type: 'document.invoice.created',
            data: {
                documentId: docId,
                url: result.secure_url,
                owner: owner,
                context: {
                    ...payload.context,
                    invoiceId: payload.invoiceData.invoiceId,
                    saleId: payload.saleData.saleId
                }
            }
        });
        logger.info(`Invoice generated and uploaded: ${docId}`);

    } catch (err) {
        logger.error(`Failed to generate invoice ${payload.invoiceData.invoiceNumber}`, err);
    }
};

const handleInvoiceEvent = async (event, key) => {
    if (key === 'document.invoice.requested') {
        await handleInvoiceRequest(event);
    } else {
        logger.warn(`No handler for invoice event key: ${key}`);
    }
};

module.exports = handleInvoiceEvent;
