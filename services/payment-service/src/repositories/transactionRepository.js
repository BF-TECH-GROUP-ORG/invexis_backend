// src/repositories/transactionRepository.js
// Database operations for transactions table

const { db } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class TransactionRepository {
    /**
     * Create a new transaction record
     * @param {Object} transactionData - Transaction information
     * @returns {Promise<Object>} Created transaction
     */
    async createTransaction(transactionData) {
        const {
            payment_id,
            seller_id,
            company_id,
            shop_id,
            type,
            amount,
            currency,
            status,
            gateway_transaction_id,
            metadata
        } = transactionData;

        const transaction_id = uuidv4();

        const [transaction] = await db('transactions')
            .insert({
                transaction_id,
                payment_id,
                seller_id,
                company_id,
                shop_id,
                type,
                amount,
                currency: currency || 'XAF',
                status: status || 'pending',
                gateway_transaction_id,
                metadata: metadata || {},
                created_at: new Date()
            })
            .returning('*');

        return transaction;
    }

    /**
     * Get transaction by transaction_id
     * @param {string} transaction_id - Transaction UUID
     * @returns {Promise<Object|null>} Transaction record
     */
    async getTransactionById(transaction_id) {
        const transaction = await db('transactions as t')
            .leftJoin('payments as p', 't.payment_id', 'p.payment_id')
            .select('t.*', 'p.method as payment_method', 'p.gateway')
            .where('t.transaction_id', transaction_id)
            .first();

        return transaction || null;
    }

    /**
     * Get all transactions for a payment
     * @param {string} payment_id - Payment UUID
     * @returns {Promise<Array>} List of transactions
     */
    async getTransactionsByPayment(payment_id) {
        return await db('transactions')
            .where({ payment_id })
            .orderBy('created_at', 'asc');
    }

    /**
     * Update transaction status
     * @param {string} transaction_id - Transaction UUID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated transaction
     */
    async updateTransactionStatus(transaction_id, updates) {
        const { status, metadata, gateway_transaction_id } = updates;

        const updateData = {};

        if (status) {
            updateData.status = status;
            // Set processed_at when status changes to succeeded or failed
            if (status === 'succeeded' || status === 'failed') {
                updateData.processed_at = new Date();
            }
        }

        if (gateway_transaction_id) {
            updateData.gateway_transaction_id = gateway_transaction_id;
        }

        if (metadata) {
            updateData.metadata = db.raw('metadata || ?::jsonb', [JSON.stringify(metadata)]);
        }

        const [transaction] = await db('transactions')
            .where({ transaction_id })
            .update(updateData)
            .returning('*');

        return transaction;
    }

    /**
     * Get transactions by seller
     * @param {string} seller_id - Seller UUID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} List of transactions
     */
    async getTransactionsBySeller(seller_id, options = {}) {
        const { limit = 50, offset = 0, type, status } = options;

        let query = db('transactions as t')
            .leftJoin('payments as p', 't.payment_id', 'p.payment_id')
            .select('t.*', 'p.method as payment_method', 'p.gateway')
            .where('t.seller_id', seller_id)
            .orderBy('t.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (type) query = query.where('t.type', type);
        if (status) query = query.where('t.status', status);

        return await query;
    }

    /**
     * Get transactions by company
     */
    async getTransactionsByCompany(company_id, options = {}) {
        const { limit = 50, offset = 0, type, status } = options;

        let query = db('transactions as t')
            .leftJoin('payments as p', 't.payment_id', 'p.payment_id')
            .select('t.*', 'p.method as payment_method', 'p.gateway')
            .where('t.company_id', company_id)
            .orderBy('t.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (type) query = query.where('t.type', type);
        if (status) query = query.where('t.status', status);

        return await query;
    }

    /**
     * Get transactions by shop
     */
    async getTransactionsByShop(shop_id, options = {}) {
        const { limit = 50, offset = 0, type, status } = options;

        let query = db('transactions as t')
            .leftJoin('payments as p', 't.payment_id', 'p.payment_id')
            .select('t.*', 'p.method as payment_method', 'p.gateway')
            .where('t.shop_id', shop_id)
            .orderBy('t.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (type) query = query.where('t.type', type);
        if (status) query = query.where('t.status', status);

        return await query;
    }

    /**
     * Get revenue statistics
     * @param {string} period - 'day', 'week', 'month'
     * @param {string} groupBy - 'company_id' or 'shop_id'
     * @returns {Promise<Array>} Aggregated revenue
     */
    async getRevenueStats(period = 'day', groupBy = 'company_id') {
        const validPeriods = ['day', 'week', 'month'];
        if (!validPeriods.includes(period)) throw new Error('Invalid period');

        let interval;
        if (period === 'day') interval = '1 day';
        else if (period === 'week') interval = '1 week';
        else if (period === 'month') interval = '1 month';

        // PostgreSQL syntax for grouping by truncated date could be used,
        // but for "yesterday's revenue" (ran at 00:00), we just filter by range.

        const now = new Date();
        // Set end to current time (which should be 00:00 of today if cron runs then)
        // Set start to now - interval

        // Actually, cron usually runs for "yesterday".
        // Let's assume the cron passes explicit date ranges, OR we handle "last full period".
        // Simplest: "Revenue created > NOW - interval"

        return await db('transactions')
            .select(groupBy)
            .select(db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as total_revenue', ['succeeded']))
            .select(db.raw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) as failed_revenue', ['failed']))
            .select(db.raw('COUNT(*) as total_count'))
            .select(db.raw('COUNT(*) FILTER (WHERE status = ?) as successful_count', ['succeeded']))
            .select(db.raw('COUNT(*) FILTER (WHERE status = ?) as failed_count', ['failed']))
            .whereRaw(`created_at >= NOW() - INTERVAL '${interval}'`)
            .groupBy(groupBy);
    }
}

module.exports = new TransactionRepository();
