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
                type: 'payment.processed',
                data: {
                    paymentId: payment.id || payment.payment_id,
                    companyId: payment.company_id || payment.metadata?.companyId,
                    shopId: payment.shop_id || payment.metadata?.shopId,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                    orderId: payment.order_id,
                    saleId: payment.metadata?.saleId, // Extract for direct access
                    debtId: payment.metadata?.debtId, // Extract for direct access
                    metadata: payment.metadata, // Full metadata for flexibility
                    processedAt: new Date().toISOString(),
                },
                source: 'payment-service'
            };

            await publish(exchanges.topic, 'payment.processed', eventData);
            console.log(`✅ Published payment.processed event for ${payment.id || payment.payment_id}`);
        } catch (error) {
            console.error('❌ Failed to publish payment.transaction.processed event:', error.message);
        }
    },

    async failed(payment, reason) {
        try {
            const eventData = {
                type: 'payment.failed',
                data: {
                    paymentId: payment.id || payment.payment_id,
                    companyId: payment.company_id || payment.metadata?.companyId,
                    shopId: payment.shop_id || payment.metadata?.shopId,
                    amount: payment.amount,
                    orderId: payment.order_id,
                    saleId: payment.metadata?.saleId, // Extract for direct access
                    debtId: payment.metadata?.debtId, // Extract for direct access
                    metadata: payment.metadata, // Full metadata
                    reason,
                    failureReason: reason,
                    failedAt: new Date().toISOString(),
                },
                source: 'payment-service'
            };

            await publish(exchanges.topic, 'payment.failed', eventData);
            console.log(`✅ Published payment.failed event for ${payment.id || payment.payment_id}`);
        } catch (error) {
            console.error('❌ Failed to publish payment.transaction.failed event:', error.message);
        }
    },

    /**
     * Request report generation
     * @param {Object} payload - Report data payload
     */
    async reportRequested(payload) {
        try {
            const eventData = {
                type: payload.type || 'report.export_requested',
                data: payload,
                source: 'payment-service'
            };

            await publish(exchanges.topic, 'report.export_requested', eventData);
            console.log(`✅ Published report.export_requested event for ${payload.recipient?.email}`);
        } catch (error) {
            console.error('❌ Failed to publish report.export_requested event:', error.message);
        }
    },

    /**
     * Request invoice generation
     * @param {Object} payload - Invoice data payload matching document-service expectations
     */
    async invoiceRequested(payload) {
        try {
            const eventData = {
                type: 'document.invoice.requested',
                data: payload,
                source: 'payment-service'
            };

            await publish(exchanges.topic, 'document.invoice.requested', eventData);
            console.log(`✅ Published document.invoice.requested event for invoice ${payload.invoiceData.invoiceNumber}`);
        } catch (error) {
            console.error('❌ Failed to publish document.invoice.requested event:', error.message);
        }
    }
};

module.exports = { publishPaymentEvent };
