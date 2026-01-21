// src/services/invoiceService.js
// Invoice generation and management service

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
                seller_id: paymentData.seller_id,
                company_id: paymentData.company_id,
                shop_id: paymentData.shop_id,
                amount_due: paymentData.amount,
                currency: paymentData.currency,
                status: INVOICE_STATUS.OPEN,
                customer: paymentData.customer || {},
                line_items: paymentData.lineItems || [],
                metadata: {
                    ...(paymentData.metadata || {}),
                    payment_method: paymentData.method,
                    gateway: paymentData.gateway,
                    description: paymentData.description,
                    shop_id: paymentData.shop_id // Ensure shop_id is stored for filtering
                }
            };

            const invoice = await invoiceRepository.createInvoice(invoiceData);

            // PDF generation is now handled asynchronously by document-service
            // via document.invoice.requested event emitted by paymentService

            return invoice;
        } catch (error) {
            console.error('Invoice generation error:', error);
            throw new Error(`Failed to generate invoice: ${error.message}`);
        }
    }

    /**
     * Get invoice by ID
     */
    async getInvoice(invoice_id) {
        return await invoiceRepository.getInvoiceById(invoice_id);
    }

    /**
     * Get seller invoices
     */
    async getSellerInvoices(seller_id, options = {}) {
        return await invoiceRepository.getInvoicesBySeller(seller_id, options);
    }

    /**
     * Get company invoices
     */
    async getCompanyInvoices(company_id, options = {}) {
        return await invoiceRepository.getInvoicesByCompany(company_id, options);
    }

    /**
     * Get shop invoices
     */
    async getShopInvoices(shop_id, options = {}) {
        return await invoiceRepository.getInvoicesByShop(shop_id, options);
    }

    /**
     * Mark invoice as paid
     */
    async markAsPaid(invoice_id) {
        return await invoiceRepository.updateInvoiceStatus(invoice_id, { status: 'paid' });
    }

    /**
     * Void invoice
     */
    async voidInvoice(invoice_id) {
        return await invoiceRepository.updateInvoiceStatus(invoice_id, { status: 'void' });
    }
}

module.exports = new InvoiceService();
