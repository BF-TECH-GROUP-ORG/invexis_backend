const Metric = require('../../models/Metric');
const SalesAggregate = require('../../models/SalesAggregate');
const StaffPerformance = require('../../models/StaffPerformance');
const BranchPerformance = require('../../models/BranchPerformance');
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

    const { companyId, shopId, totalAmount, items, soldBy, customerName, customerPhone } = data;

    try {
        if (type === 'sale.created') {
            const netSales = Number(data.totalAmount || totalAmount || 0);
            const discountTotal = Number(data.discountTotal || 0);
            const subTotal = Number(data.subTotal || (netSales + discountTotal));
            const isDebt = !!data.isDebt;
            const transactionCount = 1;

            // Split into Received vs Pending for the whole sale
            const saleReceived = isDebt ? 0 : netSales;
            const salePending = isDebt ? netSales : 0;

            // Calculate total COGS (Cost of Goods Sold)
            let totalCosts = 0;
            if (items && Array.isArray(items)) {
                items.forEach(item => {
                    const qty = Number(item.quantity || 0);
                    const cost = Number(item.costPrice || 0);
                    totalCosts += (qty * cost);
                });
            }

            const buckets = [
                { type: 'hourly', key: hour },
                { type: 'daily', key: day },
                { type: 'weekly', key: week },
                { type: 'monthly', key: month },
                { type: 'yearly', key: year }
            ];

            // 1. Update Metrics (Branch + Company Rollup)
            const targetShops = [shopId || null];
            if (shopId) targetShops.push(null);

            for (const sId of targetShops) {
                for (const bucket of buckets) {
                    await Metric.findOneAndUpdate(
                        { companyId, shopId: sId, type: bucket.type, key: bucket.key },
                        {
                            $inc: {
                                netSales,
                                transactionCount,
                                grossSales: subTotal,
                                discounts: discountTotal,
                                totalCosts: totalCosts,
                                // If debt, it also increases outstandingDebts (already handled by financial handler usually, but we ensure consistency here if needed)
                                ...(isDebt ? { outstandingDebts: netSales } : { paymentsReceived: netSales })
                            }
                        },
                        { upsert: true }
                    );
                }
            }

            // 2. Update Sales Aggregates
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    const itemQty = Number(item.quantity || 0);
                    const itemCost = Number(item.costPrice || 0);
                    const itemTotalCost = itemQty * itemCost;
                    const itemNetSales = Number(item.total || 0);
                    const itemDiscount = Number(item.discount || 0);
                    const itemGross = itemNetSales + itemDiscount;

                    // Proportional split for Received/Pending at product level
                    const itemReceived = isDebt ? 0 : itemNetSales;
                    const itemPending = isDebt ? itemNetSales : 0;

                    await SalesAggregate.findOneAndUpdate(
                        { companyId, shopId: shopId || null, productId: item.productId, date: day },
                        {
                            $inc: {
                                quantitySold: itemQty,
                                grossSales: itemGross,
                                discounts: itemDiscount,
                                netSales: itemNetSales,
                                totalCosts: itemTotalCost,
                                amountReceived: itemReceived,
                                amountPending: itemPending,
                                transactionCount: 1
                            },
                            $set: { productName: item.productName }
                        },
                        { upsert: true }
                    );
                }
            }

            // 3. Update Staff & Branch
            if (soldBy) {
                await StaffPerformance.findOneAndUpdate(
                    { companyId, shopId: shopId || null, staffId: soldBy, date: day },
                    { $inc: { transactionCount: 1, revenueGenerated: netSales } },
                    { upsert: true }
                );
            }

            if (shopId) {
                await BranchPerformance.findOneAndUpdate(
                    { companyId, shopId, date: day },
                    { $inc: { transactionCount: 1, totalRevenue: netSales } },
                    { upsert: true }
                );
            }

            logger.info(`✅ Aggregated sale.created ${data.saleId} for company ${companyId}`);
        }

        else if (type === 'sale.cancelled') {
            const reversalAmount = -Number(totalAmount || 0);

            // Calculate reversal costs
            let reversalCosts = 0;
            if (items && Array.isArray(items)) {
                items.forEach(item => {
                    const qty = Number(item.quantity || 0);
                    const cost = Number(item.costPrice || 0);
                    reversalCosts += (qty * cost);
                });
            }

            // Reverse Metrics
            const buckets = [
                { type: 'hourly', key: hour },
                { type: 'daily', key: day },
                { type: 'weekly', key: week },
                { type: 'monthly', key: month },
                { type: 'yearly', key: year }
            ];

            const targetShops = [shopId || null];
            if (shopId) targetShops.push(null);

            for (const sId of targetShops) {
                for (const bucket of buckets) {
                    await Metric.findOneAndUpdate(
                        { companyId, shopId: sId, type: bucket.type, key: bucket.key },
                        { $inc: { netSales: reversalAmount, transactionCount: -1, totalCosts: -reversalCosts } }
                    );
                }
            }

            // Reverse Aggregates if items present
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    const itemQty = Number(item.quantity || 0);
                    const itemCost = Number(item.costPrice || 0);
                    const itemTotalCost = itemQty * itemCost;

                    await SalesAggregate.findOneAndUpdate(
                        { companyId, shopId: shopId || null, productId: item.productId, date: day },
                        { $inc: { quantitySold: -itemQty, netSales: -Number(item.total || 0), totalCosts: -itemTotalCost, transactionCount: -1 } }
                    );
                }
            }

            logger.info(`⚠️ Reversed cancelled sale ${data.saleId}`);
        }

        else if (type === 'sale.return.created') {
            const refundAmount = Number(data.refundAmount || 0);
            const reversalSales = -refundAmount;

            // Calculate return costs (if costPrice is provided in return event)
            let returnCosts = 0;
            if (items && Array.isArray(items)) {
                items.forEach(item => {
                    const qty = Number(item.quantity || 0);
                    const cost = Number(item.costPrice || 0);
                    returnCosts += (qty * cost);
                });
            }

            // Reverse Metrics (Partially)
            const buckets = [
                { type: 'hourly', key: hour },
                { type: 'daily', key: day },
                { type: 'weekly', key: week },
                { type: 'monthly', key: month },
                { type: 'yearly', key: year }
            ];

            const targetShops = [shopId || null];
            if (shopId) targetShops.push(null);

            for (const sId of targetShops) {
                for (const bucket of buckets) {
                    await Metric.findOneAndUpdate(
                        { companyId, shopId: sId, type: bucket.type, key: bucket.key },
                        {
                            $inc: {
                                netSales: reversalSales,
                                returns: refundAmount,
                                totalCosts: -returnCosts
                            }
                        }
                    );
                }
            }

            // Reverse Aggregates
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    const itemQty = Number(item.quantity || 0);
                    const itemCost = Number(item.costPrice || 0);
                    const itemTotalCost = itemQty * itemCost;

                    await SalesAggregate.findOneAndUpdate(
                        { companyId, shopId: shopId || null, productId: item.productId, date: day },
                        {
                            $inc: {
                                quantitySold: -itemQty,
                                quantityReturned: itemQty,
                                netSales: -Number(item.refundAmount || 0),
                                refundAmount: Number(item.refundAmount || 0),
                                totalCosts: -itemTotalCost
                            }
                        }
                    );
                }
            }

            logger.info(`💸 Processed return for sale ${data.saleId}, refund: ${refundAmount}`);
        }
    } catch (err) {
        logger.error(`❌ Error in sales handler for event ${type}:`, err);
        throw err;
    }
};

module.exports = { handle };
