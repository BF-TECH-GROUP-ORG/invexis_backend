const DailySnapshot = require('../models/DailySnapshot');
const SalesTransaction = require('../models/SalesTransaction');
const moment = require('moment'); // You might need to install moment if not present

/**
 * Aggregation Service
 * Responsible for updating DailySnapshots in Real-Time
 */
class AggregationService {

    /**
     * Process a new Sale Event
     * @param {Object} saleData - The payload from sale.created event
     */
    static async processSaleEvent(saleData) {
        const dateStr = moment(saleData.date).format('YYYY-MM-DD');
        const netSales = saleData.netSales || 0;
        const totalCost = saleData.totalCosts || 0;
        const grossProfit = netSales - totalCost;

        // 2. Update Daily Snapshot (Increment Logic)
        const updateQuery = {
            $inc: {
                'sales.totalRevenue': netSales,
                'sales.totalCost': totalCost,
                'sales.grossProfit': grossProfit,
                'sales.netProfit': grossProfit,
                'sales.transactionCount': 1,
                'sales.discountTotal': saleData.discount || 0,
                'finance.cashIn': saleData.amountReceived || 0,
                'finance.debtIncurred': saleData.amountPending || 0,
                'finance.debtRepaid': saleData.debtRepaid || 0
            },
            $set: {
                lastUpdated: new Date()
            }
        };

        await DailySnapshot.findOneAndUpdate(
            { companyId: saleData.companyId, shopId: saleData.shopId, date: dateStr },
            updateQuery,
            { upsert: true, new: true }
        );

        // 3. Update ProductDailySnapshots (Drill-down Data)
        if (saleData.items && Array.isArray(saleData.items)) {
            const productUpdates = saleData.items.map(item => {
                const itemNet = (item.quantity * item.price) - (item.discount || 0);
                const itemCost = item.quantity * (item.cost || item.costPrice || 0);
                const itemProfit = itemNet - itemCost;

                const ratio = netSales ? (itemNet / netSales) : 0;
                const itemPending = (saleData.amountPending || 0) * ratio;
                const itemReceived = (saleData.amountReceived || 0) * ratio;

                return {
                    updateOne: {
                        filter: {
                            companyId: saleData.companyId,
                            shopId: saleData.shopId,
                            productId: item.productId,
                            date: dateStr
                        },
                        update: {
                            $setOnInsert: { productName: item.productName || 'Unknown' },
                            $inc: {
                                'sales.grossSales': (item.quantity * item.price),
                                'sales.discounts': (item.discount || 0),
                                'sales.netSales': itemNet,
                                'sales.unitsSold': item.quantity,
                                'sales.transactionCount': 1,
                                'financials.costOfGoods': itemCost,
                                'financials.grossProfit': itemProfit,
                                'financials.amountReceived': itemReceived,
                                'financials.amountPending': itemPending
                            },
                            $set: { lastUpdated: new Date() }
                        },
                        upsert: true
                    }
                };
            });

            if (productUpdates.length > 0) {
                const ProductDailySnapshot = require('../models/ProductDailySnapshot');
                await ProductDailySnapshot.bulkWrite(productUpdates);
            }
        }

        console.log(`[Aggregation] Updated Snapshot for ${dateStr} Shop ${saleData.shopId}`);
    }

    /**
     * Revert a Sale Event (Cancellation/Deletion)
     * @param {Object} saleData - The payload from sale.cancelled/deleted event
     */
    static async processSaleCancellation(saleData) {
        const dateStr = moment(saleData.date || saleData.canceledAt || saleData.deletedAt).format('YYYY-MM-DD');
        const netSales = saleData.netSales || 0;
        const totalCost = saleData.totalCosts || 0;
        const grossProfit = netSales - totalCost;

        // 1. Reverse Daily Snapshot
        const updateQuery = {
            $inc: {
                'sales.totalRevenue': -netSales,
                'sales.totalCost': -totalCost,
                'sales.grossProfit': -grossProfit,
                'sales.netProfit': -grossProfit,
                'sales.transactionCount': -1,
                'sales.discountTotal': -(saleData.discount || 0),
                'finance.cashIn': -(saleData.amountReceived || 0),
                'finance.debtIncurred': -(saleData.amountPending || 0)
            },
            $set: { lastUpdated: new Date() }
        };

        await DailySnapshot.updateOne(
            { companyId: saleData.companyId, shopId: saleData.shopId, date: dateStr },
            updateQuery
        );

        // 2. Reverse Product Snapshots
        if (saleData.items && Array.isArray(saleData.items)) {
            const productUpdates = saleData.items.map(item => {
                const itemNet = (item.quantity * (item.price || item.unitPrice)) - (item.discount || 0);
                const itemCost = item.quantity * (item.cost || item.costPrice || 0);
                const itemProfit = itemNet - itemCost;

                const ratio = netSales ? (itemNet / netSales) : 0;
                const itemPending = (saleData.amountPending || 0) * ratio;
                const itemReceived = (saleData.amountReceived || 0) * ratio;

                return {
                    updateOne: {
                        filter: {
                            companyId: saleData.companyId,
                            shopId: saleData.shopId,
                            productId: item.productId,
                            date: dateStr
                        },
                        update: {
                            $inc: {
                                'sales.grossSales': -(item.quantity * (item.price || item.unitPrice)),
                                'sales.discounts': -(item.discount || 0),
                                'sales.netSales': -itemNet,
                                'sales.unitsSold': -item.quantity,
                                'sales.transactionCount': -1,
                                'financials.costOfGoods': -itemCost,
                                'financials.grossProfit': -itemProfit,
                                'financials.amountReceived': -itemReceived,
                                'financials.amountPending': -itemPending
                            },
                            $set: { lastUpdated: new Date() }
                        }
                    }
                };
            });

            if (productUpdates.length > 0) {
                const ProductDailySnapshot = require('../models/ProductDailySnapshot');
                await ProductDailySnapshot.bulkWrite(productUpdates);
            }
        }
        console.log(`[Aggregation] Reversed Snapshot for ${dateStr} Shop ${saleData.shopId}`);
    }

    /**
     * Handle Sale Return (Partial or Full)
     * @param {Object} returnData - Payload from sale.return.restore_stock or similar
     */
    static async processSaleReturn(returnData) {
        const dateStr = moment(returnData.date || returnData.restoredAt).format('YYYY-MM-DD');
        const refundTotal = (returnData.items || []).reduce((sum, i) => sum + (i.refundAmount || 0), 0);
        const costReturned = (returnData.items || []).reduce((sum, i) => sum + ((i.quantity || 0) * (i.costPrice || 0)), 0);

        // 1. Update Daily Snapshot (Subtract Revenue & Cost)
        await DailySnapshot.updateOne(
            { companyId: returnData.companyId, shopId: returnData.shopId, date: dateStr },
            {
                $inc: {
                    'sales.totalRevenue': -refundTotal,
                    'sales.totalCost': -costReturned,
                    'sales.grossProfit': -(refundTotal - costReturned),
                    'sales.netProfit': -(refundTotal - costReturned)
                },
                $set: { lastUpdated: new Date() }
            }
        );

        // 2. Update Product Snapshots
        if (returnData.items && Array.isArray(returnData.items)) {
            const productUpdates = returnData.items.map(item => {
                const refund = item.refundAmount || 0;
                const costVal = (item.quantity || 0) * (item.costPrice || 0);

                return {
                    updateOne: {
                        filter: {
                            companyId: returnData.companyId,
                            shopId: returnData.shopId,
                            productId: item.productId,
                            date: dateStr
                        },
                        update: {
                            $inc: {
                                'sales.netSales': -refund,
                                'sales.unitsSold': -(item.quantity || 0),
                                'financials.costOfGoods': -costVal,
                                'financials.grossProfit': -(refund - costVal)
                            },
                            $set: { lastUpdated: new Date() }
                        }
                    }
                };
            });

            if (productUpdates.length > 0) {
                const ProductDailySnapshot = require('../models/ProductDailySnapshot');
                await ProductDailySnapshot.bulkWrite(productUpdates);
            }

            // 3. Update SalesTransaction Items (Persistent Record)
            const SalesTransaction = require('../models/SalesTransaction');
            for (const item of returnData.items) {
                await SalesTransaction.updateOne(
                    { saleId: returnData.saleId, "items.productId": item.productId },
                    {
                        $inc: {
                            "items.$.returns": item.quantity,
                            "items.$.netQty": -item.quantity
                        },
                        $set: { lastUpdated: new Date() }
                    }
                );
            }
        }

        console.log(`[Aggregation] Processed Return for Sale ${returnData.saleId}`);
    }

    /**
     * Update an existing Sale (Diff-based)
     * @param {Object} newData - New payload from sale.updated
     * @param {Object} oldTx - Existing SalesTransaction from DB
     */
    static async processSaleUpdate(newData, oldTx) {
        const dateStr = moment(oldTx.date).format('YYYY-MM-DD');

        // 1. Calculate Financial Diffs for DailySnapshot
        const diffs = {
            revenue: (newData.netSales || 0) - (oldTx.totalAmount || 0),
            cost: (newData.totalCosts || 0) - (oldTx.items.reduce((sum, i) => sum + (i.qtySold * (i.costPrice || i.cost || 0)), 0)),
            discount: (newData.discount || 0) - (oldTx.debt?.discount || 0),
            cash: (newData.amountReceived || 0) - (oldTx.debt?.amountPaid || 0),
            debt: (newData.amountPending || 0) - (oldTx.debt?.balance || 0)
        };

        // 2. Update Daily Snapshot
        await DailySnapshot.updateOne(
            { companyId: oldTx.companyId, shopId: oldTx.shopId, date: dateStr },
            {
                $inc: {
                    'sales.totalRevenue': diffs.revenue,
                    'sales.totalCost': diffs.cost,
                    'sales.grossProfit': (diffs.revenue - diffs.cost),
                    'sales.netProfit': (diffs.revenue - diffs.cost),
                    'sales.discountTotal': diffs.discount,
                    'finance.cashIn': diffs.cash,
                    'finance.debtIncurred': diffs.debt
                },
                $set: { lastUpdated: new Date() }
            }
        );

        // 3. Update Product Snapshots (Item-Level Diffing)
        if (newData.items) {
            const ProductDailySnapshot = require('../models/ProductDailySnapshot');
            const productUpdates = [];

            // Map old items for easy lookup
            const oldItemsMap = {};
            oldTx.items.forEach(i => { oldItemsMap[i.productId] = i; });

            // Process New/Updated Items
            newData.items.forEach(newItem => {
                const oldItem = oldItemsMap[newItem.productId];
                const qtyDiff = (newItem.quantity || 0) - (oldItem?.qtySold || 0);
                const amtDiff = ((newItem.quantity * newItem.price) - (newItem.discount || 0)) - (oldItem?.totalAmount || 0);
                const costDiff = (newItem.quantity * (newItem.cost || newItem.costPrice || 0)) - (oldItem?.qtySold * (oldItem?.costPrice || 0) || 0);

                if (qtyDiff !== 0 || amtDiff !== 0) {
                    productUpdates.push({
                        updateOne: {
                            filter: { companyId: oldTx.companyId, shopId: oldTx.shopId, productId: newItem.productId, date: dateStr },
                            update: {
                                $inc: {
                                    "sales.unitsSold": qtyDiff,
                                    "sales.netSales": amtDiff,
                                    "financials.costOfGoods": costDiff,
                                    "financials.grossProfit": (amtDiff - costDiff)
                                }
                            },
                            upsert: true
                        }
                    });
                }
                delete oldItemsMap[newItem.productId]; // Handled
            });

            // Process Removed Items (Anything left in oldItemsMap)
            Object.values(oldItemsMap).forEach(removedItem => {
                productUpdates.push({
                    updateOne: {
                        filter: { companyId: oldTx.companyId, shopId: oldTx.shopId, productId: removedItem.productId, date: dateStr },
                        update: {
                            $inc: {
                                "sales.unitsSold": -removedItem.qtySold,
                                "sales.netSales": -removedItem.totalAmount,
                                "financials.costOfGoods": -(removedItem.qtySold * (removedItem.costPrice || 0)),
                                "financials.grossProfit": -(removedItem.totalAmount - (removedItem.qtySold * (removedItem.costPrice || 0)))
                            }
                        }
                    }
                });
            });

            if (productUpdates.length > 0) {
                await ProductDailySnapshot.bulkWrite(productUpdates);
            }
        }

        // 4. Update SalesTransaction Record
        const SalesTransaction = require('../models/SalesTransaction');
        await SalesTransaction.updateOne(
            { saleId: oldTx.saleId },
            {
                $set: {
                    totalAmount: newData.netSales,
                    "debt.amountPaid": newData.amountReceived,
                    "debt.balance": newData.amountPending,
                    items: newData.items ? newData.items.map(i => ({
                        productId: i.productId,
                        productName: i.productName,
                        qtySold: i.quantity,
                        netQty: i.quantity,
                        unitPrice: i.price,
                        totalAmount: i.quantity * i.price,
                        costPrice: i.cost || i.costPrice
                    })) : oldTx.items
                }
            }
        );

        console.log(`[Aggregation] Updated Sale ${oldTx.saleId} with Item Diffs`);
    }

    /**
     * Re-Aggregate a Day from scratch (Self-Healing)
     * Useful if counters get out of sync or for backfilling
     */
    static async rebuildDailySnapshot(companyId, shopId, dateStr) {
        // 1. Aggregate from SalesTransaction
        const salesAgg = await SalesTransaction.aggregate([
            {
                $match: {
                    companyId,
                    shopId,
                    createdAt: {
                        $gte: new Date(dateStr),
                        $lt: new Date(moment(dateStr).add(1, 'days').toISOString())
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalAmount" },
                    totalCost: { $sum: "$costOfGoods" },
                    grossProfit: { $sum: "$grossProfit" },
                    txCount: { $sum: 1 },
                    discountTotal: { $sum: "$discountTotal" }
                }
            }
        ]);

        const sales = salesAgg[0] || {
            totalRevenue: 0,
            totalCost: 0,
            grossProfit: 0,
            txCount: 0,
            discountTotal: 0
        };

        // 2. Update or Create Snapshot
        await DailySnapshot.findOneAndUpdate(
            { companyId, shopId, date: dateStr },
            {
                $set: {
                    'sales.totalRevenue': sales.totalRevenue,
                    'sales.totalCost': sales.totalCost,
                    'sales.grossProfit': sales.grossProfit,
                    'sales.transactionCount': sales.txCount,
                    'sales.discountTotal': sales.discountTotal
                }
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Rebuilt snapshot for ${dateStr} (${shopId})`);
    }
}

module.exports = AggregationService;