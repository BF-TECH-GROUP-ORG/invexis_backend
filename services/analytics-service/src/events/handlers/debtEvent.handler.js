const { DebtMetric } = require("../../models");
const logger = require("/app/shared/logger").getLogger("analytics-service");
const { format } = require("date-fns");

/**
 * Handle Debt Events
 * Transforms raw debt events into analytical metrics.
 */
const handleDebtEvent = async (event) => {
    try {
        const { type, payload, emittedAt, id } = event;

        // Normalize payload (some events from debt-service have nested details)
        let companyId = payload.companyId;
        let shopId = payload.shopId;
        let customerId = payload.hashedCustomerId || payload.customerId;
        let debtId = payload.debtId;

        let metricType = 'UPDATED';
        let metricAmount = 0;
        let metricBalance = parseFloat(payload.balance || 0);
        let daysOverdue = 0;
        let paymentMethod = payload.paymentMethod;

        // Routing Key Logic: "debt.created", "debt.repaid", "debt.overdue"
        // RabbitMQ Routing Key is usually passed as 'type' here or we deduce from payload structure

        if (type.includes('created')) {
            metricType = 'CREATED';
            metricAmount = parseFloat(payload.totalAmount || payload.amount || 0);
            metricBalance = parseFloat(payload.balance || metricAmount);
            // Handle enriched structure if present
            if (payload.debtDetails) {
                metricAmount = parseFloat(payload.debtDetails.totalAmount || 0);
                metricBalance = parseFloat(payload.debtDetails.balance || 0);
            }
        }
        else if (type.includes('repaid') || type.includes('payment')) {
            metricType = 'PAYMENT';
            // Debt Service sends: paymentDetails: { amountPaid: x }, debtStatus: { newBalance: y }
            if (payload.paymentDetails) {
                metricAmount = parseFloat(payload.paymentDetails.amountPaid || 0);
                paymentMethod = payload.paymentDetails.paymentMethod;
            } else {
                metricAmount = parseFloat(payload.amount || payload.amountPaid || 0);
            }

            if (payload.debtStatus) {
                metricBalance = parseFloat(payload.debtStatus.newBalance || 0);
            } else if (payload.newBalance !== undefined) {
                metricBalance = parseFloat(payload.newBalance || 0);
            }
        }
        else if (type.includes('fully_paid')) {
            metricType = 'SETTLED';
            metricBalance = 0;
            if (payload.debtDetails) {
                // If we want to record the final valid amount, we could used debtDetails.totalAmount, 
                // but SETTLED typically means balance zeroing.
            }
        }
        else if (type.includes('overdue')) {
            metricType = 'OVERDUE';
            // payload has { totalAmount, balance, overdueDays }
            metricAmount = parseFloat(payload.balance || 0); // Risk amount is the balance
            daysOverdue = parseInt(payload.overdueDays || payload.daysOverdue || 0);
        }

        if (!companyId || !shopId) {
            logger.warn(`⚠️ Skipped debt event ${type}: Missing companyId/shopId`, { eventId: id });
            return;
        }

        await DebtMetric.create({
            time: emittedAt || new Date(),
            companyId,
            shopId,
            customerId: customerId || 'unknown',
            debtId,
            type: metricType,
            amount: metricAmount,
            balance: metricBalance,
            daysOverdue: daysOverdue,
            sourceEventId: id,
            metadata: {
                paymentMethod: paymentMethod,
                traceId: payload.traceId
            }
        });

        logger.info(`📊 Processed Debt Metric: ${metricType}`, {
            debtId,
            amount: metricAmount,
            shopId
        });

    } catch (error) {
        logger.error(`❌ Error processing debt event: ${error.message}`, {
            stack: error.stack,
            event
        });
        throw error; // Retry via RabbitMQ
    }
};

module.exports = handleDebtEvent;
