const { CustomerMetric } = require("../../models");
const logger = require("/app/shared/logger").getLogger("analytics-service");

const handleCustomerEvents = async (event) => {
    try {
        const { type, payload, emittedAt, id } = event;
        if (!payload) {
            logger.error(`customerEvent.handler: Missing payload for event type ${type} (event id: ${id})`);
            return;
        }
        const { companyId, hashedCustomerId, customerId } = payload;

        // We need at least companyId and a customer identifier (hashedCustomerId preferred)
        const effectiveCustomerId = hashedCustomerId || customerId;

        if (!companyId || !effectiveCustomerId) {
            logger.error(`customerEvent.handler: Missing companyId or customerId for event type ${type} (event id: ${id})`);
            return;
        }

        let metricType = null;
        let metricValue = 0;
        let metadata = { traceId: payload.traceId };

        switch (type) {
            case 'sale.created':
                metricType = 'PURCHASE';
                metricValue = parseFloat(payload.totalAmount || 0);
                metadata.saleId = payload.saleId;
                break;

            case 'sale.return.created':
                // Note: payload needs to have customerId/hashedCustomerId.
                // As noted in return handler, it might be missing in current implementation.
                // If present:
                metricType = 'RETURN';
                metricValue = -parseFloat(payload.refundAmount || 0); // Negative LTV
                metadata.returnId = payload.returnId;
                break;

            case 'user.created':
                // Creating a "customer" user
                if (payload.role === 'customer') {
                    metricType = 'ACQUISITION';
                    metricValue = 0;
                    metadata.source = payload.source || 'organic';
                }
                break;

            // Debt events (redundant to DebtMetric but good for LTV aggregation)
            case 'debt.created':
                metricType = 'DEBT_INC';
                metricValue = parseFloat(payload.totalAmount || 0);
                break;
        }

        if (metricType) {
            await CustomerMetric.create({
                time: emittedAt || new Date(),
                companyId,
                hashedCustomerId: effectiveCustomerId,
                type: metricType,
                value: metricValue,
                metadata,
                sourceEventId: id
            });

            logger.info(`bustUserMetric: ${metricType}`, {
                customerId: effectiveCustomerId,
                value: metricValue
            });
        }

    } catch (error) {
        logger.error(`❌ Error processing customer event: ${error.message}`, {
            stack: error.stack
        });
        // Non-blocking, don't throw to avoid stopping main flow if this is secondary
    }
};

module.exports = handleCustomerEvents;
