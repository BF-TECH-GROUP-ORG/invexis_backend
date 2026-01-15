const Metric = require('../../models/Metric');
const InventorySnapshot = require('../../models/InventorySnapshot');
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

    try {
        if (type === 'inventory.stock.updated' || type === 'inventory.restocked') {
            const { companyId, shopId, productId, qty, type: changeType, productName } = data;
            const change = Number(qty || 0);

            // 1. Update Inventory Snapshot
            await InventorySnapshot.findOneAndUpdate(
                { companyId, shopId: shopId || null, productId, date: day },
                {
                    $inc: {
                        [change > 0 ? 'stockIn' : 'stockOut']: Math.abs(change),
                        closingStock: change
                    },
                    $set: {
                        productName,
                        lastMovementDate: dateObj
                    }
                },
                { upsert: true }
            );

            // 2. Update Metrics (Inventory Value Rollup)
            const targetShops = [shopId || null];
            if (shopId) targetShops.push(null);

            const buckets = [
                { type: 'hourly', key: hour },
                { type: 'daily', key: day },
                { type: 'weekly', key: week },
                { type: 'monthly', key: month },
                { type: 'yearly', key: year }
            ];

            for (const sId of targetShops) {
                for (const bucket of buckets) {
                    await Metric.findOneAndUpdate(
                        { companyId, shopId: sId, type: bucket.type, key: bucket.key },
                        { $inc: { inventoryValue: valueChange } },
                        { upsert: true }
                    );
                }
            }

            logger.info(`📦 Updated inventory metrics for ${productId}, change: ${change}`);
        }
    } catch (err) {
        logger.error('Error in inventory handler:', err);
        throw err;
    }
};

module.exports = { handle };
