const Metric = require('../../models/Metric');
const DebtAggregate = require('../../models/DebtAggregate');
const PaymentAggregate = require('../../models/PaymentAggregate');
const logger = require('../../config/logger');

const handle = async (event) => {
    const { type, data, timestamp } = event;
    const dateObj = new Date(timestamp || Date.now());

    // Period Keys (Standardized on UTC)
    const day = dateObj.toISOString().split('T')[0];
    const hour = `${day}:${String(dateObj.getUTCHours()).padStart(2, '0')}`;
    const month = day.slice(0, 7);
    const year = String(dateObj.getUTCFullYear());

    // ISO Week (UTC)
    const getWeekNumber = (d) => {
        const date = new Date(d.getTime());
        date.setUTCHours(0, 0, 0, 0);
        // Set to nearest Thursday: current date + 3 - current day number
        date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
        const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getUTCDay() + 6) % 7) / 7);
    };
    const week = `${dateObj.getUTCFullYear()}-${String(getWeekNumber(dateObj)).padStart(2, '0')}`;

    const { companyId, shopId, debtId, paymentId, paymentMethod } = data;

    // Robust amount extraction for different event sources
    let amountValue = Number(data.amount || 0);
    if (type === 'debt.created' && data.debtDetails?.totalAmount) {
        amountValue = Number(data.debtDetails.totalAmount);
    } else if (type === 'debt.repaid' && data.paymentDetails?.amountPaid) {
        amountValue = Number(data.paymentDetails.amountPaid);
    }

    try {
        const buckets = [
            { type: 'hourly', key: hour },
            { type: 'daily', key: day },
            { type: 'weekly', key: week },
            { type: 'monthly', key: month },
            { type: 'yearly', key: year }
        ];

        if (type === 'debt.created') {
            const finalAmount = amountValue || Number(data.debtDetails?.totalAmount || 0);

            // Update Metric (Outstanding Debt Rollup)
            const targetShops = [shopId || null];
            if (shopId) targetShops.push(null);

            for (const sId of targetShops) {
                for (const bucket of buckets) {
                    await Metric.findOneAndUpdate(
                        { companyId, shopId: sId, type: bucket.type, key: bucket.key },
                        { $inc: { outstandingDebts: finalAmount } },
                        { upsert: true }
                    );
                }
            }

            // Update Debt Aggregate
            await DebtAggregate.findOneAndUpdate(
                { companyId, shopId: shopId || null, debtId: debtId || data.debtId, date: day },
                {
                    $set: {
                        totalAmount: finalAmount,
                        outstandingBalance: finalAmount,
                        status: 'ACTIVE'
                    }
                },
                { upsert: true }
            );
        }

        else if (type === 'payment.processed' || type === 'debt.repaid' || type === 'debt.payment.made') {
            const finalAmount = amountValue;

            // Update Metric (Payments Received Rollup)
            const targetShops = [shopId || null];
            if (shopId) targetShops.push(null);

            for (const sId of targetShops) {
                for (const bucket of buckets) {
                    await Metric.findOneAndUpdate(
                        { companyId, shopId: sId, type: bucket.type, key: bucket.key },
                        {
                            $inc: {
                                paymentsReceived: finalAmount,
                                // If it came from a debt payment, reduce outstanding debt metric
                                ...((type === 'debt.repaid' || type === 'debt.payment.made') ? { outstandingDebts: -finalAmount } : {})
                            }
                        },
                        { upsert: true }
                    );
                }
            }

            // Update Payment Aggregate
            await PaymentAggregate.create({
                companyId,
                shopId,
                paymentId: paymentId || data.repaymentId || `PAY-${Date.now()}`,
                paymentMethod: paymentMethod || data.paymentDetails?.paymentMethod || 'unknown',
                amount: finalAmount,
                status: 'COMPLETED',
                date: day
            });

            // If debt payment, update Debt Aggregate balance
            const targetDebtId = debtId || data.debtId;
            if (targetDebtId) {
                await DebtAggregate.findOneAndUpdate(
                    { debtId: targetDebtId },
                    { $inc: { amountPaid: finalAmount, outstandingBalance: -finalAmount } }
                );
            }
        }
    } catch (err) {
        logger.error('Error in financial handler:', err);
        throw err;
    }
};

module.exports = { handle };
