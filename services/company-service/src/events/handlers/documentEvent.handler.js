const logger = require('../../utils/logger');
const Company = require('../../models/company.model');
const db = require('../../config');
const { delCache } = require('../../utils/redisHelper');

/**
 * Handle document.company.verification.created event
 * Updates company metadata with final Cloudinary URL after document-service completes upload
 */
const handleVerificationDocumentCreated = async (event) => {
    const { companyId, originalDocumentId, url, metadata } = event;

    logger.info(`Processing verification document created event for company ${companyId}, doc ${originalDocumentId}`);

    try {
        // Fetch current company
        const company = await Company.findCompanyById(companyId);
        if (!company) {
            logger.error(`Company not found: ${companyId}`);
            return;
        }

        // Parse metadata
        let companyMetadata = company.metadata || {};
        if (typeof companyMetadata === "string") {
            try {
                companyMetadata = JSON.parse(companyMetadata);
            } catch (err) {
                companyMetadata = {};
            }
        }

        const verification = companyMetadata.verification || {};
        const documents = Array.isArray(verification.documents) ? verification.documents : [];

        // Find the document by ID and update it with final URL
        const docIndex = documents.findIndex(doc => doc.id === originalDocumentId);
        if (docIndex === -1) {
            logger.warn(`Document ${originalDocumentId} not found in company ${companyId} metadata`);
            return;
        }

        // Update document with final Cloudinary data
        documents[docIndex] = {
            ...documents[docIndex],
            url: url,
            cloudinary_public_id: metadata.cloudinary_public_id,
            format: metadata.format,
            size: metadata.size,
            status: 'completed' // Mark as completed
        };

        // Update company metadata
        companyMetadata.verification = {
            ...verification,
            documents: documents
        };

        // Persist to database
        await db("companies").where({ id: companyId }).update({
            metadata: companyMetadata,
            updatedAt: new Date()
        });

        // Invalidate cache
        await delCache(`company:${companyId}`);

        logger.info(`Updated company ${companyId} with verification document URL: ${url}`);
    } catch (err) {
        logger.error(`Failed to process verification document created event for company ${companyId}`, err);
    }
};

/**
 * Handle document.company.verification.failed event
 * Updates document status to 'failed' in company metadata
 */
const handleVerificationDocumentFailed = async (event) => {
    const { companyId, documentId, error } = event;

    logger.error(`Verification document upload failed for company ${companyId}, doc ${documentId}: ${error}`);

    try {
        const company = await Company.findCompanyById(companyId);
        if (!company) {
            logger.error(`Company not found: ${companyId}`);
            return;
        }

        let companyMetadata = company.metadata || {};
        if (typeof companyMetadata === "string") {
            try {
                companyMetadata = JSON.parse(companyMetadata);
            } catch (err) {
                companyMetadata = {};
            }
        }

        const verification = companyMetadata.verification || {};
        const documents = Array.isArray(verification.documents) ? verification.documents : [];

        const docIndex = documents.findIndex(doc => doc.id === documentId);
        if (docIndex !== -1) {
            documents[docIndex] = {
                ...documents[docIndex],
                status: 'failed',
                error: error
            };

            companyMetadata.verification = {
                ...verification,
                documents: documents
            };

            await db("companies").where({ id: companyId }).update({
                metadata: companyMetadata,
                updatedAt: new Date()
            });

            await delCache(`company:${companyId}`);
        }

        logger.info(`Marked document ${documentId} as failed for company ${companyId}`);
    } catch (err) {
        logger.error(`Failed to process verification document failed event for company ${companyId}`, err);
    }
};

/**
 * Main document event handler
 */
const handleDocumentEvent = async (event, key) => {
    // Ignore request events (we only handle response events)
    if (key === 'document.company.verification.requested') {
        return;
    }

    if (key === 'document.company.verification.created') {
        await handleVerificationDocumentCreated(event);
    } else if (key === 'document.company.verification.failed') {
        await handleVerificationDocumentFailed(event);
    } else {
        logger.warn(`No handler for document event key: ${key}`);
    }
};

module.exports = handleDocumentEvent;
