// src/services/invoiceService.js
// Invoice generation and management service

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const invoiceRepository = require('../repositories/invoiceRepository');
const { INVOICE_STATUS } = require('../utils/constants');

class InvoiceService {
    /**
     * Generate invoice from payment data
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Created invoice
     */
    async generateInvoice(paymentData) {
        try {
            const invoiceData = {
                payment_id: paymentData.payment_id,
                user_id: paymentData.user_id,
                seller_id: paymentData.seller_id,
                company_id: paymentData.company_id,
                amount_due: paymentData.amount,
                currency: paymentData.currency,
                status: INVOICE_STATUS.OPEN,
                line_items: paymentData.lineItems || [],
                metadata: {
                    payment_method: paymentData.method,
                    gateway: paymentData.gateway,
                    description: paymentData.description
                }
            };

            const invoice = await invoiceRepository.createInvoice(invoiceData);

            // Generate PDF asynchronously
            this.generatePDF(invoice.invoice_id).catch(err => {
                console.error('PDF generation failed:', err);
            });

            return invoice;
        } catch (error) {
            console.error('Invoice generation error:', error);
            throw new Error(`Failed to generate invoice: ${error.message}`);
        }
    }

    /**
     * Generate PDF invoice
     * @param {string} invoice_id - Invoice ID
     * @returns {Promise<string>} Cloudinary URL to PDF
     */
    async generatePDF(invoice_id) {
        try {
            const invoice = await invoiceRepository.getInvoiceById(invoice_id);

            if (!invoice) {
                throw new Error('Invoice not found');
            }

            // Create invoices directory if it doesn't exist
            const invoicesDir = path.join(__dirname, '../../invoices');
            if (!fs.existsSync(invoicesDir)) {
                fs.mkdirSync(invoicesDir, { recursive: true });
            }

            const filename = `invoice_${invoice_id}.pdf`;
            const filepath = path.join(invoicesDir, filename);

            // Create PDF document
            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Add invoice content
            this.addInvoiceHeader(doc, invoice);
            this.addInvoiceDetails(doc, invoice);
            this.addLineItems(doc, invoice);
            this.addInvoiceFooter(doc, invoice);

            doc.end();

            // Wait for PDF to be written
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            // Upload to Cloudinary
            const { uploadInvoicePDF } = require('../utils/cloudinaryUpload');
            const cloudinaryResult = await uploadInvoicePDF(filepath, invoice_id);

            // Update invoice with Cloudinary URL
            await invoiceRepository.updateInvoice(invoice_id, {
                pdf_url: cloudinaryResult.url,
                metadata: {
                    ...invoice.metadata,
                    cloudinary_id: cloudinaryResult.cloudinary_id,
                    pdf_size: cloudinaryResult.size,
                    uploaded_at: cloudinaryResult.created_at
                }
            });

            return cloudinaryResult.url;
        } catch (error) {
            console.error('PDF generation error:', error);
            throw new Error(`Failed to generate invoice PDF: ${error.message}`);
        }
    }

    /**
     * Add invoice header to PDF
     */
    addInvoiceHeader(doc, invoice) {
        doc
            .fontSize(20)
            .text('INVOICE', { align: 'center' })
            .moveDown();

        doc
            .fontSize(10)
            .text(`Invoice #: ${invoice.invoice_id}`, 50, 120)
            .text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 50, 135)
            .text(`Status: ${invoice.status.toUpperCase()}`, 50, 150)
            .moveDown();
    }

    /**
     * Add invoice details to PDF
     */
    addInvoiceDetails(doc, invoice) {
        doc
            .fontSize(12)
            .text('Invoice Details:', 50, 180)
            .fontSize(10)
            .text(`Seller ID: ${invoice.seller_id}`, 50, 200)
            .text(`User ID: ${invoice.user_id}`, 50, 215)
            .text(`Amount: ${invoice.currency} ${(invoice.amount_due / 100).toFixed(2)}`, 50, 230)
            .moveDown();
    }

    /**
     * Add line items to PDF
     */
    addLineItems(doc, invoice) {
        if (!invoice.line_items || invoice.line_items.length === 0) {
            return;
        }

        doc
            .fontSize(12)
            .text('Line Items:', 50, 270)
            .moveDown();

        let y = 290;
        invoice.line_items.forEach((item, index) => {
            doc
                .fontSize(10)
                .text(`${index + 1}. ${item.name}`, 50, y)
                .text(`Qty: ${item.quantity} x ${item.unit_price || item.unitPrice}`, 300, y)
                .text(`Total: ${item.total}`, 450, y);
            y += 20;
        });
    }

    /**
     * Add invoice footer to PDF
     */
    addInvoiceFooter(doc, invoice) {
        doc
            .fontSize(10)
            .text('Thank you for your business!', 50, 700, { align: 'center' })
            .text(`Generated: ${new Date().toLocaleString()}`, 50, 720, { align: 'center' });
    }

    /**
     * Get invoice by ID
     */
    async getInvoice(invoice_id) {
        return await invoiceRepository.getInvoiceById(invoice_id);
    }

    /**
     * Get user invoices
     */
    async getUserInvoices(user_id, options = {}) {
        return await invoiceRepository.getInvoicesByUserId(user_id, options);
    }

    /**
     * Get seller invoices
     */
    async getSellerInvoices(seller_id, options = {}) {
        return await invoiceRepository.getInvoicesBySellerId(seller_id, options);
    }

    /**
     * Mark invoice as paid
     */
    async markAsPaid(invoice_id) {
        return await invoiceRepository.updateInvoiceStatus(invoice_id, INVOICE_STATUS.PAID);
    }

    /**
     * Void invoice
     */
    async voidInvoice(invoice_id) {
        return await invoiceRepository.updateInvoiceStatus(invoice_id, INVOICE_STATUS.VOID);
    }
}

module.exports = new InvoiceService();
