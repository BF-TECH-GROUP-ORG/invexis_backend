// src/repositories/paymentRepository.js
// Database operations for payments table

const { db } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class PaymentRepository {
    /**
     * Create a new payment record
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Created payment
     */
    async createPayment(paymentData) {
        const {
            seller_id,
            company_id,
            shop_id,
            order_id,
            amount,
            currency,
            description,
            type,           // SALE, DEBT, TIER, SUBSCRIPTION, ECOMM
            method,         // CARD, MOBILE_MONEY
            gateway,        // STRIPE, MTN_MOMO, etc
            gateway_token,
            reference_id,   // External reference (Sale ID)
            idempotency_key,
            customer,       // { name, email, phone }
            line_items,
            metadata,
            payout_recipient_id,
            payout_details,
            location
        } = paymentData;

        const payment_id = uuidv4();

        // Payout status should only be 'pending' for e-commerce (ECOMM) that require it
        // Otherwise it defaults to 'not_required' via DB default
        let initial_payout_status = 'not_required';
        if (type === 'ECOMM' && payout_recipient_id) {
            initial_payout_status = 'pending';
        }

        const [payment] = await db('payments')
            .insert({
                payment_id,
                seller_id,
                company_id,
                shop_id,
                order_id,
                amount,
                currency: currency || 'XAF',
                description,
                type: type || 'SALE',
                method,
                gateway,
                gateway_token,
                reference_id,
                idempotency_key,
                customer: customer || {},
                line_items: JSON.stringify(line_items || []),
                status: 'pending',
                payout_status: initial_payout_status,
                payout_recipient_id,
                payout_details: payout_details || {},
                metadata: metadata || {},
                location: location || {},
                created_at: new Date(),
                updated_at: new Date()
            })
            .returning('*');

        return payment;
    }

    /**
     * Get payment by idempotency_key
     * @param {string} idempotency_key - Unique key for idempotency
     * @returns {Promise<Object|null>} Payment record
     */
    async getPaymentByIdempotencyKey(idempotency_key) {
        if (!idempotency_key) return null;

        const payment = await db('payments')
            .where({ idempotency_key })
            .first();

        return payment || null;
    }

    /**
     * Get payment by payment_id
     * @param {string} payment_id - Payment UUID
     * @returns {Promise<Object|null>} Payment record
     */
    async getPaymentById(payment_id) {
        const payment = await db('payments as p')
            .leftJoin('invoices as i', 'p.payment_id', 'i.payment_id')
            .select('p.*', 'i.invoice_id', 'i.pdf_url as invoice_url', 'i.status as invoice_status')
            .where('p.payment_id', payment_id)
            .first();

        return payment || null;
    }

    /**
     * Update payment status and metadata
     * @param {string} payment_id - Payment UUID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated payment
     */
    async updatePaymentStatus(payment_id, updates) {
        const { status, failure_reason, cancellation_reason, metadata, gateway_token } = updates;

        const updateData = {
            updated_at: new Date()
        };

        if (status) updateData.status = status;
        if (failure_reason) updateData.failure_reason = failure_reason;
        if (cancellation_reason) updateData.cancellation_reason = cancellation_reason;
        if (gateway_token) updateData.gateway_token = gateway_token;
        if (metadata) updateData.metadata = db.raw('metadata || ?::jsonb', [JSON.stringify(metadata)]);

        // Set processed_at when status changes to succeeded or failed
        if (status === 'succeeded' || status === 'failed') {
            updateData.processed_at = new Date();
        }

        const [payment] = await db('payments')
            .where({ payment_id })
            .update(updateData)
            .returning('*');

        return payment;
    }

    /**
     * Get all payments for a seller
     * @param {string} seller_id - Seller UUID
     * @param {Object} options - Query options (limit, offset, status)
     * @returns {Promise<Array>} List of payments
     */
    async getPaymentsBySeller(seller_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('payments as p')
            .leftJoin('invoices as i', 'p.payment_id', 'i.payment_id')
            .select('p.*', 'i.invoice_id', 'i.pdf_url as invoice_url', 'i.status as invoice_status')
            .where('p.seller_id', seller_id);

        let countQuery = db('payments').where({ seller_id }).count('payment_id as total');

        if (status) {
            query = query.where('p.status', status);
            countQuery = countQuery.where({ status });
        }

        const [data, [{ total }]] = await Promise.all([
            query.orderBy('p.created_at', 'desc').limit(limit).offset(offset),
            countQuery
        ]);

        return { data, total };
    }

    /**
     * Get all payments for a company
     * @param {string} company_id - Company UUID
     * @param {Object} options - Query options (limit, offset, status)
     * @returns {Promise<Array>} List of payments
     */
    async getPaymentsByCompany(company_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('payments as p')
            .leftJoin('invoices as i', 'p.payment_id', 'i.payment_id')
            .select('p.*', 'i.invoice_id', 'i.pdf_url as invoice_url', 'i.status as invoice_status')
            .where('p.company_id', company_id);

        let countQuery = db('payments').where({ company_id }).count('payment_id as total');

        if (status) {
            query = query.where('p.status', status);
            countQuery = countQuery.where({ status });
        }

        const [data, [{ total }]] = await Promise.all([
            query.orderBy('p.created_at', 'desc').limit(limit).offset(offset),
            countQuery
        ]);

        return { data, total };
    }

    /**
     * Get all payments for a shop
     * @param {string} shop_id - Shop UUID
     * @param {Object} options - Query options (limit, offset, status)
     * @returns {Promise<Array>} List of payments
     */
    async getPaymentsByShop(shop_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('payments as p')
            .leftJoin('invoices as i', 'p.payment_id', 'i.payment_id')
            .select('p.*', 'i.invoice_id', 'i.pdf_url as invoice_url', 'i.status as invoice_status')
            .where('p.shop_id', shop_id);

        let countQuery = db('payments').where({ shop_id }).count('payment_id as total');

        if (status) {
            query = query.where('p.status', status);
            countQuery = countQuery.where({ status });
        }

        const [data, [{ total }]] = await Promise.all([
            query.orderBy('p.created_at', 'desc').limit(limit).offset(offset),
            countQuery
        ]);

        return { data, total };
    }

    /**
     * Get payments by gateway
     * @param {string} gateway - Gateway type
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of payments
     */
    async getPaymentsByGateway(gateway, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('payments')
            .where({ gateway })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where({ status });
        }

        return await query;
    }

    /**
     * Get payment by order_id
     * @param {string} order_id - Order UUID
     * @returns {Promise<Object|null>} Payment record
     */
    async getPaymentByOrderId(order_id) {
        const payment = await db('payments')
            .where({ order_id })
            .first();

        return payment || null;
    }



    /**
     * Get payments that need to be retried
     * @returns {Promise<Array>} List of retryable payments
     */
    async getPaymentsToRetry() {
        return await db('payments')
            .where({ status: 'failed' })
            .whereRaw("metadata->>'retry_count' IS NULL OR (metadata->>'retry_count')::int < 3")
            .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000)); // Last 24 hours
    }
}

module.exports = new PaymentRepository();
