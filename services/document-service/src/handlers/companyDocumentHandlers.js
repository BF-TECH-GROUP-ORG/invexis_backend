const rabbitmq = require('/app/shared/rabbitmq.js');
const logger = require('../config/logger');
const CompanyDocument = require('../models/CompanyDocument');
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

/**
 * Handle company verification document upload request
 */
const handleCompanyVerificationDocRequest = async (event) => {
    const { payload, owner, eventId } = event;

    logger.info(`Uploading verification document for company: ${owner.companyId}`);

    try {
        // Payload contains base64 document data
        const docBuffer = Buffer.from(payload.documentData, 'base64');
        const stream = require('stream');
        const bufferStream = new stream.PassThrough();
        bufferStream.end(docBuffer);

        const publicId = `verification_${payload.documentId}_${Date.now()}`;
        const folder = `invexis/companies/${owner.companyId}/verification`;

        // Determine resource type based on format
        let resourceType = 'auto';
        if (payload.format === 'pdf') {
            resourceType = 'raw';
        } else if (['mp4', 'mov', 'avi'].includes(payload.format)) {
            resourceType = 'video';
        } else if (['jpg', 'jpeg', 'png', 'gif'].includes(payload.format)) {
            resourceType = 'image';
        }

        const result = await withRetry(() => uploadStream(bufferStream, folder, publicId, payload.format, resourceType));

        const docId = crypto.randomUUID();
        const doc = new CompanyDocument({
            documentId: docId,
            type: 'verification_document',
            category: 'company',
            owner: owner,
            storage: {
                provider: 'cloudinary',
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                size: result.bytes
            },
            metadata: {
                companyId: owner.companyId,
                originalName: payload.originalName,
                documentType: payload.documentType,
                notes: payload.notes,
                uploadedBy: payload.uploadedBy
            }
        });
        await doc.save();

        await rabbitmq.publish('events_topic', 'document.company.verification.created', {
            type: 'document.company.verification.created',
            documentId: docId,
            url: result.secure_url,
            companyId: owner.companyId,
            originalDocumentId: payload.documentId,
            metadata: {
                originalName: payload.originalName,
                documentType: payload.documentType,
                size: result.bytes,
                format: result.format,
                cloudinary_public_id: result.public_id
            },
            owner: owner
        });

        logger.info(`Company verification document uploaded: ${docId}`);
    } catch (err) {
        logger.error(`Failed to upload verification document for company ${owner.companyId}`, err);

        // Emit failure event so company-service can handle it
        try {
            await rabbitmq.publish('events_topic', 'document.company.verification.failed', {
                type: 'document.company.verification.failed',
                companyId: owner.companyId,
                documentId: payload.documentId,
                error: err.message,
                owner: owner
            });
        } catch (publishErr) {
            logger.error('Failed to publish failure event', publishErr);
        }
    }
};

module.exports = {
    handleCompanyVerificationDocRequest
};
