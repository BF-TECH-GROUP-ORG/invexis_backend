const AnalyticsEvent = require("../models/AnalyticsEvent.model");
const sequelize = require("../config/database");
const { Op } = require("sequelize");
const { startOfDay, endOfDay, subDays, format } = require("date-fns");

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
        const { interval = 'day' } = req.query; // 'hour', 'day', 'month'

        // postgres/timescale specific date truncation
        // We query 'sale.created' events which contain totalAmount in payload

        // Note: extracting from JSONB in Sequelize/Postgres: payload->>'totalAmount'
        // We need to cast it to numeric to sum it.

        const intervalStr = interval === 'hour' ? 'hour' : (interval === 'month' ? 'month' : 'day');

        const revenue = await AnalyticsEvent.findAll({
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

        res.json({ success: true, data: revenue });
    } catch (error) {
        console.error("Sales Report Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Sales Report: Payment Method Stats
 */
exports.getPaymentMethodStats = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);

        const stats = await AnalyticsEvent.findAll({
            where: {
                event_type: 'sale.created',
                time: { [Op.between]: [start, end] }
            },
            attributes: [
                [sequelize.literal("payload->>'paymentMethod'"), 'method'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.literal("SUM(CAST(payload->>'totalAmount' AS DECIMAL))"), 'revenue']
            ],
            group: [sequelize.literal("payload->>'paymentMethod'")],
            order: [[sequelize.literal("count"), 'DESC']],
            raw: true
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
        const { limit = 10 } = req.query;

        // payload structure: { items: [ { productId, productName, quantity, total } ] }
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
            GROUP BY item->>'productId', item->>'productName'
            ORDER BY "totalRevenue" DESC
            LIMIT :limit
        `;

        const products = await sequelize.query(query, {
            replacements: { start, end, limit: parseInt(limit) },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({ success: true, data: products });
    } catch (error) {
        console.error("Top Products Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Customer Report: New Customer Acquisition
 */
exports.getNewCustomerStats = async (req, res) => {
    try {
        const { start, end } = getTimeRange(req);
        const { interval = 'day' } = req.query;

        const intervalStr = interval === 'hour' ? 'hour' : (interval === 'month' ? 'month' : 'day');

        const stats = await AnalyticsEvent.findAll({
            where: {
                event_type: 'auth.user.created',
                time: { [Op.between]: [start, end] }
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
        const { limit = 10 } = req.query;

        // Group sales by customerId (if available) or customerName
        // payload: { customerId, customerName, totalAmount }

        const customers = await AnalyticsEvent.findAll({
            where: {
                event_type: 'sale.created',
                time: { [Op.between]: [start, end] }
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
        const { limit = 10 } = req.query;

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
            GROUP BY item->>'productId'
            ORDER BY "returnedQuantity" DESC
            LIMIT :limit
        `;

        const products = await sequelize.query(query, {
            replacements: { start, end, limit: parseInt(limit) },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({ success: true, data: products });
    } catch (error) {
        console.error("Return Rates Error:", error);
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
            status: () => ({ json: () => {} })
        };

        switch (type) {
            case 'revenue': await exports.getRevenueReport(mockReq, mockRes); break;
            case 'payment-methods': await exports.getPaymentMethodStats(mockReq, mockRes); break;
            case 'top-products': await exports.getTopProducts(mockReq, mockRes); break;
            case 'return-rates': await exports.getReturnRates(mockReq, mockRes); break;
            case 'new-customers': await exports.getNewCustomerStats(mockReq, mockRes); break;
            case 'top-customers': await exports.getTopCustomers(mockReq, mockRes); break;
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
