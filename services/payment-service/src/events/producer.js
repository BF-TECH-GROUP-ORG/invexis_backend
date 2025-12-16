/**
 * Payment Service Event Producer
 * Publishes payment transaction events
 */

const { publish, exchanges } = require('/app/shared/rabbitmq');

/**
 * Publish payment-related events
 */
const publishPaymentEvent = {
    /**
     * Payment processed successfully
     * @param {Object} payment - The payment object
     */
    async processed(payment) {
        try {
            const eventData = {
                type: 'payment.transaction.processed',
                data: {
                    paymentId: payment.id,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                    orderId: payment.order_id,
                    metadata: payment.metadata,
                    processedAt: new Date().toISOString(),
                },
                source: 'payment-service'
            };

            await publish(exchanges.topic, 'payment.transaction.processed', eventData);
            console.log(`✅ Published payment.transaction.processed event for ${payment.id}`);
        } catch (error) {
            console.error('❌ Failed to publish payment.transaction.processed event:', error.message);
        }
    },

    /**
     * Payment failed
     */
    async failed(payment, reason) {
        try {
            const eventData = {
                type: 'payment.transaction.failed',
                data: {
                    paymentId: payment.id,
                    amount: payment.amount,
                    orderId: payment.order_id,
                    reason,
                    failedAt: new Date().toISOString(),
                },
                source: 'payment-service'
            };

            await publish(exchanges.topic, 'payment.transaction.failed', eventData);
            console.log(`✅ Published payment.transaction.failed event for ${payment.id}`);
        } catch (error) {
            console.error('❌ Failed to publish payment.transaction.failed event:', error.message);
        }
    }
};

module.exports = { publishPaymentEvent };
