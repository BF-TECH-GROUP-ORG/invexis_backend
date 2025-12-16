// src/repositories/invoiceRepository.js
// Database operations for invoices table

const { db } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class InvoiceRepository {
    /**
     * Create a new invoice
     * @param {Object} invoiceData - Invoice information
     * @returns {Promise<Object>} Created invoice
     */
    async createInvoice(invoiceData) {
        const {
            payment_id,
            user_id,
            seller_id,
            company_id,
            amount_due,
            currency,
            status,
            line_items,
            pdf_url,
            metadata
        } = invoiceData;

        const invoice_id = uuidv4();

        const [invoice] = await db('invoices')
            .insert({
                invoice_id,
                payment_id,
                user_id,
                seller_id,
                company_id,
                amount_due,
                currency: currency || 'XAF',
                status: status || 'open',
                line_items: line_items || [],
                pdf_url,
                metadata: metadata || {},
                created_at: new Date()
            })
            .returning('*');

        return invoice;
    }

    /**
     * Get invoice by invoice_id
     * @param {string} invoice_id - Invoice UUID
     * @returns {Promise<Object|null>} Invoice record
     */
    async getInvoiceById(invoice_id) {
        const invoice = await db('invoices')
            .where({ invoice_id })
            .first();

        return invoice || null;
    }

    /**
     * Get invoice by payment_id
     * @param {string} payment_id - Payment UUID
     * @returns {Promise<Object|null>} Invoice record
     */
    async getInvoiceByPaymentId(payment_id) {
        const invoice = await db('invoices')
            .where({ payment_id })
            .first();

        return invoice || null;
    }

    /**
     * Update invoice status
     * @param {string} invoice_id - Invoice UUID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated invoice
     */
    async updateInvoiceStatus(invoice_id, updates) {
        const { status, pdf_url, metadata } = updates;

        const updateData = {};

        if (status) {
            updateData.status = status;
            // Set paid_at when status changes to paid
            if (status === 'paid') {
                updateData.paid_at = new Date();
            }
        }

        if (pdf_url) {
            updateData.pdf_url = pdf_url;
        }

        if (metadata) {
            updateData.metadata = db.raw('metadata || ?::jsonb', [JSON.stringify(metadata)]);
        }

        const [invoice] = await db('invoices')
            .where({ invoice_id })
            .update(updateData)
            .returning('*');

        return invoice;
    }

    /**
     * Get invoices by user
     * @param {string} user_id - User UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of invoices
     */
    async getInvoicesByUser(user_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('invoices')
            .where({ user_id })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where({ status });
        }

        return await query;
    }

    /**
     * Get invoices by seller
     * @param {string} seller_id - Seller UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of invoices
     */
    async getInvoicesBySeller(seller_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('invoices')
            .where({ seller_id })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where({ status });
        }

        return await query;
    }

    /**
     * Get invoices by company
     * @param {string} company_id - Company UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of invoices
     */
    async getInvoicesByCompany(company_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('invoices')
            .where({ company_id })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where({ status });
        }

        return await query;
    }
}

module.exports = new InvoiceRepository();
