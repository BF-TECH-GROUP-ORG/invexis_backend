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
        orderId,
        saleId,
        amount,
        currency,
        paymentMethod,
        traceId
    } = data;

    const targetOrderId = orderId || saleId;
    console.log(`💳 [payment.processed] Processing payment ${paymentId}`, { traceId, debtId, targetOrderId, amount });

    try {
        // Use event deduplication to prevent duplicate processing
        const processed = await processEventOnce(
            `payment_processed_${paymentId}`,
            async () => {
                // Find debt by ID or Order ID
                let debt;
                if (debtId) {
                    debt = await Debt.findById(debtId);
                } else if (targetOrderId) {
                    // Try finding by ID first if orderId maps to _id
                    if (targetOrderId.match(/^[0-9a-fA-F]{24}$/)) {
                        debt = await Debt.findById(targetOrderId);
                    }
                    if (!debt) {
                        debt = await Debt.findOne({ salesId: targetOrderId, isDeleted: false });
                    }
                }

                if (!debt) {
                    console.warn(`⚠️ Debt not found for payment ${paymentId}`);
                    return { success: false, message: 'Debt not found' };
                }

                // 2. Find Repayment (if exists) and update status
                // We expect repaymentId in data.metadata (from payload)
                const Repayment = require('../../models/repayment.model');
                let repaymentId = data.metadata?.repaymentId;

                if (repaymentId) {
                    const repayment = await Repayment.findById(repaymentId);
                    if (repayment) {
                        if (repayment.status === 'succeeded') {
                            console.log(`ℹ️ Repayment ${repaymentId} already succeeded. Skipping.`);
                            return { success: true, message: 'Already processed' };
                        }
                        repayment.status = 'succeeded';
                        await repayment.save();
                        console.log(`✅ Repayment ${repaymentId} marked as SUCCEEDED`);
                    }
                } else {
                    // Fallback: This might be an external payment not initiated by us?
                    // Or we just credit the debt directly if no specific repayment record found
                    console.warn(`⚠️ No repaymentId in metadata for payment ${paymentId}. Crediting debt directly.`);
                }

                // 3. Update Debt Balance
                debt.amountPaidNow = (debt.amountPaidNow || 0) + amount;
                debt.balance = Math.max(0, debt.totalAmount - debt.amountPaidNow);
                debt.lastPaymentDate = new Date();

                // Track in balance history
                if (debt.balanceHistory) {
                    debt.balanceHistory.push({
                        date: new Date(),
                        balance: debt.balance
                    });
                }

                // Check if fully paid
                if (debt.balance <= 0) {
                    debt.status = 'PAID';
                    console.log(`✅ Debt ${debt._id} fully paid`);
                } else if (debt.amountPaidNow > 0) {
                    debt.status = 'PARTIALLY_PAID';
                }

                await debt.save();
                console.log(`✅ Payment ${paymentId} applied to debt ${debt._id}`);
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
        orderId,
        saleId,
        failureReason,
        traceId
    } = data;

    const targetOrderId = orderId || saleId;
    console.log(`❌ [payment.failed] Payment ${paymentId} failed`, { traceId, debtId, targetOrderId });

    try {
        let debt;
        if (debtId) {
            debt = await Debt.findById(debtId);
        } else if (targetOrderId) {
            debt = await Debt.findOne({ salesId: targetOrderId, isDeleted: false });
        }

        if (!debt) return;

        // Update Repayment Status to Failed
        const Repayment = require('../../models/repayment.model');
        let repaymentId = data.metadata?.repaymentId;

        if (repaymentId) {
            await Repayment.findByIdAndUpdate(repaymentId, { status: 'failed' });
            console.log(`❌ Repayment ${repaymentId} marked as FAILED`);
        }

        // Log failure reason
        debt.failedPaymentAttempts = (debt.failedPaymentAttempts || 0) + 1;
        // The model doesn't explicitly have lastFailureReason, but we can store in metadata or reminderHistory if needed
        // For now, just logging to console as well
        console.log(`✅ Logged failed payment attempt for debt ${debt._id} (Reason: ${failureReason})`);

        await debt.save();
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
        orderId,
        saleId,
        amount,
        refundReason,
        traceId
    } = data;

    const targetOrderId = orderId || saleId;
    console.log(`🔄 [payment.refunded] Payment ${paymentId} refunded`, { traceId, debtId, targetOrderId, amount });

    try {
        const processed = await processEventOnce(
            `payment_refunded_${paymentId}`,
            async () => {
                let debt;
                if (debtId) {
                    debt = await Debt.findById(debtId);
                } else if (targetOrderId) {
                    debt = await Debt.findOne({ salesId: targetOrderId, isDeleted: false });
                }

                if (!debt) {
                    console.warn(`⚠️ Debt not found for refund ${paymentId}`);
                    return;
                }

                // Reverse payment
                debt.amountPaidNow = Math.max(0, (debt.amountPaidNow || 0) - amount);
                debt.balance = Math.min(debt.totalAmount, debt.totalAmount - debt.amountPaidNow);

                // Update status
                if (debt.amountPaidNow <= 0) {
                    debt.status = 'UNPAID';
                } else if (debt.amountPaidNow < debt.totalAmount) {
                    debt.status = 'PARTIALLY_PAID';
                }

                await debt.save();
                console.log(`✅ Refund processed for debt ${debt._id}`);
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

    // Support both routingKey and event.type
    const eventType = type || routingKey;

    switch (eventType) {
        case 'payment.processed':
        case 'payment.succeeded':
            return await handlePaymentProcessed(data);
        case 'payment.failed':
            return await handlePaymentFailed(data);
        case 'payment.refunded':
            return await handlePaymentRefunded(data);
        default:
            console.warn(`⚠️ Unknown payment event: ${eventType}`);
            return { success: false };
    }
}

module.exports = handlePaymentEvent;
