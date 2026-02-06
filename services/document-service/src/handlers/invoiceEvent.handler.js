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
    const InvoiceGenerator = require('../services/invoiceGenerator');

    logger.info(`Generating Invoice PDF for Invoice: ${payload.invoiceData.invoiceNumber}`);

    const pdfStream = InvoiceGenerator.generate(payload);

    const companyId = owner.companyId && owner.companyId !== 'unknown' ? owner.companyId : (payload.companyId || 'unknown');
    const saleId = payload.saleData.saleId || 'unknown';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Detect domain (Debt vs Sale)
    const isDebt = payload.debtData || payload.metadata?.type === 'DEBT';
    const domain = isDebt ? 'Debt' : 'Sales';
    const shopName = payload.companyData?.shopName || '';
    const invoiceNumber = payload.invoiceData.invoiceNumber;

    const publicId = `${domain.toLowerCase()}_${invoiceNumber}_${Date.now()}`;
    const folder = `invexis/companies/${companyId}/documents/${year}/${month}/${domain}`;

    try {
        const result = await withRetry(() => uploadStream(pdfStream, folder, publicId, 'pdf'));

        const docId = crypto.randomUUID();
        const displayName = isDebt
            ? `Payment Receipt - ${invoiceNumber}${shopName ? ` (${shopName})` : ''}`
            : `Invoice - ${invoiceNumber}${shopName ? ` (${shopName})` : ''}`;

        const baseDoc = {
            documentId: docId,
            displayName: displayName,
            owner: owner,
            period: { start: now, end: now },
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: {
                sourceEventId: eventId,
                invoiceNumber: invoiceNumber,
                saleId: saleId,
                shopName: shopName,
                companyName: payload.companyData?.name
            }
        };

        if (isDebt) {
            const DebtDocument = require('../models/DebtDocument');
            const doc = new DebtDocument({
                ...baseDoc,
                type: 'payment_receipt',
                reference: {
                    invoiceNo: invoiceNumber,
                    saleId: saleId,
                    customerId: payload.saleData?.customerId || payload.metadata?.customerId
                }
            });
            await doc.save();
            logger.info(`Debt proof saved to DebtDocument: ${docId} [${displayName}]`);
        } else {
            const doc = new SalesDocument({
                ...baseDoc,
                type: 'invoice'
            });
            await doc.save();
            logger.info(`Sale doc saved to SalesDocument: ${docId} [${displayName}]`);
        }

        // Emit result so Sales/Payment service can update the records
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
