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
            user_id,
            seller_id,
            company_id,
            shop_id,
            order_id,
            payout_recipient_id,
            payout_details,
            amount,
            currency,
            description,
            method,
            gateway,
            gateway_token,
            customer_email,
            line_items,
            metadata,
            ip,
            device_fingerprint,
            location
        } = paymentData;

        const payment_id = uuidv4();

        const [payment] = await db('payments')
            .insert({
                payment_id,
                user_id,
                seller_id,
                company_id,
                shop_id,
                order_id,
                payout_recipient_id,
                payout_details: payout_details || {},
                amount,
                currency: currency || 'XAF',
                description,
                method,
                gateway,
                gateway_token,
                customer_email,
                line_items: JSON.stringify(line_items || []),
                status: 'pending',
                metadata: metadata || {},
                ip,
                device_fingerprint,
                location: location || {},
                created_at: new Date(),
                updated_at: new Date()
            })
            .returning('*');

        return payment;
    }

    /**
     * Get payment by payment_id
     * @param {string} payment_id - Payment UUID
     * @returns {Promise<Object|null>} Payment record
     */
    async getPaymentById(payment_id) {
        const payment = await db('payments')
            .where({ payment_id })
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
     * Get all payments for a user
     * @param {string} user_id - User UUID
     * @param {Object} options - Query options (limit, offset, status)
     * @returns {Promise<Array>} List of payments
     */
    async getPaymentsByUser(user_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('payments')
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
     * Get all payments for a seller
     * @param {string} seller_id - Seller UUID
     * @param {Object} options - Query options (limit, offset, status)
     * @returns {Promise<Array>} List of payments
     */
    async getPaymentsBySeller(seller_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('payments')
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
     * Get all payments for a company
     * @param {string} company_id - Company UUID
     * @param {Object} options - Query options (limit, offset, status)
     * @returns {Promise<Array>} List of payments
     */
    async getPaymentsByCompany(company_id, options = {}) {
        const { limit = 50, offset = 0, status } = options;

        let query = db('payments')
            .where({ company_id })
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (status) {
            query = query.where({ status });
        }

        return await query;
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
}

module.exports = new PaymentRepository();
