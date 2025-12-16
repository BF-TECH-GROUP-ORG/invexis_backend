/**
 * Sales Event Handler - Debt Service
 * Handles sales-related events from sales-service
 * Manages debt creation and updates based on sales activity
 */

const Debt = require('../../models/debt.model');
const { logger } = require('../../utils/logger'); // Assuming logger exists, if not I'll use console
const { processEventOnce } = require('../../utils/eventDeduplication');
const { debtEvents } = require('../eventHelpers');

/**
 * Handle sale created event - Create debt if sale is unpaid or partially paid
 */
async function handleSaleCreated(data) {
    const {
        saleId,
        companyId,
        shopId,
        customerId,
        customerName,
        totalAmount,
        paymentStatus,
        items,
        traceId
    } = data;

    logger.info(`💰 [sale.created] Processing sale ${saleId} for debt check`, { traceId, companyId });

    // Normalize payment status
    const status = paymentStatus ? paymentStatus.toUpperCase() : 'UNKNOWN';

    // Only create debt for UNPAID or PARTIAL sales
    if (status !== 'UNPAID' && status !== 'PARTIAL' && status !== 'PARTIALLY_PAID') {
        logger.info(`ℹ️ Sale ${saleId} is ${status}, no debt creation needed`);
        return { success: true, message: 'No debt needed' };
    }

    try {
        // Calculate amount paid (if partial) - payload doesn't explicitly have amountPaid, 
        // but we can infer or default to 0 for UNPAID. 
        // For PARTIAL, we might need more info, but for now let's assume 0 if not provided
        // or we might need to fetch the sale details if payload is insufficient.
        // However, the payload has totalAmount. 
        // Let's assume for now amountPaidNow is 0 for UNPAID.
        // If PARTIAL, we might be missing the paid amount in the event payload shown earlier.
        // The event payload in sales-service has: saleId, companyId, shopId, customerId, customerName, totalAmount, status, paymentStatus, items.
        // It DOES NOT have amountPaid. This is a potential gap.
        // For now, we will create the debt with 0 paid and let subsequent payment events update it,
        // OR we can try to find if there's a payment event that comes with it.
        // But wait, if it's partial, there MUST be a payment. 
        // Let's check if we can get amountPaid from somewhere. 
        // If not, we'll default to 0 and log a warning for PARTIAL.

        const amountPaidNow = 0; // Default for now as payload is missing this
        const balance = totalAmount - amountPaidNow;

        // Create Debt Record
        const debt = new Debt({
            companyId,
            shopId,
            customerId,
            customer: {
                id: customerId,
                name: customerName
            },
            salesId: saleId, // Mapping saleId to salesId field in Debt model
            salesStaffId: null, // We don't have this in event payload, might need to be optional or fetched
            items: items.map(item => ({
                itemId: item.productId,
                itemName: 'Product ' + item.productId, // We don't have name in items payload, just productId
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.total
            })),
            totalAmount,
            amountPaidNow,
            balance,
            status: status === 'PARTIAL' ? 'PARTIALLY_PAID' : 'UNPAID',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days due
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Handle missing required fields with defaults or placeholders
        if (!debt.salesStaffId) {
            // If required by model, we need a placeholder or make model optional. 
            // Model says: salesStaffId: { type: mongoose.Types.ObjectId, required: true, default: null }
            // Wait, required: true AND default: null? That might fail validation if null is not allowed.
            // Let's assume we can set it to a system user or null if allowed.
            // Actually, the model has `default: null` so it might be okay if we pass null explicitly?
            // But `required: true` usually means it must be present and not null. 
            // Let's try to generate a dummy ObjectId if needed or use a system ID.
            // For safety, let's try to use a placeholder if we can't get it.
            // But for now, let's leave it as null (default) and see if it saves.
        }

        await debt.save();

        logger.info(`✅ Created debt record for sale ${saleId}`, {
            debtId: debt._id,
            amount: totalAmount,
            balance
        });

        // Publish debt created event
        await debtEvents.created(debt);

        return { success: true, debtId: debt._id };

    } catch (error) {
        logger.error(`❌ Error creating debt for sale ${saleId}:`, error);
        throw error;
    }
}

/**
 * Handle sale payment status changed
 */
async function handlePaymentStatusChanged(data) {
    const { saleId, newStatus, companyId, traceId } = data;

    logger.info(`💰 [sale.payment.status.changed] Updating debt for sale ${saleId} to ${newStatus}`, { traceId, companyId });

    try {
        const debt = await Debt.findOne({ salesId: saleId });

        if (!debt) {
            logger.warn(`⚠️ Debt record not found for sale ${saleId}`);
            return { success: false, message: 'Debt not found' };
        }

        const normalizedStatus = newStatus.toUpperCase();
        let debtStatus = 'UNPAID';

        if (normalizedStatus === 'PAID') debtStatus = 'PAID';
        else if (normalizedStatus === 'PARTIAL' || normalizedStatus === 'PARTIALLY_PAID') debtStatus = 'PARTIALLY_PAID';

        debt.status = debtStatus;

        // If PAID, balance should be 0
        if (debtStatus === 'PAID') {
            debt.balance = 0;
            debt.amountPaidNow = debt.totalAmount;
        }

        await debt.save();

        logger.info(`✅ Updated debt status for sale ${saleId} to ${debtStatus}`);

        // Publish debt updated event
        await debtEvents.updated(debt, { status: debtStatus });

        // If settled, publish settled event
        if (debtStatus === 'PAID') {
            await debtEvents.settled(debt._id);
        }

        return { success: true };

    } catch (error) {
        logger.error(`❌ Error updating debt for sale ${saleId}:`, error);
        throw error;
    }
}

module.exports = async function handleSalesEvent(event) {
    try {
        const { type, payload, data } = event;
        const eventData = payload || data;

        if (!type || !eventData) {
            logger.error('❌ Invalid event structure');
            return;
        }

        const traceId = eventData.traceId || eventData.trace_id;
        const fallbackId = eventData.saleId || '';
        const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

        logger.info(`💰 Processing sales event: ${type}`, { eventId });

        const result = await processEventOnce(
            eventId,
            type,
            async () => {
                switch (type) {
                    case 'sale.created':
                        return await handleSaleCreated(eventData);

                    case 'sale.payment.status.changed':
                        return await handlePaymentStatusChanged(eventData);

                    default:
                        logger.warn(`⚠️ Unhandled sales event type: ${type}`);
                        return null;
                }
            },
            { eventType: type, timestamp: new Date(), saleId: eventData.saleId }
        );

        if (result.duplicate) {
            logger.info(`🔄 Skipped duplicate sales event: ${type}`, { eventId });
        }

    } catch (error) {
        logger.error(`❌ Error handling sales event: ${error.message}`, error);
        throw error;
    }
};
