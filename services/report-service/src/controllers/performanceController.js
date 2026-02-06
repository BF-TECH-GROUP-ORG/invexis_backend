const PerformanceHubService = require('../services/PerformanceHubService');
const moment = require('moment');
const { getDateRange } = require('../utils/dateUtils');

exports.getBranchPerformance = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await PerformanceHubService.getBranchPerformance(companyId, null, start, end);
        res.json(report);
    } catch (error) {
        console.error('Error getting branch performance:', error);
        res.status(500).json({ error: 'Failed to generate branch performance report' });
    }
};

exports.getShopPerformance = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await PerformanceHubService.getBranchPerformance(companyId, shopId, start, end);
        res.json(report);
    } catch (error) {
        console.error('Error getting shop performance:', error);
        res.status(500).json({ error: 'Failed to generate shop performance report' });
    }
};

exports.getStaffPerformance = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await PerformanceHubService.getStaffPerformance(companyId, null, start, end);
        res.json(report);
    } catch (error) {
        console.error('Error getting staff performance:', error);
        res.status(500).json({ error: 'Failed to generate staff performance report' });
    }
};

exports.getShopStaffPerformance = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await PerformanceHubService.getStaffPerformance(companyId, shopId, start, end);
        res.json(report);
    } catch (error) {
        console.error('Error getting shop staff performance:', error);
        res.status(500).json({ error: 'Failed to generate shop staff performance report' });
    }
};

exports.exportPerformance = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { shopId, startDate, endDate, period, type = 'branch', format = 'pdf' } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        let data;
        let headers;
        let title = type === 'staff' ? 'Staff Performance' : 'Branch Performance';

        if (type === 'staff') {
            data = await PerformanceHubService.getStaffPerformance(companyId, shopId, start, end);
            headers = ['Staff Member', 'Role', 'Branch', 'Transactions', 'Revenue', 'Avg Txn', 'Status'];
        } else {
            data = await PerformanceHubService.getBranchPerformance(companyId, shopId, start, end);
            headers = ['Branch', 'Location', 'Transactions', 'Revenue', 'Avg Txn', 'Staff', 'Status'];
        }

        const internalServiceClient = require('../utils/internalServiceClient');
        const [companyData, shopData] = await Promise.all([
            internalServiceClient.getCompanyData(companyId),
            internalServiceClient.getShopData(shopId)
        ]);

        const ReportEventProducer = require('../events/ReportEventProducer');

        let exportPayload = {
            companyId,
            shopId,
            format,
            title,
            subtitle: `Period: ${start} to ${end}`,
            requester: req.user ? req.user.email : 'system',
            companyData: {
                ...companyData,
                shopName: shopData?.name
            },
            rows: data.map(item => type === 'staff' ? [
                item.staffMember,
                item.role,
                item.branch,
                item.transactions,
                item.revenue.toLocaleString(),
                item.avgTransaction.toLocaleString(),
                item.status
            ] : [
                item.branchName,
                item.location,
                item.transactions,
                item.revenue.toLocaleString(),
                item.avgTransaction.toLocaleString(),
                item.activeStaff,
                item.status
            ]),
            pdfHeaders: headers
        };

        if (format === 'excel') {
            exportPayload.columns = headers.map(h => ({ header: h, key: h.toLowerCase().replace(/ /g, ''), width: 15 }));
            exportPayload.rows = data; // Simplified for Excel mapping
        }

        await ReportEventProducer.requestReportGeneration(exportPayload);

        res.status(202).json({ message: 'Performance report export started' });
    } catch (error) {
        console.error('Performance export error:', error);
        res.status(500).json({ error: 'Failed to initiate performance export' });
    }
};
