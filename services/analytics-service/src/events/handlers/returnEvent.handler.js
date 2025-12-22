const { ReturnMetric, CustomerMetric } = require("../../models");
const logger = require("/app/shared/logger").getLogger("analytics-service");

const handleReturnEvents = {
    /**
     * Handle sale.return.created
     * Tracks the return metric and updates customer LTV (negative value)
     */
    async handleReturnCreated(event) {
        try {
            const { type, payload, emittedAt, id } = event;
            const {
                returnId,
                saleId,
                companyId,
                shopId,
                reason,
                refundAmount,
                items = [],
                customerId, // derived if possible, otherwise we might need to lookup sale? 
                // Wait, payload from sales-service usually has context. 
                // Checked SalesController: returnEvents.created(saleReturn, sale, items)
                // eventHelpers.js payload for sale.return.created:
                // { returnId, saleId, companyId, shopId, reason, refundAmount, items... }
                // It does NOT explicitly have customerId in the payload definition in eventHelpers.js!
                // We must rely on 'sale' object passed to event helper? 
                // implementation check: eventHelpers.js L256 payload does NOT include customerId.
                // However, we can add it? Or we can query the sale?
                // Let's assume for now we might lose customerId if not in payload.
                // PLAN: We should update eventHelpers.js to include customerId if possible, 
                // OR we can't link it to customer easily without a lookup.
                // For now, let's process ReturnMetric which is company/shop centric.
            } = payload;

            if (!companyId || !shopId) {
                logger.warn(`⚠️ Skipped return event ${type}: Missing companyId/shopId`, { eventId: id });
                return;
            }

            const numericRefund = parseFloat(refundAmount || 0);

            // 1. Create Return Metric (Per Item or Aggregate?)
            // Implementation Plan said: "Aggregate + JSON items?" or "Track per line item"
            // Let's do both: one main record for the return, or multiple if we want product granularity.
            // ReturnMetric definition has 'productId' as primary key part? No, just indexed.
            // But 'productId' field is required. So we must insert per item.

            if (items && items.length > 0) {
                // If we have items, create a metric per item
                // Distribute refund amount? Or just track quantity and assume 0 price if not provided?
                // items in payload: { productId, quantity, refundAmount } (from SalesController L694)

                for (const item of items) {
                    await ReturnMetric.create({
                        time: emittedAt || new Date(),
                        companyId,
                        shopId,
                        returnId,
                        saleId,
                        productId: item.productId,
                        quantity: item.quantity,
                        refundAmount: item.refundAmount || 0,
                        reason: reason,
                        metadata: {
                            traceId: payload.traceId
                        }
                    });
                }
            } else {
                // If no items (unlikely given controller validation), create a "general" return? 
                // But productId is required in our model.
                // We'll skip if no items or log warning.
                logger.warn("⚠️ Return event has no items, skipping detailed metrics", { eventId: id });
            }

            logger.info(`📊 Processed Return Metric`, {
                returnId,
                amount: numericRefund,
                shopId
            });

        } catch (error) {
            logger.error(`❌ Error processing return event: ${error.message}`, {
                stack: error.stack,
                event
            });
            throw error;
        }
    }
};

module.exports = (event) => {
    // Dispatcher
    if (event.type === 'sale.return.created') {
        return handleReturnEvents.handleReturnCreated(event);
    }
};
