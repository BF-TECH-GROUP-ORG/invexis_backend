const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

/**
 * Request document generation/upload from document-service
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
 * Request company verification document upload
 * @param {string} companyId - Company ID
 * @param {Buffer} documentBuffer - Document file buffer
 * @param {object} metadata - Document metadata (originalName, documentType, notes, etc.)
 */
const requestCompanyVerificationDoc = async (companyId, documentBuffer, metadata) => {
    const documentData = documentBuffer.toString('base64');

    return requestDocument('document.company.verification.requested', {
        documentId: metadata.documentId,
        documentData,
        format: metadata.format,
        originalName: metadata.originalName,
        documentType: metadata.documentType,
        notes: metadata.notes,
        uploadedBy: metadata.uploadedBy
    }, {
        level: 'company',
        companyId
    });
};

module.exports = {
    requestDocument,
    requestCompanyVerificationDoc
};
