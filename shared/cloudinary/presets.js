const { createUploadMiddleware } = require('./upload');

/**
 * Predefined upload configurations for common use cases
 * Services can use these presets or create custom configurations
 */

/**
 * For inventory-service: Product images and videos
 * Folder structure: products/{shopId}/{productId}/
 */
const productMediaPreset = {
    images: (shopId) => createUploadMiddleware({
        folder: `products/${shopId}/{id}`,
        allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        maxFileSize: 50 * 1024 * 1024, // 50MB
        resourceType: 'image',
        transformation: {
            quality: 'auto',
            fetch_format: 'auto',
        },
    }),

    videos: (shopId) => createUploadMiddleware({
        folder: `products/${shopId}/{id}`,
        allowedFormats: ['mp4', 'mov', 'avi', 'webm'],
        maxFileSize: 100 * 1024 * 1024, // 100MB
        resourceType: 'video',
    }),
};

/**
 * For auth-service: Profile pictures
 * Folder structure: profiles/{userId}/
 */
const profilePicturePreset = createUploadMiddleware({
    folder: 'profiles/{id}',
    allowedFormats: ['jpg', 'jpeg', 'png', 'gif'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    resourceType: 'image',
    transformation: {
        width: 500,
        height: 500,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto',
        fetch_format: 'auto',
    },
});

/**
 * For company-service: Verification documents
 * Folder structure: verification-docs/{companyId}/
 */
const verificationDocsPreset = createUploadMiddleware({
    folder: 'verification-docs/{id}',
    allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    resourceType: 'auto',
});

/**
 * Generic document upload
 */
const documentPreset = createUploadMiddleware({
    folder: 'documents',
    allowedFormats: ['pdf', 'doc', 'docx', 'txt', 'csv', 'xlsx'],
    maxFileSize: 20 * 1024 * 1024, // 20MB
    resourceType: 'raw',
});

/**
 * Generic image upload
 */
const imagePreset = createUploadMiddleware({
    folder: 'images',
    allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    resourceType: 'image',
});

/**
 * For sales-service: Invoice PDFs
 * Folder structure: invoices/{companyId}/{saleId}/
 * Note: This preset is for HTTP uploads. For buffer uploads, use uploadBuffer directly.
 */
const invoicePdfPreset = createUploadMiddleware({
    folder: 'invoices/{companyId}/{saleId}',
    allowedFormats: ['pdf'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    resourceType: 'raw',
});

/**
 * Invoice PDF folder configuration (for use with uploadBuffer)
 */
const invoicePdfConfig = {
    folder: (companyId, saleId) => `invoices/${companyId}/${saleId}`,
    resourceType: 'raw',
    format: 'pdf',
    maxFileSize: 10 * 1024 * 1024, // 10MB
};

module.exports = {
    productMediaPreset,
    profilePicturePreset,
    verificationDocsPreset,
    documentPreset,
    imagePreset,
    invoicePdfPreset,
    invoicePdfConfig,
};
