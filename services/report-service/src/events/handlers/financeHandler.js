const PaymentLog = require('../../models/PaymentLog');
const SalesTransaction = require('../../models/SalesTransaction');
const moment = require('moment');

module.exports = async (payload, routingKey) => {
    try {
        const { traceId, repaymentId, debtId, id } = payload;

        // 0. Idempotency Check
        const { processEventOnce } = require('../../utils/redisHelper');
        const isNew = await processEventOnce(traceId || repaymentId || debtId || id, 'report-finance');
        if (!isNew) {
            console.log(`[FinanceHandler] Skipping duplicate event: ${traceId || repaymentId || debtId || id}`);
            return;
        }

        const companyId = payload.companyId;
        const shopId = payload.shopId;
        const dateStr = payload.date || payload.timestamp || payload.paidAt || payload.createdAt;
        const eventDate = dateStr ? new Date(dateStr) : new Date();
        const snapshotDateStr = moment(eventDate).format('YYYY-MM-DD');
        const DailySnapshot = require('../../models/DailySnapshot');

        // 1. Handle Debt Creation & Cancellation
        if (routingKey === 'debt.created' || routingKey === 'debt.cancelled') {
            const isCancellation = routingKey === 'debt.cancelled';
            console.log(`[FinanceHandler] Processing debt ${isCancellation ? 'cancellation' : 'creation'}: ${payload.debtId}`);

            const amount = payload.balance || payload.amount || 0;

            // Sync debtId to SalesTransaction for future correlation
            if (payload.saleId || payload.salesId) {
                const SalesTransaction = require('../../models/SalesTransaction');
                await SalesTransaction.updateOne(
                    { saleId: payload.saleId || payload.salesId },
                    { $set: { "debt.debtId": payload.debtId, "debt.isDebt": true } }
                );
            }

            await DailySnapshot.updateOne(
                { companyId, shopId, date: snapshotDateStr },
                {
                    $inc: { 'finance.debtIncurred': isCancellation ? -amount : amount },
                    $set: { lastUpdated: new Date() }
                },
                { upsert: true }
            );
            return;
        }

        if (routingKey === 'debt.updated' || routingKey === 'debt.settled') {
            console.log(`[FinanceHandler] Syncing debt state: ${payload.debtId}`);
            const SalesTransaction = require('../../models/SalesTransaction');

            const query = {};
            if (payload.saleId || payload.salesId) query.saleId = payload.saleId || payload.salesId;
            if (payload.debtId) query["debt.debtId"] = payload.debtId;

            if (Object.keys(query).length > 0) {
                const update = {};
                if (payload.balance !== undefined) update["debt.balance"] = payload.balance;
                if (routingKey === 'debt.settled') update["debt.status"] = 'Paid';

                await SalesTransaction.updateOne(query, { $set: update });
            }
            return;
        }

        // 2. Handle Debt Repayment (Increments Cash In & Debt Repaid)
        if (routingKey === 'debt.repayment.created' || routingKey === 'debt.payment.made' || routingKey === 'debt.payment.received') {
            const repaymentId = payload.repaymentId || payload.id;
            console.log(`[FinanceHandler] Processing repayment: ${repaymentId}`);

            const amount = payload.amount || payload.paymentDetails?.amountPaid || payload.amountPaid;
            const method = payload.method || payload.paymentDetails?.paymentMethod || 'CASH';
            const saleId = payload.saleId || payload.salesId;
            const debtId = payload.debtId;

            // Log Payment
            await PaymentLog.create({
                companyId,
                shopId,
                date: eventDate,
                paymentId: repaymentId,
                invoiceNo: payload.invoiceNo || 'Unknown',
                amount: amount,
                method: method,
                customer: {
                    name: payload.customerName || payload.customer?.name || 'Unknown',
                    phone: payload.customerPhone || payload.customer?.phone
                },
                receivedBy: payload.staffId || payload.userId || 'System',
                time: moment(eventDate).format('hh:mm A'),
                referenceType: 'DEBT',
                referenceId: saleId || debtId,
                status: 'Completed'
            });

            // Update SalesTransaction Balance
            const SalesTransaction = require('../../models/SalesTransaction');
            const txQuery = {};
            if (saleId) txQuery.saleId = saleId;
            if (debtId) txQuery["debt.debtId"] = debtId;

            if (Object.keys(txQuery).length > 0) {
                await SalesTransaction.updateOne(
                    txQuery,
                    {
                        $inc: { "debt.amountPaid": amount, "debt.balance": -amount },
                        $set: { "debt.lastPaymentDate": eventDate }
                    }
                );
                // Status check
                const tx = await SalesTransaction.findOne(txQuery);
                if (tx && tx.debt.balance <= 0) {
                    await SalesTransaction.updateOne(txQuery, { $set: { "debt.status": "Paid" } });
                }
            }

            // Update Snapshot
            await DailySnapshot.updateOne(
                { companyId, shopId, date: snapshotDateStr },
                {
                    $inc: {
                        'finance.cashIn': amount,
                        'finance.debtRepaid': amount
                    },
                    $set: { lastUpdated: new Date() }
                },
                { upsert: true }
            );

            // Cache Invalidation
            const { scanDel } = require('../../utils/redisHelper');
            Promise.all([
                scanDel(`REPORT:PAYMENT:${companyId}*`),
                scanDel(`REPORT:DEBT:${companyId}*`),
                scanDel(`REPORT:BI:${companyId}*`)
            ]).catch(err => console.error("Cache invalidation error:", err));
        }

    } catch (error) {
        console.error(`[FinanceHandler] Error:`, error);
        throw error;
    }
};
