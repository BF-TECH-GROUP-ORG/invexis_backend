/**
 * Subscription Engine & Auto-Retry Worker
 * Orchestrates automated tier renewals and payment retries
 */

const { getLogger } = require('/app/shared/logger');
const paymentRepository = require('../repositories/paymentRepository');
const paymentService = require('./paymentService');
const { PAYMENT_STATUS } = require('../utils/constants');

const logger = getLogger('subscription-engine');

class SubscriptionEngine {
    constructor() {
        this.billingInterval = null;
        this.retryInterval = null;
    }

    /**
     * Start the engine workers
     */
    start() {
        logger.info('Starting Subscription Engine...');

        // Check for renewals every 4 hours
        this.billingInterval = setInterval(() => {
            this.processRenewals();
        }, 1000 * 60 * 60 * 4);

        // Check for retries every 1 hour
        this.retryInterval = setInterval(() => {
            this.processRetries();
        }, 1000 * 60 * 60 * 1);

        // Run immediately on start
        this.processRenewals();
        this.processRetries();
    }

    /**
     * Stop the engine workers
     */
    stop() {
        if (this.billingInterval) clearInterval(this.billingInterval);
        if (this.retryInterval) clearInterval(this.retryInterval);
        logger.info('Subscription Engine stopped');
    }

    /**
     * Find and process due subscriptions
     */
    async processRenewals() {
        logger.info('⏲️ Checking for due renewals...');
        try {
            await paymentService.processDueSubscriptions();
        } catch (error) {
            logger.error('Error in renewal cycle', { error: error.message });
        }
    }

    /**
     * Find and process failed payments due for retry
     */
    async processRetries() {
        logger.info('⏲️ Checking for payments to retry...');
        try {
            const now = new Date();
            const { db } = require('../config/db');

            const toRetry = await db('payments')
                .where('status', PAYMENT_STATUS.FAILED)
                .andWhere('retry_count', '<', 3)
                .andWhere('next_retry_at', '<=', now);

            logger.info(`🔄 Found ${toRetry.length} payments to retry`);

            for (const payment of toRetry) {
                await this.retryPayment(payment);
            }
        } catch (error) {
            logger.error('Error in retry cycle', { error: error.message });
        }
    }

    /**
     * Execute retry for a single payment
     */
    async retryPayment(payment) {
        logger.info(`🔄 Retrying payment ${payment.payment_id} (Attempt ${payment.retry_count + 1}/3)`);

        try {
            // Calculate next retry time based on attempt number
            // Attempt 1: immediate (done)
            // Attempt 2: +24h
            // Attempt 3: +72h (total 4 days)
            let nextRetry = null;
            if (payment.retry_count === 1) { // Current is attempt 2, next is 3
                nextRetry = new Date();
                nextRetry.setHours(nextRetry.getHours() + 72);
            } else if (payment.retry_count === 0) { // Current is attempt 1, next is 2
                nextRetry = new Date();
                nextRetry.setHours(nextRetry.getHours() + 24);
            }

            // Update retry count and next attempt time
            const { db } = require('../config/db');
            await db('payments')
                .where({ payment_id: payment.payment_id })
                .update({
                    retry_count: payment.retry_count + 1,
                    next_retry_at: nextRetry,
                    updated_at: new Date()
                });

            // Re-invoke payment initiation
            // We use a new idempotency key or the original one? 
            // Better to use the original one but the service should allow retries.
            // Our initiatePayment has an idempotency check, so we should bypass it or use a sub-id.

            await paymentService.initiatePayment({
                ...payment,
                idempotency_key: `${payment.idempotency_key}-retry-${payment.retry_count + 1}`,
                metadata: { ...payment.metadata, isRetry: true, originalId: payment.payment_id }
            });

        } catch (error) {
            logger.error(`❌ Retry failed for ${payment.payment_id}`, { error: error.message });
        }
    }
}

module.exports = new SubscriptionEngine();
