const rabbitmq = require('/app/shared/rabbitmq.js');
const logger = require('../config/logger');
const ReportDocument = require('../models/ReportDocument');
const { generatePdfStream } = require('../services/pdfGenerator');
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

const handleReportExport = async (event) => {
    const { payload, owner, eventId } = event;
    const { title, data, template } = payload;

    logger.info(`Generating PDF for Report: ${title}`);

    // 1. Generate Stream
    const pdfStream = generatePdfStream(title, data, template);

    // 2. Upload to Cloudinary
    const publicId = `report_${owner.companyId || 'sys'}_${Date.now()}`;
    // Retry logic is here
    try {
        const result = await withRetry(() => uploadStream(pdfStream, 'invexis_reports', publicId, 'pdf'));

        // 3. Save Metadata
        const docId = crypto.randomUUID();
        const doc = new ReportDocument({
            documentId: docId,
            type: 'pdf',
            category: 'report',
            owner: owner,
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: { sourceEventId: eventId, title }
        });
        await doc.save();

        // 4. Emit Completion
        await rabbitmq.publish('events_topic', 'document.created', {
            type: 'document.created',
            documentId: docId,
            url: result.secure_url,
            owner: owner,
            relatedContext: { service: 'report-service', reportType: 'pdf' }
        });

        logger.info(`Report Generated and Uploaded: ${docId}`);
    } catch (err) {
        logger.error(`Failed to generate report ${title}`, err);
    }
};

const handleReportEvent = async (event, key) => {
    if (key === 'report.export_requested') {
        await handleReportExport(event);
    } else {
        logger.warn(`No handler for report event key: ${key}`);
    }
};

module.exports = handleReportEvent;
