// src/repositories/invoiceRepository.js
// Database operations for invoices table

const { db } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { toJSONB } = require('../utils/jsonUtils');

class InvoiceRepository {
    /**
     * Create a new invoice
     * @param {Object} invoiceData - Invoice information
     * @returns {Promise<Object>} Created invoice
     */
    async createInvoice(invoiceData) {
        const {
            payment_id,
            seller_id,
            company_id,
            shop_id,
            amount_due,
            currency,
            status,
            line_items,
            customer,
            pdf_url,
            metadata
        } = invoiceData;

        const invoice_id = uuidv4();

        const insertData = {
            invoice_id,
            payment_id,
            seller_id,
            company_id,
            shop_id,
            amount_due,
            currency: currency || 'XAF',
            status: status || 'open',
            line_items: toJSONB(line_items, true),
            customer: toJSONB(customer),
            pdf_url,
            metadata: toJSONB(metadata),
            created_at: new Date()
        };

        const [invoice] = await db('invoices')
            .insert(insertData)
            .returning('*');

        return invoice;
    }

    /**
     * Get invoice by saleId (stored in metadata)
     * @param {number|string} saleId - Sale ID
     * @returns {Promise<Object|null>} Invoice record
     */
    async getInvoiceBySaleId(saleId) {
        if (!saleId) return null;

        const invoice = await db('invoices')
            .whereRaw("metadata->>'saleId' = ?", [String(saleId)])
            .first();

        return invoice || null;
    }

    /**
     * Get invoice by invoice_id
     * @param {string} invoice_id - Invoice UUID
     * @returns {Promise<Object|null>} Invoice record
     */
    async getInvoiceById(invoice_id) {
        const invoice = await db('invoices as i')
            .leftJoin('payments as p', 'i.payment_id', 'p.payment_id')
            .select('i.*', 'p.method as payment_method', 'p.gateway', 'p.reference_id as p_reference')
            .where('i.invoice_id', invoice_id)
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

        if (updates.payment_id) {
            updateData.payment_id = updates.payment_id;
        }

        if (pdf_url) {
            updateData.pdf_url = pdf_url;
        }

        if (metadata) {
            updateData.metadata = db.raw('metadata || ?::jsonb', [toJSONB(metadata)]);
        }

        const [invoice] = await db('invoices')
            .where({ invoice_id })
            .update(updateData)
            .returning('*');

        return invoice;
    }

    /**
     * Get invoices by seller
     * @param {string} seller_id - Seller UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of invoices
     */
    async getInvoicesBySeller(seller_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('invoices as i')
            .leftJoin('payments as p', 'i.payment_id', 'p.payment_id')
            .select('i.*', 'p.method as payment_method', 'p.gateway', 'p.reference_id as p_reference')
            .where('i.seller_id', seller_id)
            .orderBy('i.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where('i.status', status);
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

        let query = db('invoices as i')
            .leftJoin('payments as p', 'i.payment_id', 'p.payment_id')
            .select('i.*', 'p.method as payment_method', 'p.gateway', 'p.reference_id as p_reference')
            .where('i.company_id', company_id)
            .orderBy('i.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where('i.status', status);
        }

        return await query;
    }

    /**
     * Get invoices by shop (via metadata)
     * @param {string} shop_id - Shop UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of invoices
     */
    async getInvoicesByShop(shop_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('invoices as i')
            .leftJoin('payments as p', 'i.payment_id', 'p.payment_id')
            .select('i.*', 'p.method as payment_method', 'p.gateway', 'p.reference_id as p_reference')
            .where('i.shop_id', shop_id)
            .orderBy('i.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where('i.status', status);
        }

        return await query;
    }
}

module.exports = new InvoiceRepository();
