"use strict";

const { Sale } = require("../../models/index.model");
const { processEventOnce } = require("../../utils/eventDeduplication");

/**
 * Handles debt-related events from debt-service
 * Updates sale status when associated debt is paid
 * @param {Object} event - The debt event
 */
module.exports = async function handleDebtEvent(event) {
    try {
        // Standardize event structure: Support both wrapped {type, data} and direct formats
        let type = event.type || event.eventType || event.event;
        let data = event.data || (event.eventType ? event : null);

        // If it's a direct format (no data wrapper), use the event itself as data
        if (!data && type) {
            data = event;
        }

        // Still no data? Skip.
        if (!data) {
            console.log(`⚠️ Received invalid debt event, skipping`, event);
            return;
        }

        console.log(`💸 Processing debt event: ${type}`, data);

        // Generate event ID for deduplication
        const traceId = data.traceId || data.trace_id || data.id;
        const fallbackId = data.salesId || data.saleId || data.debtId || '';
        const eventId = traceId || `${type}:${fallbackId}`;

        // Process event with automatic deduplication
        const result = await processEventOnce(
            eventId,
            type,
            async () => {
                switch (type) {
                    case "debt.fully_paid":
                    case "debt.marked.paid":
                        await handleDebtCompletion(data);
                        break;

                    default:
                        console.log(`⚠️ Unhandled debt event type: ${type}`);
                }
            },
            { eventType: type, timestamp: new Date(), saleId: data.salesId || data.saleId }
        );

        if (result.duplicate) {
            console.log(`🔄 Skipped duplicate debt event: ${type}`, { eventId });
        }
    } catch (error) {
        console.error(`❌ Error handling debt event: ${error.message}`);
        throw error;
    }
};

/**
 * Handle debt completion (fully paid or marked as paid)
 */
async function handleDebtCompletion(data) {
    // Extract saleId (debt service uses salesId)
    const saleId = data.salesId || data.saleId || data.metadata?.saleId;

    if (!saleId) {
        console.warn("⚠️ Debt completion event missing salesId/saleId");
        return;
    }

    try {
        // Update sale payment status to paid and overall status to completed
        const [updatedCount] = await Sale.update(
            {
                paymentStatus: "paid",
                status: "completed",
            },
            {
                where: { saleId },
                // Only update if not already completed/paid to avoid unnecessary writes
            }
        );

        if (updatedCount > 0) {
            console.log(`✅ Sale ${saleId} automatically marked as COMPLETED/PAID due to debt completion.`);
        } else {
            console.log(`ℹ️ Sale ${saleId} was already COMPLETED or not found.`);
        }
    } catch (error) {
        console.error(`❌ Error updating sale ${saleId} on debt completion:`, error.message);
        throw error;
    }
}
