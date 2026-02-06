const GeneralReportService = require('../services/GeneralReportService');
const DailySnapshot = require('../models/DailySnapshot');
const SalesTransaction = require('../models/SalesTransaction');
const moment = require('moment');
const { getDateRange } = require('../utils/dateUtils');

/**
 * Get Executive Dashboard Overview
 * "The Magical View"
 */
exports.getExecutiveOverview = async (req, res) => {
    try {
        const { companyId } = req.query; // requireCompanyAccess ensures this is valid
        const shopId = req.query.shopId;
        const period = req.query.period || 'this_month';

        const { start, end } = getDateRange(null, null, period);

        // 2. Query Aggregate Snapshots
        const query = {
            companyId,
            date: { $gte: start, $lte: end }
        };
        if (shopId) query.shopId = shopId;

        const snapshots = await DailySnapshot.find(query).sort({ date: 1 }).lean();

        // 3. Aggregate In-Memory
        const totalStats = snapshots.reduce((acc, curr) => {
            acc.revenue += (curr.sales.totalRevenue || 0);
            acc.profit += (curr.sales.grossProfit || 0);
            acc.debt += (curr.finance.debtIncurred || 0);
            acc.cashIn += (curr.finance.cashIn || 0);
            return acc;
        }, { revenue: 0, profit: 0, debt: 0, cashIn: 0 });

        const chartData = snapshots.map(s => ({
            date: s.date,
            revenue: s.sales.totalRevenue,
            profit: s.sales.grossProfit
        }));

        res.json({
            meta: { period, startDate: start, endDate: end },
            kpi: {
                totalRevenue: totalStats.revenue,
                totalProfit: totalStats.profit,
                cashReceived: totalStats.cashIn,
                outstandingDebt: totalStats.debt,
                profitMargin: totalStats.revenue ? Math.round((totalStats.profit / totalStats.revenue) * 100) : 0
            },
            chart: chartData
        });

    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ error: "Failed to generate executive report" });
    }
};

/**
 * Get Deep Dive Sales Report
 */
exports.getDetailedSalesAnalysis = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period, groupBy = 'product' } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const pipeline = [
            {
                $match: {
                    companyId,
                    date: { $gte: new Date(start), $lte: new Date(end) }
                }
            },
            { $unwind: "$items" } // CRITICAL: Unwind items before grouping
        ];

        // Dynamic Grouping
        let groupField = "$items.productId";
        let extraFields = { productName: { $first: "$items.productName" } };

        if (groupBy === 'category') {
            groupField = "$items.categoryId";
        } else if (groupBy === 'staff') {
            groupField = "$soldBy";
            extraFields = { staffName: { $first: "$staffName" } };
        }

        pipeline.push({
            $group: {
                _id: groupField,
                ...extraFields,
                revenue: { $sum: "$items.totalAmount" },
                cost: { $sum: { $multiply: ["$items.qtySold", { $ifNull: ["$items.costPrice", 0] }] } },
                units: { $sum: "$items.qtySold" },
                txCount: { $addToSet: "$_id" } // Count unique transactions
            }
        });

        pipeline.push({
            $project: {
                _id: 1,
                productName: 1,
                staffName: 1,
                revenue: 1,
                cost: 1,
                profit: { $subtract: ["$revenue", "$cost"] },
                units: 1,
                txCount: { $size: "$txCount" }
            }
        });

        pipeline.push({ $sort: { revenue: -1 } });
        pipeline.push({ $limit: 100 });

        const results = await SalesTransaction.aggregate(pipeline);

        res.json({
            meta: { start, end, groupBy },
            data: results
        });

    } catch (error) {
        console.error("Analysis Error:", error);
        res.status(500).json({ error: "Analysis failed" });
    }
};

/**
 * Get Company General Report
 */
exports.getCompanyGeneralReport = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period } = req.query;
        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await GeneralReportService.getCompanyGeneralReport(companyId, start, end);
        res.json(report);
    } catch (error) {
        console.error("Company Report Error:", error);
        res.status(500).json({ error: error.message || "Failed to generate company report" });
    }
};

/**
 * Get Shop General Report
 */
exports.getShopGeneralReport = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period } = req.query;
        const { start, end } = getDateRange(startDate, endDate, period);

        if (!companyId) return res.status(400).json({ error: "companyId required" });

        const report = await GeneralReportService.getShopGeneralReport(companyId, shopId, start, end);
        res.json(report);
    } catch (error) {
        console.error("Shop Report Error:", error);
        res.status(500).json({ error: error.message || "Failed to generate shop report" });
    }
};
