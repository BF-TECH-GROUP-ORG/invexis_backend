// src/controllers/invoiceController.js
// Invoice controller for managing invoices

const invoiceService = require('../services/invoiceService');
const { successResponse, errorResponse } = require('../utils/responses');
const fs = require('fs');

class InvoiceController {
    /**
     * Get invoice by ID
     * GET /payment/invoices/:invoice_id
     */
    async getInvoice(req, res) {
        try {
            const { invoice_id } = req.params;

            if (!invoice_id) {
                return errorResponse(res, 'Invoice ID required', 400);
            }

            const invoice = await invoiceService.getInvoice(invoice_id);

            if (!invoice) {
                return errorResponse(res, 'Invoice not found', 404);
            }

            return successResponse(res, invoice, 'Invoice retrieved');

        } catch (error) {
            console.error('Get invoice error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get user invoices
     * GET /payment/invoices/user/:user_id
     */
    async getUserInvoices(req, res) {
        try {
            const { user_id } = req.params;
            const { limit, offset, status } = req.query;

            if (!user_id) {
                return errorResponse(res, 'User ID required', 400);
            }

            const invoices = await invoiceService.getUserInvoices(user_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status
            });

            return successResponse(res, invoices, 'User invoices retrieved');

        } catch (error) {
            console.error('Get user invoices error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Get seller invoices
     * GET /payment/invoices/seller/:seller_id
     */
    async getSellerInvoices(req, res) {
        try {
            const { seller_id } = req.params;
            const { limit, offset, status } = req.query;

            if (!seller_id) {
                return errorResponse(res, 'Seller ID required', 400);
            }

            const invoices = await invoiceService.getSellerInvoices(seller_id, {
                limit: parseInt(limit) || 50,
                offset: parseInt(offset) || 0,
                status
            });

            return successResponse(res, invoices, 'Seller invoices retrieved');

        } catch (error) {
            console.error('Get seller invoices error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    /**
     * Download invoice PDF
     * GET /payment/invoices/:invoice_id/pdf
     */
    async downloadInvoicePDF(req, res) {
        try {
            const { invoice_id } = req.params;

            if (!invoice_id) {
                return errorResponse(res, 'Invoice ID required', 400);
            }

            const invoice = await invoiceService.getInvoice(invoice_id);

            if (!invoice) {
                return errorResponse(res, 'Invoice not found', 404);
            }

            // If PDF URL exists (Cloudinary), redirect to it
            if (invoice.pdf_url && invoice.pdf_url.startsWith('http')) {
                return res.redirect(invoice.pdf_url);
            }

            // If no PDF exists, generate it
            if (!invoice.pdf_url) {
                const pdfUrl = await invoiceService.generatePDF(invoice_id);
                return res.redirect(pdfUrl);
            }

            // Fallback: serve local file (legacy support)
            if (fs.existsSync(invoice.pdf_url)) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoice_id}.pdf`);

                const fileStream = fs.createReadStream(invoice.pdf_url);
                fileStream.pipe(res);
            } else {
                // PDF missing, regenerate
                const pdfUrl = await invoiceService.generatePDF(invoice_id);
                return res.redirect(pdfUrl);
            }

        } catch (error) {
            console.error('Download invoice PDF error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
}

module.exports = new InvoiceController();
