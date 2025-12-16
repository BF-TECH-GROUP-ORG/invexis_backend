/**
 * Payment Event Handler - Debt Service
 * Handles payment-related events from payment-service
 * Manages debt payment updates and settlement
 */

const Debt = require('../../models/debt.model');
const { processEventOnce } = require('../../utils/eventDeduplication');

/**
 * Handle payment processed event - Update debt with payment
 */
async function handlePaymentProcessed(data) {
    const {
        paymentId,
        debtId,
        customerId,
        amount,
        currency,
        paymentMethod,
        traceId
    } = data;

    console.log(`💳 [payment.processed] Processing payment ${paymentId}`, { traceId, debtId, amount });

    try {
        // Use event deduplication to prevent duplicate processing
        const processed = await processEventOnce(
            `payment_processed_${paymentId}`,
            async () => {
                // Find debt
                const debt = await Debt.findById(debtId);
                if (!debt) {
                    console.warn(`⚠️ Debt ${debtId} not found for payment ${paymentId}`);
                    return { success: false, message: 'Debt not found' };
                }

                // Update debt with payment
                debt.amountPaid = (debt.amountPaid || 0) + amount;
                debt.lastPaymentDate = new Date();
                debt.lastPaymentMethod = paymentMethod;
                
                // Check if fully paid
                if (debt.amountPaid >= debt.totalAmount) {
                    debt.status = 'SETTLED';
                    debt.settledAt = new Date();
                    console.log(`✅ Debt ${debtId} fully settled`);
                } else if (debt.amountPaid > 0) {
                    debt.status = 'PARTIALLY_PAID';
                }

                await debt.save();
                console.log(`✅ Payment ${paymentId} applied to debt ${debtId}`);
                return { success: true, message: 'Payment processed' };
            }
        );

        return processed;
    } catch (error) {
        console.error(`❌ Error processing payment ${paymentId}:`, error.message);
        throw error;
    }
}

/**
 * Handle payment failed event - Log failure and notify
 */
async function handlePaymentFailed(data) {
    const {
        paymentId,
        debtId,
        customerId,
        amount,
        failureReason,
        traceId
    } = data;

    console.log(`❌ [payment.failed] Payment ${paymentId} failed`, { traceId, debtId, failureReason });

    try {
        const debt = await Debt.findById(debtId);
        if (!debt) return;

        // Log failure reason
        debt.failedPaymentAttempts = (debt.failedPaymentAttempts || 0) + 1;
        debt.lastFailureReason = failureReason;
        debt.lastFailureDate = new Date();

        await debt.save();
        console.log(`✅ Logged failed payment attempt for debt ${debtId}`);
    } catch (error) {
        console.error(`❌ Error handling payment failure:`, error.message);
        throw error;
    }
}

/**
 * Handle payment refunded event - Reverse payment
 */
async function handlePaymentRefunded(data) {
    const {
        paymentId,
        debtId,
        customerId,
        amount,
        refundReason,
        traceId
    } = data;

    console.log(`🔄 [payment.refunded] Payment ${paymentId} refunded`, { traceId, debtId, amount });

    try {
        const processed = await processEventOnce(
            `payment_refunded_${paymentId}`,
            async () => {
                const debt = await Debt.findById(debtId);
                if (!debt) {
                    console.warn(`⚠️ Debt ${debtId} not found for refund ${paymentId}`);
                    return;
                }

                // Reverse payment
                debt.amountPaid = Math.max(0, (debt.amountPaid || 0) - amount);
                
                // Update status
                if (debt.amountPaid <= 0) {
                    debt.status = debt.totalAmount > 0 ? 'UNPAID' : 'SETTLED';
                } else if (debt.amountPaid < debt.totalAmount) {
                    debt.status = 'PARTIALLY_PAID';
                }

                await debt.save();
                console.log(`✅ Refund processed for debt ${debtId}`);
            }
        );

        return processed;
    } catch (error) {
        console.error(`❌ Error processing refund:`, error.message);
        throw error;
    }
}

/**
 * Main handler function - routes to specific handlers
 */
async function handlePaymentEvent(event, routingKey) {
    const { type, data } = event;

    switch (routingKey) {
        case 'payment.processed':
            return await handlePaymentProcessed(data);
        case 'payment.failed':
            return await handlePaymentFailed(data);
        case 'payment.refunded':
            return await handlePaymentRefunded(data);
        default:
            console.warn(`⚠️ Unknown payment event: ${routingKey}`);
            return { success: false };
    }
}

module.exports = handlePaymentEvent;
