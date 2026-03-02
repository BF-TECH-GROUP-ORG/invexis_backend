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
            'payment.processed',
            async () => {
                // Find debt by ID or Order ID
                let debt;
                if (debtId) {
                    debt = await Debt.findById(debtId);
                } else if (targetOrderId) {
                    // Try finding by ID first if orderId maps to _id
                    if (String(targetOrderId).match(/^[0-9a-fA-F]{24}$/)) {
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
                        if (repayment.status === 'succeeded' || repayment.status === 'debt') {
                            console.log(`ℹ️ Repayment ${repaymentId} already processed (Status: ${repayment.status}). Skipping balance update.`);
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

                // 3. Update Debt Balance (Skip if already applied by debtService.recordRepayment)
                if (debt.repayments && debt.repayments.includes(repaymentId)) {
                    console.log(`ℹ️ Debt ${debt._id} balance already updated for repayment ${repaymentId}. Skipping.`);
                } else {
                    debt.amountPaidNow = (debt.amountPaidNow || 0) + amount;
                    debt.balance = Math.max(0, debt.totalAmount - debt.amountPaidNow);
                    if (!debt.repayments) debt.repayments = [];
                    debt.repayments.push(repaymentId);
                }
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

                // Emit debt.payment.received event for report-service synchronization
                const { debtEvents } = require('../eventHelpers');
                await debtEvents.paymentReceived(debt._id, {
                    companyId: debt.companyId,
                    shopId: debt.shopId,
                    id: paymentId,
                    amount: amount,
                    paymentMethod: paymentMethod || 'ONLINE',
                    remainingBalance: debt.balance,
                    traceId: traceId
                });

                // Check if fully paid and emit settled event
                if (debt.balance <= 0) {
                    await debtEvents.settled(debt);
                }

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
            'payment.refunded',
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
    // Standardize event structure: Support both wrapped {type, data} and direct formats
    let type = event.type || event.event || routingKey;
    let data = event.data;

    // If it's a direct format (no data wrapper), use the event itself as data
    if (!data && type) {
        data = event;
    }

    // Still no data? Skip.
    if (!data) {
        console.log(`⚠️ Received invalid event, skipping`, event);
        return { success: false };
    }

    switch (type) {
        case 'payment.processed':
        case 'payment.succeeded':
            return await handlePaymentProcessed(data);
        case 'payment.failed':
            return await handlePaymentFailed(data);
        case 'payment.refunded':
            return await handlePaymentRefunded(data);
        case 'document.invoice.created':
            return await handleInvoiceCreated(data);
        default:
            console.warn(`⚠️ Unknown payment event: ${type}`);
            return { success: false };
    }
}

/**
 * Handle document.invoice.created - Link invoice URL to Debt and Repayment
 */
async function handleInvoiceCreated(data) {
    const { url, context } = data;
    const { debtId, repaymentId } = context || {};

    if (!url || (!debtId && !repaymentId)) {
        console.warn('⚠️ Received document.invoice.created with insufficient data:', data);
        return;
    }

    try {
        // 1. Update Debt if debtId is present
        if (debtId) {
            await Debt.findByIdAndUpdate(debtId, { invoiceUrl: url });
            console.log(`📄 Linked invoice PDF to Debt ${debtId}`);
        }

        // 2. Update Repayment if repaymentId is present (for debt repayments)
        if (repaymentId) {
            const Repayment = require('../../models/repayment.model');
            await Repayment.findByIdAndUpdate(repaymentId, { invoiceUrl: url });
            console.log(`📄 Linked invoice PDF to Repayment ${repaymentId}`);
        }
    } catch (error) {
        console.error('❌ Error linking invoice URL in debt-service:', error.message);
    }
}

module.exports = handlePaymentEvent;
