const AnalyticsEvent = require("../models/AnalyticsEvent.model");
const SalesMetric = require("../models/SalesMetric.model");
const InventoryMetric = require("../models/InventoryMetric.model");

const sequelize = require("../config/database");
const { Op } = require("sequelize");
const { startOfDay, endOfDay, subDays, format } = require("date-fns");
const redis = require("/app/shared/redis"); // Shared Redis Client

const CACHE_TTL = 180; // 3 minutes default

/**
 * Cache Wrapper Helper
 */
const getOrSetCache = async (key, ttl, fetchFn) => {
    try {
        if (!redis.isConnected) await redis.connect();
        const cached = await redis.get(key);
        if (cached) {
            // console.log(`🚀 Cache HIT: ${key}`);
            return JSON.parse(cached);
        }
    } catch (err) {
        console.warn(`⚠️ Cache Error (Get) for ${key}:`, err.message);
    }

    const data = await fetchFn();

    try {
        if (data) {
            await redis.set(key, JSON.stringify(data), 'EX', ttl);
            // console.log(`💾 Cache SET: ${key}`);
        }
    } catch (err) {
        console.warn(`⚠️ Cache Error (Set) for ${key}:`, err.message);
    }

    return data;
};

/**
 * Helper to parse time range query params
 */
const getTimeRange = (req) => {
    const { startDate, endDate, period = '7d' } = req.query;

    let start, end;

    if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
    } else {
        end = new Date();
        switch (period) {
            case '24h': start = subDays(end, 1); break;
            case '30d': start = subDays(end, 30); break;
            case '90d': start = subDays(end, 90); break;
            case '1y': start = subDays(end, 365); break;
            default: start = subDays(end, 7); // Default 7d
        }
    }
    return { start, end };
};

/**
 * Sales Report: Revenue over time
 */
exports.getRevenueReport = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { interval = 'day', companyId } = req.query; // 'hour', 'day', 'month'

        // postgres/timescale specific date truncation
        // We query 'sale.created' events which contain totalAmount in payload

        // We need to cast it to numeric to sum it.
        const validIntervals = ['hour', 'day', 'week', 'month', 'year'];
        const intervalStr = validIntervals.includes(interval) ? interval : 'day';

        const cacheKey = `analytics:revenue:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}:${intervalStr}`;

        const revenue = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            return await AnalyticsEvent.findAll({
                where: {
                    event_type: 'sale.created',
                    time: { [Op.between]: [start, end] }
                },
                attributes: [
                    [sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'date'],
                    [sequelize.literal("SUM(CAST(payload->>'totalAmount' AS DECIMAL))"), 'revenue'],
                    [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount']
                ],
                group: [sequelize.fn('date_trunc', intervalStr, sequelize.col('time'))],
                order: [[sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'ASC']],
                raw: true
            });
        });

        res.json({ success: true, data: revenue });
    } catch (error) {
        console.error("Sales Report Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Sales Report: Payment Method Stats
 */
/**
 * Sales Report: Payment Method Stats
 */
exports.getPaymentMethodStats = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId } = req.query;

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        const cacheKey = `analytics:paymentMethods:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}`;

        const stats = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            return await SalesMetric.findAll({
                where: whereClause,
                attributes: [
                    ['paymentMethod', 'method'],
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('amount')), 'revenue']
                ],
                group: ['paymentMethod'],
                order: [[sequelize.literal('"count"'), 'DESC']],
                raw: true
            });
        });

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error("Payment Stats Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Product Report: Top Selling Products
 * This is trickier because items are in an array in the payload.
 * Postgres can expand JSON arrays with jsonb_array_elements.
 */
exports.getTopProducts = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { limit = 10, companyId } = req.query;

        const cacheKey = `analytics:topProducts:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}:${limit}`;

        const products = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            // Query: Select items from array, group by productId, sum quantity/total
            const query = `
                SELECT 
                    item->>'productId' as "productId",
                    item->>'productName' as "productName",
                    SUM(CAST(item->>'quantity' AS DECIMAL)) as "totalQuantity",
                    SUM(CAST(item->>'total' AS DECIMAL)) as "totalRevenue"
                FROM analytics_events,
                jsonb_array_elements(payload->'items') as item
                WHERE event_type = 'sale.created'
                AND time BETWEEN :start AND :end
                ${companyId ? 'AND "companyId" = :companyId' : ''}
                GROUP BY item->>'productId', item->>'productName'
                ORDER BY "totalRevenue" DESC
                LIMIT :limit
            `;
            return await sequelize.query(query, {
                replacements: { start, end, limit: parseInt(limit), companyId },
                type: sequelize.QueryTypes.SELECT
            });
        });

        res.json({ success: true, data: products });
    } catch (error) {
        console.error("Top Products Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Customer Report: Active Users (DAU/MAU)
 */
exports.getActiveUsers = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { interval = 'day', companyId } = req.query;
        const validIntervals = ['hour', 'day', 'week', 'month', 'year'];
        const intervalStr = validIntervals.includes(interval) ? interval : 'day';

        // DAU: Count unique userIds per day from login events
        const stats = await AnalyticsEvent.findAll({
            where: {
                event_type: 'auth.user.logged_in',
                time: { [Op.between]: [start, end] },
                ...(companyId && { companyId })
            },
            attributes: [
                [sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'date'],
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.literal("payload->>'userId'"))), 'activeUsers']
            ],
            group: [sequelize.fn('date_trunc', intervalStr, sequelize.col('time'))],
            order: [[sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'ASC']],
            raw: true
        });

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error("Active Users Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Customer Report: New Customer Acquisition
 */
exports.getNewCustomerStats = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { interval = 'day', companyId } = req.query;
        const validIntervals = ['hour', 'day', 'week', 'month', 'year'];
        const intervalStr = validIntervals.includes(interval) ? interval : 'day';

        const stats = await AnalyticsEvent.findAll({
            where: {
                event_type: 'auth.user.created',
                time: { [Op.between]: [start, end] },
                ...(companyId && { companyId })
            },
            attributes: [
                [sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'newCustomers']
            ],
            group: [sequelize.fn('date_trunc', intervalStr, sequelize.col('time'))],
            order: [[sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'ASC']],
            raw: true
        });

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error("New Customers Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Customer Report: Top Customers by Revenue
 */
exports.getTopCustomers = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { limit = 10, companyId } = req.query;

        // Group sales by customerId (if available) or customerName
        // payload: { customerId, customerName, totalAmount }

        const customers = await AnalyticsEvent.findAll({
            where: {
                event_type: 'sale.created',
                time: { [Op.between]: [start, end] },
                ...(companyId && { companyId })
                // We might want to filter out null customerIds if only interested in registered users
            },
            attributes: [
                [sequelize.literal("payload->>'customerId'"), 'customerId'],
                [sequelize.literal("payload->>'customerName'"), 'customerName'],
                [sequelize.literal("SUM(CAST(payload->>'totalAmount' AS DECIMAL))"), 'totalSpent'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount']
            ],
            group: [sequelize.literal("payload->>'customerId'"), sequelize.literal("payload->>'customerName'")],
            order: [[sequelize.literal('"totalSpent"'), 'DESC']], // Quotes needed for alias ref in order?
            limit: parseInt(limit),
            raw: true
        });

        res.json({ success: true, data: customers });
    } catch (error) {
        console.error("Top Customers Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Product Report: Return Rates
 * Uses 'sale.return.inventory.confirmation.requested' event which contains returned items
 */
exports.getReturnRates = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { limit = 10, companyId } = req.query;

        // Query: Sum quantity of returned products
        // Payload has items: [ { productId, quantity } ]

        const query = `
            SELECT 
                item->>'productId' as "productId",
                SUM(CAST(item->>'quantity' AS DECIMAL)) as "returnedQuantity"
            FROM analytics_events,
            jsonb_array_elements(payload->'items') as item
            WHERE event_type = 'sale.return.inventory.confirmation.requested'
            AND time BETWEEN :start AND :end
            ${companyId ? 'AND "companyId" = :companyId' : ''}
            GROUP BY item->>'productId'
            ORDER BY "returnedQuantity" DESC
            LIMIT :limit
        `;

        const products = await sequelize.query(query, {
            replacements: { start, end, limit: parseInt(limit), companyId },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({ success: true, data: products });
    } catch (error) {
        console.error("Return Rates Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Shop Performance Report
 */
exports.getShopPerformance = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId } = req.query;

        // Uses SalesMetric hypertable (much faster than parsing JSON payload)
        // If employeeId/soldBy was recently added, this works for new data. 
        // For old data it might be null, effectively "Unknown Shop" if not careful, 
        // but SalesMetric always had shopId. SalesMetric has had shopId since creation!

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        const performance = await SalesMetric.findAll({
            where: whereClause,
            attributes: [
                'shopId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalOrders'],
                [sequelize.fn('SUM', sequelize.col('itemCount')), 'totalItemsSold']
            ],
            group: ['shopId'],
            order: [[sequelize.literal('"totalRevenue"'), 'DESC']],
            raw: true
        });

        res.json({ success: true, data: performance });
    } catch (error) {
        console.error("Shop Performance Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Employee Performance Report (Best Sellers)
 */
exports.getEmployeePerformance = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId } = req.query;

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;
        // Filter out null employeeIds (e.g. historical data before we added the column)
        whereClause.employeeId = { [Op.ne]: null };

        const cacheKey = `analytics:employees:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}`;

        const performance = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            return await SalesMetric.findAll({
                where: whereClause,
                attributes: [
                    'employeeId',
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalSales'],
                    [sequelize.fn('COUNT', sequelize.col('id')), 'transactionsCount']
                ],
                group: ['employeeId'],
                order: [[sequelize.literal('"totalSales"'), 'DESC']],
                raw: true
            });
        });

        res.json({ success: true, data: performance });
    } catch (error) {
        console.error("Employee Performance Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};


/**
 * Inventory Report: Health & Velocity
 * Estimates current stock and sales velocity from metrics
 */
exports.getInventoryHealth = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId } = req.query;

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        // 1. Stock Velocity (Total items sold/removed over period)
        // Operation 'sale' has negative changeAmount
        const velocity = await InventoryMetric.sum('changeAmount', {
            where: {
                ...whereClause,
                operation: 'sale'
            }
        });

        // 2. Current Stock Snapshot (Latest record per product)
        // Note: This is an approximation based on the last event in the window
        // For accurate real-time stock, one should query inventory-service directly.
        // This is useful for "Ending Inventory" analysis for a period.

        const latestStockQuery = `
            SELECT 
                COUNT(*) as "totalProductsTracked",
                SUM("currentStock") as "totalStockVolume"
            FROM (
                SELECT DISTINCT ON ("productId") "currentStock"
                FROM inventory_metrics
                WHERE "time" <= :end
                ${companyId ? 'AND "companyId" = :companyId' : ''}
                ORDER BY "productId", "time" DESC
            ) as latest
        `;

        const stockSnapshot = await sequelize.query(latestStockQuery, {
            replacements: { end, companyId },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({
            success: true,
            data: {
                period: { start, end },
                salesVelocity: Math.abs(velocity || 0), // positive number of items sold
                ...stockSnapshot[0]
            }
        });

    } catch (error) {
        console.error("Inventory Health Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Product Report: Trending Categories
 * Aggregates sales volume by category using Inventory Metrics
 */
exports.getTrendingCategories = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId, limit = 5 } = req.query;

        const whereClause = {
            time: { [Op.between]: [start, end] },
            operation: 'sale'
        };
        if (companyId) whereClause.companyId = companyId;

        // Sum absolute changeAmount (since sales are negative) by category
        const categories = await InventoryMetric.findAll({
            where: whereClause,
            attributes: [
                'category',
                [sequelize.fn('SUM', sequelize.fn('ABS', sequelize.col('changeAmount'))), 'totalUnitsSold'],
                [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('productId'))), 'uniqueProductsSold']
            ],
            group: ['category'],
            order: [[sequelize.literal('"totalUnitsSold"'), 'DESC']],
            limit: parseInt(limit),
            raw: true
        });

        res.json({ success: true, data: categories });
    } catch (error) {
        console.error("Trending Categories Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Profitability Report (Gross Margin)
 */
exports.getProfitabilityReport = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId, interval = 'day' } = req.query;

        const validIntervals = ['hour', 'day', 'week', 'month', 'year'];
        const intervalStr = validIntervals.includes(interval) ? interval : 'day';

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        const cacheKey = `analytics:profitability:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}:${intervalStr}`;

        const profitStats = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            return await SalesMetric.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'date'],
                    [sequelize.fn('SUM', sequelize.col('amount')), 'revenue'],
                    [sequelize.fn('SUM', sequelize.col('costAmount')), 'cost'],
                    [sequelize.fn('SUM', sequelize.col('profit')), 'profit'],
                    // Gross Margin % = (Profit / Revenue) * 100
                    // Postgres division needs casting to avoid integer division if types were int
                    [sequelize.literal(`
                        CASE WHEN SUM(amount) > 0 
                        THEN (SUM(profit) / SUM(amount)) * 100 
                        ELSE 0 END
                    `), 'grossMarginPercent']
                ],
                group: [sequelize.fn('date_trunc', intervalStr, sequelize.col('time'))],
                order: [[sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'ASC']],
                raw: true
            });
        });

        res.json({ success: true, data: profitStats });
    } catch (error) {
        console.error("Profitability Report Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Export Report
 * Generic endpoint to export data as CSV/JSON
 */
exports.exportReport = async (req, res) => {
    try {
        const { type, format = 'json' } = req.query;
        // reuse existing logic based on 'type'
        let data = [];

        // Mock request object for internal call
        const mockReq = { query: req.query };
        const mockRes = {
            json: (payload) => { data = payload.data; },
            status: () => ({ json: () => { } })
        };

        switch (type) {
            case 'revenue': await exports.getRevenueReport(mockReq, mockRes); break;
            case 'payment-methods': await exports.getPaymentMethodStats(mockReq, mockRes); break;
            case 'top-products': await exports.getTopProducts(mockReq, mockRes); break;
            case 'return-rates': await exports.getReturnRates(mockReq, mockRes); break;
            case 'new-customers': await exports.getNewCustomerStats(mockReq, mockRes); break;
            case 'active-users': await exports.getActiveUsers(mockReq, mockRes); break;
            case 'top-customers': await exports.getTopCustomers(mockReq, mockRes); break;
            case 'shops-performance': await exports.getShopPerformance(mockReq, mockRes); break;
            case 'employees-performance': await exports.getEmployeePerformance(mockReq, mockRes); break;
            case 'profitability': await exports.getProfitabilityReport(mockReq, mockRes); break;
            case 'stock-movement': await exports.getStockMovementStats(mockReq, mockRes); break;
            default: return res.status(400).json({ success: false, message: "Invalid report type" });
        }

        if (format === 'csv') {
            // Simple JSON to CSV converter
            if (!data || data.length === 0) return res.send("");

            const keys = Object.keys(data[0]);
            const header = keys.join(',');
            const rows = data.map(row => keys.map(k => {
                const val = row[k];
                return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
            }).join(','));

            res.header('Content-Type', 'text/csv');
            res.attachment(`${type}-report.csv`);
            return res.send([header, ...rows].join('\n'));
        }

        res.json({ success: true, data });

    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Stock Movement Comparison (In vs Out)
 */
exports.getStockMovementStats = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId, interval = 'day' } = req.query;
        const validIntervals = ['hour', 'day', 'week', 'month', 'year'];
        const intervalStr = validIntervals.includes(interval) ? interval : 'day';

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        const cacheKey = `analytics:stockMove:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}:${intervalStr}`;

        const stats = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            return await InventoryMetric.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'date'],
                    // Stock In: Positive changes (restock, return)
                    [sequelize.literal(`SUM(CASE WHEN "changeAmount" > 0 THEN "changeAmount" ELSE 0 END)`), 'stockIn'],
                    // Stock Out: Negative changes (sale) - ABS value
                    [sequelize.literal(`ABS(SUM(CASE WHEN "changeAmount" < 0 THEN "changeAmount" ELSE 0 END))`), 'stockOut'],
                    // Net Flow
                    [sequelize.fn('SUM', sequelize.col('changeAmount')), 'netFlow']
                ],
                group: [sequelize.fn('date_trunc', intervalStr, sequelize.col('time'))],
                order: [[sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'ASC']],
                raw: true
            });
        });

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error("Stock Movement Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Best Payment Method (Ranked)
 */
exports.getBestPaymentMethod = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId } = req.query;

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        // Uses SalesMetric
        const stats = await SalesMetric.findAll({
            where: whereClause,
            attributes: [
                ['paymentMethod', 'method'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
            ],
            group: ['paymentMethod'],
            order: [[sequelize.literal('"transactionCount"'), 'DESC']],
            raw: true
        });

        // Determine "Best" (most used)
        const best = stats.length > 0 ? stats[0] : null;

        res.json({
            success: true,
            data: {
                best,
                ranking: stats
            }
        });
    } catch (error) {
        console.error("Best Payment Method Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Financial Returns Report
 * Uses ReturnMetric for accurate financial data
 */
exports.getFinancialReturnsReport = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId, interval = 'day' } = req.query;
        const validIntervals = ['hour', 'day', 'week', 'month', 'year'];
        const intervalStr = validIntervals.includes(interval) ? interval : 'day';

        const { ReturnMetric } = require("../models");

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        const cacheKey = `analytics:returns:financial:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}:${intervalStr}`;

        const stats = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            return await ReturnMetric.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'date'],
                    [sequelize.fn('SUM', sequelize.col('refundAmount')), 'totalRefunded'],
                    [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('returnId'))), 'returnCount'],
                    [sequelize.fn('SUM', sequelize.col('quantity')), 'itemsReturned']
                ],
                group: [sequelize.fn('date_trunc', intervalStr, sequelize.col('time'))],
                order: [[sequelize.fn('date_trunc', intervalStr, sequelize.col('time')), 'ASC']],
                raw: true
            });
        });

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error("Financial Returns Report Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Customer Health Report (LTV & Churn Risks)
 * Uses CustomerMetric
 */
exports.getCustomerHealthReport = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { companyId } = req.query;

        const { CustomerMetric } = require("../models");

        const whereClause = {
            time: { [Op.between]: [start, end] }
        };
        if (companyId) whereClause.companyId = companyId;

        const cacheKey = `analytics:customers:health:${companyId || 'all'}:${start.toISOString()}:${end.toISOString()}`;

        const stats = await getOrSetCache(cacheKey, CACHE_TTL, async () => {
            // 1. Calculate Net LTV Change in Period (Purchases - Returns)
            const ltvStats = await CustomerMetric.findAll({
                where: whereClause,
                attributes: [
                    'type',
                    [sequelize.fn('SUM', sequelize.col('value')), 'totalValue'],
                    [sequelize.fn('COUNT', sequelize.col('id')), 'eventCount']
                ],
                group: ['type'],
                raw: true
            });

            // 2. Identify High Value Customers (Top 5 LTV increase)
            const topCustomers = await CustomerMetric.findAll({
                where: { ...whereClause, type: 'PURCHASE' },
                attributes: [
                    'hashedCustomerId',
                    [sequelize.fn('SUM', sequelize.col('value')), 'periodSpend']
                ],
                group: ['hashedCustomerId'],
                order: [[sequelize.literal('"periodSpend"'), 'DESC']],
                limit: 5,
                raw: true
            });

            return {
                summary: ltvStats,
                topCustomers
            };
        });

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error("Customer Health Report Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
