const ReportGenerator = require('../services/ReportGenerator');
const SalesAggregate = require('../models/SalesAggregate');
const InventorySnapshot = require('../models/InventorySnapshot');
const DebtAggregate = require('../models/DebtAggregate');
const PaymentAggregate = require('../models/PaymentAggregate');
const StaffPerformance = require('../models/StaffPerformance');
const BranchPerformance = require('../models/BranchPerformance');
const Metric = require('../models/Metric');
const moment = require('moment');
const logger = require('../config/logger');

const getTenantParams = (req) => {
    const companyId = req.query.companyId || (req.params && req.params.companyId) || (req.body && req.body.companyId);
    const shopId = req.query.shopId || (req.params && req.params.shopId) || (req.body && req.body.shopId);

    if (!companyId) throw new Error('companyId is required');
    return { companyId, shopId };
};

/**
 * GET /reports/general
 */
exports.getGeneralReport = async (req, res) => {
    try {
        const { companyId, shopId } = getTenantParams(req);
        const filter = req.query.filter || 'daily';
        const reportDate = req.query.date ? new Date(req.query.date) : new Date();

        // 1. Get Current Metric for KPI Cards
        const currentPeriodKey = filter === 'daily' ? moment.utc(reportDate).format('YYYY-MM-DD') :
            ReportGenerator._getPeriodKey(filter, reportDate);

        let currentMetric = await Metric.findOne({
            companyId,
            shopId: shopId || null,
            type: filter === 'daily' ? 'daily' : filter,
            key: currentPeriodKey
        }).lean();

        // Self-Healing / JIT Reconciliation:
        // Always rebuild daily metrics for CURRENT day to ensure cards match table (addresses 92 vs 9476 issue)
        const isCurrentDay = filter === 'daily' && currentPeriodKey === moment.utc().format('YYYY-MM-DD');
        if (isCurrentDay) {
            currentMetric = await ReportGenerator.rebuildMetricsFromAggregates(companyId, shopId, reportDate);
        } else if (!currentMetric && !shopId) {
            // JIT Backfill for missing historical company-level metrics
            currentMetric = await ReportGenerator.backfillCompanyMetrics(companyId, filter, reportDate);
        }

        // 2. Get Real Trends
        const trends = await ReportGenerator.getTrendMetrics(companyId, shopId, filter, reportDate);

        // 3. Format Cards
        const netSales = currentMetric?.netSales || 0;
        const totalCosts = currentMetric?.totalCosts || 0;
        const netProfit = netSales - totalCosts;

        const cards = [
            { title: 'Net Sales', value: netSales, trend: trends.netSales, icon: 'sales' },
            { title: 'Total Costs', value: totalCosts, trend: trends.totalCosts, icon: 'costs' },
            { title: 'Net Profit', value: netProfit, trend: trends.netProfit, icon: 'profit' },
            { title: 'Returns', value: currentMetric?.returns || 0, trend: trends.returns, icon: 'returns' },
            { title: 'Outstanding Debt', value: currentMetric?.outstandingDebts || 0, trend: trends.outstandingDebts, icon: 'debt' },
            { title: 'Payments Received', value: currentMetric?.paymentsReceived || 0, trend: trends.paymentsReceived, icon: 'payment' },
            { title: 'Inventory Value', value: currentMetric?.inventoryValue || 0, trend: trends.inventoryValue, icon: 'inventory' }
        ];

        // 4. Get Chart Data
        const chart = await ReportGenerator.getChartData(companyId, shopId, filter, reportDate);

        // 5. Get Performance Table
        const table = await ReportGenerator.getPerformanceTable(companyId, shopId, filter, reportDate);

        res.json({
            filters: { current: filter, options: ['daily', 'weekly', 'monthly', 'yearly'] },
            cards,
            chart,
            table
        });
    } catch (error) {
        logger.error('Error in general report:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /reports/inventory
 */
exports.getInventoryReport = async (req, res) => {
    try {
        const { companyId, shopId } = getTenantParams(req);
        const targetDate = req.query.date || moment().format('YYYY-MM-DD');

        const table = await InventorySnapshot.find({
            companyId,
            shopId: shopId || { $exists: false },
            date: targetDate
        }).lean();

        const totalValue = table.reduce((s, i) => s + (i.totalStockValue || 0), 0);
        const lowStock = table.filter(i => i.closingStock <= (i.reorderLevel || 0)).length;

        const cards = [
            { title: 'Total Items', value: table.reduce((s, i) => s + (i.closingStock || 0), 0), icon: 'items' },
            { title: 'Low Stock Alerts', value: lowStock, icon: 'alert' },
            { title: 'Total Value', value: totalValue, icon: 'value' }
        ];

        res.json({ cards, table });
    } catch (error) {
        logger.error('Error in inventory report:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /reports/sales
 */
exports.getSalesReport = async (req, res) => {
    try {
        const { companyId, shopId } = getTenantParams(req);
        const targetDate = req.query.date || moment().format('YYYY-MM-DD');

        const table = await SalesAggregate.find({
            companyId,
            shopId: shopId || { $exists: false },
            date: targetDate
        }).lean();

        const totalSales = table.reduce((s, i) => s + (i.netSales || 0), 0);
        const totalTrans = table.reduce((s, i) => s + (i.transactionCount || 0), 0);

        const cards = [
            { title: 'Total Sales', value: totalSales, icon: 'revenue' },
            { title: 'Avg Order Value', value: totalTrans ? (totalSales / totalTrans).toFixed(2) : 0, icon: 'avg' }
        ];

        res.json({ cards, table });
    } catch (error) {
        logger.error('Error in sales report:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /reports/debts
 */
exports.getDebtsReport = async (req, res) => {
    try {
        const { companyId, shopId } = getTenantParams(req);
        const table = await DebtAggregate.find({
            companyId,
            shopId: shopId || { $exists: false },
            outstandingBalance: { $gt: 0 }
        }).lean();

        const totalDebt = table.reduce((s, i) => s + (i.outstandingBalance || 0), 0);
        const overdue = table.filter(d => d.status === 'OVERDUE').length;

        const cards = [
            { title: 'Total Debt', value: totalDebt, icon: 'debt' },
            { title: 'Overdue Accounts', value: overdue, icon: 'overdue' }
        ];

        res.json({ cards, table });
    } catch (error) {
        logger.error('Error in debts report:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /reports/payments
 */
exports.getPaymentsReport = async (req, res) => {
    try {
        const { companyId, shopId } = getTenantParams(req);
        const targetDate = req.query.date || moment().format('YYYY-MM-DD');

        const table = await PaymentAggregate.find({
            companyId,
            shopId: shopId || { $exists: false },
            date: targetDate
        }).lean();

        const totalPayments = table.reduce((s, i) => s + (i.amount || 0), 0);
        const momo = table.filter(p => p.paymentMethod?.toLowerCase().includes('momo')).reduce((s, i) => s + i.amount, 0);

        const cards = [
            { title: 'Total Received', value: totalPayments, icon: 'payment' },
            { title: 'Mobile Money', value: momo, icon: 'momo' }
        ];

        res.json({ cards, table });
    } catch (error) {
        logger.error('Error in payments report:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /reports/staff
 */
exports.getStaffReport = async (req, res) => {
    try {
        const { companyId, shopId } = getTenantParams(req);
        const targetDate = req.query.date || moment().format('YYYY-MM-DD');

        const table = await StaffPerformance.find({
            companyId,
            shopId: shopId || { $exists: false },
            date: targetDate
        }).lean();

        res.json({ table });
    } catch (error) {
        logger.error('Error in staff report:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /reports/branches
 */
exports.getBranchesReport = async (req, res) => {
    try {
        const { companyId } = getTenantParams(req);
        const targetDate = req.query.date || moment().format('YYYY-MM-DD');

        const table = await BranchPerformance.find({
            companyId,
            date: targetDate
        }).lean();

        res.json({ table });
    } catch (error) {
        logger.error('Error in branches report:', error);
        res.status(500).json({ error: error.message });
    }
};
