// src/utils/cloudinaryUpload.js
// Cloudinary upload utility for invoices and documents

const { createUploadMiddleware, handleUploadError } = require('/app/shared/cloudinary');
const fs = require('fs');
const path = require('path');

/**
 * Upload invoice PDF to Cloudinary
 * @param {string} filePath - Local path to PDF file
 * @param {string} invoiceId - Invoice ID for folder organization
 * @returns {Promise<Object>} Cloudinary upload result
 */
async function uploadInvoicePDF(filePath, invoiceId) {
    try {
        const cloudinary = require('/app/shared/cloudinary').cloudinary;

        // Upload PDF to Cloudinary
        const result = await cloudinary.uploader.upload(filePath, {
            folder: `payments/invoices/${invoiceId}`,
            resource_type: 'raw', // For PDFs
            public_id: `invoice_${invoiceId}`,
            format: 'pdf',
            access_mode: 'public',
            tags: ['invoice', 'payment']
        });

        // Delete local file after successful upload
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return {
            url: result.secure_url,
            cloudinary_id: result.public_id,
            format: result.format,
            size: result.bytes,
            created_at: result.created_at
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw new Error(`Failed to upload invoice to Cloudinary: ${error.message}`);
    }
}

/**
 * Delete invoice PDF from Cloudinary
 * @param {string} cloudinaryId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteInvoicePDF(cloudinaryId) {
    try {
        const cloudinary = require('/app/shared/cloudinary').cloudinary;

        const result = await cloudinary.uploader.destroy(cloudinaryId, {
            resource_type: 'raw'
        });

        return result;
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        throw new Error(`Failed to delete invoice from Cloudinary: ${error.message}`);
    }
}

/**
 * Create upload middleware for invoice attachments
 * Handles file uploads for invoices (receipts, supporting documents)
 */
const createInvoiceUploadMiddleware = () => {
    return createUploadMiddleware({
        folder: 'payments/invoices/attachments',
        allowedFormats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
        maxFileSize: 10 * 1024 * 1024, // 10MB
        resourceType: 'auto'
    }).array('attachments', 5);
};

/**
 * Handle invoice attachment uploads
 */
const handleInvoiceUploads = (req, res, next) => {
    const upload = createInvoiceUploadMiddleware();

    upload(req, res, (err) => {
        if (err) {
            return handleUploadError(err, req, res, next);
        }

        // Process uploaded files
        if (req.files && req.files.length > 0) {
            req.body.attachments = req.files.map(file => ({
                url: file.path,
                cloudinary_id: file.filename,
                type: file.mimetype.startsWith('image/') ? 'image' : 'document',
                format: file.format,
                size: file.size,
                originalName: file.originalname
            }));
        }

        next();
    });
};

/**
 * Upload payment receipt to Cloudinary
 * @param {string} filePath - Local path to receipt file
 * @param {string} paymentId - Payment ID for folder organization
 * @returns {Promise<Object>} Cloudinary upload result
 */
async function uploadPaymentReceipt(filePath, paymentId) {
    try {
        const cloudinary = require('/app/shared/cloudinary').cloudinary;

        const result = await cloudinary.uploader.upload(filePath, {
            folder: `payments/receipts/${paymentId}`,
            resource_type: 'auto',
            public_id: `receipt_${paymentId}`,
            access_mode: 'public',
            tags: ['receipt', 'payment']
        });

        // Delete local file after successful upload
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return {
            url: result.secure_url,
            cloudinary_id: result.public_id,
            format: result.format,
            size: result.bytes,
            type: result.resource_type
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw new Error(`Failed to upload receipt to Cloudinary: ${error.message}`);
    }
}

module.exports = {
    uploadInvoicePDF,
    deleteInvoicePDF,
    createInvoiceUploadMiddleware,
    handleInvoiceUploads,
    uploadPaymentReceipt
};
