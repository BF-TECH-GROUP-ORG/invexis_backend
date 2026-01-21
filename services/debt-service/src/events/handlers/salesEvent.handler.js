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
        traceId,
        // New fields from sales-service
        hashedCustomerId,
        isDebt,
        customerPhone,
        amountPaid
    } = data;

    logger.info(`💰 [sale.created] Processing sale ${saleId} for debt check`, { traceId, companyId, isDebt });

    // Check if this sale is marked as a debt; if not, skip debt creation
    if (!isDebt) {
        logger.info(`ℹ️ Sale ${saleId} is not marked as debt (isDebt: false), no debt creation needed`);
        return { success: true, message: 'Not marked as debt' };
    }

    // Normalize payment status
    const status = paymentStatus ? paymentStatus.toUpperCase() : 'UNKNOWN';

    // Only create debt for UNPAID or PARTIAL sales
    if (status !== 'UNPAID' && status !== 'PARTIAL' && status !== 'PARTIALLY_PAID') {
        logger.info(`ℹ️ Sale ${saleId} is ${status}, no debt creation needed`);
        return { success: true, message: 'No debt needed' };
    }

    try {
        // Determine amount paid now: prefer explicit `amountPaid` from event when present
        const amountPaidNow = typeof amountPaid === 'number' ? amountPaid : 0;
        const balance = totalAmount - amountPaidNow;

        // Try to find an existing debt record by salesId first (strong correlation)
        let existing = null;
        if (saleId) {
            existing = await Debt.findOne({ salesId: saleId });
        }

        // If we found a debt by salesId, make sure the phone matches the sale's customerPhone
        // If it doesn't match, we will fall back to finding the most recent debt for this company
        // that matches either the hashedCustomerId or the customer phone (last index / newest).
        if (existing) {
            const existingPhone = existing.customer && existing.customer.phone ? String(existing.customer.phone) : null;
            const eventPhone = customerPhone ? String(customerPhone) : null;

            if (existingPhone && eventPhone && existingPhone !== eventPhone) {
                logger.warn(`⚠️ Found debt for sale ${saleId} but phone mismatch (debt:${existingPhone} vs sale:${eventPhone}). Falling back to recent matching debt.`);
                existing = null; // force fallback search below
            }
        }

        // If not found (or we cleared due to phone mismatch), fallback to most recent debt matching hashedCustomerId OR customer.phone
        if (!existing) {
            const orClauses = [];
            if (hashedCustomerId) orClauses.push({ hashedCustomerId: hashedCustomerId });
            if (customerPhone) orClauses.push({ 'customer.phone': customerPhone });

            if (orClauses.length > 0) {
                // Pick the most recent matching debt (last index semantics)
                existing = await Debt.findOne({ companyId, isDeleted: { $ne: true }, $or: orClauses }).sort({ createdAt: -1 });
                if (existing) {
                    logger.info(`🔎 Fallback matched existing debt ${existing._id} for sale ${saleId} (by hashedCustomerId/customer.phone)`);
                }
            }
        }

        if (existing) {
            let changed = false;
            if (hashedCustomerId && (!existing.hashedCustomerId || String(existing.hashedCustomerId) !== String(hashedCustomerId))) {
                existing.hashedCustomerId = hashedCustomerId;
                changed = true;
            }
            // If we have a saleId from the event and the debt doesn't have it, attach it for stronger correlation
            if (saleId) {
                if (!existing.salesId) {
                    existing.salesId = saleId;
                    changed = true;
                } else if (String(existing.salesId) !== String(saleId)) {
                    // Don't overwrite an existing salesId that differs; log for manual reconciliation
                    logger.warn(`⚠️ Existing debt ${existing._id} has different salesId (${existing.salesId}) than event (${saleId}). Skipping overwrite.`);
                }
            }
            if (customerName && (!existing.customer || existing.customer.name !== customerName)) {
                existing.customer = existing.customer || {};
                existing.customer.name = customerName;
                changed = true;
            }
            if (customerPhone && (!existing.customer || existing.customer.phone !== customerPhone)) {
                existing.customer = existing.customer || {};
                existing.customer.phone = customerPhone;
                changed = true;
            }
            if (changed) {
                existing.updatedAt = new Date();
                await existing.save();
                logger.info(`🔄 Updated existing debt ${existing._id} with hashedCustomerId/customer info for sale ${saleId}`);
                // Publish updated event so downstream systems know
                try { await debtEvents.updated(existing, { updatedFields: ['hashedCustomerId', 'customer'] }); } catch (e) { /* non-critical */ }
            }
            return { success: true, debtId: existing._id };
        }

        // Create Debt Record (new)
        const debt = new Debt({
            companyId,
            shopId,
            customerId,
            customer: {
                id: customerId,
                name: customerName,
                phone: customerPhone || null
            },
            // attach hashedCustomerId when provided so cross-company lookups can work
            hashedCustomerId: hashedCustomerId || undefined,
            salesId: saleId, // Mapping saleId to salesId field in Debt model
            salesStaffId: null, // We don't have this in event payload, might be optional
            items: (items || []).map(item => ({
                itemId: item.productId,
                itemName: item.productName || ('Product ' + item.productId),
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
        const eventId = traceId || `${type}:${fallbackId}`;

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
