const SalesReportService = require('../services/SalesReportService');
const moment = require('moment');
const { getCache, setCache } = require('../utils/redisHelper');

/**
 * Get Detailed Sales Report
 */
exports.getDetailedSalesReport = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period, page, limit } = req.query; // Removed shopId form query, typically used for full company view
        const { start, end } = require('../utils/dateUtils').getDateRange(startDate, endDate, period);

        // Cache Key: REPORT:SALES:{companyId}:{shopId}:{start}:{end}:{page}:{limit}
        const cacheKey = `REPORT:SALES:${companyId}:ALL:${start}:${end}:${page || 1}:${limit || 100}`;
        const cached = await getCache(cacheKey);
        if (cached) return res.json(cached);

        const report = await SalesReportService.getDetailedSalesReport(companyId, null, start, end, page, limit);

        // Set Cache (5 mins)
        await setCache(cacheKey, report, 300);
        res.json(report);
    } catch (error) {
        console.error('Error getting sales report:', error);
        res.status(500).json({ error: 'Failed to generate sales report' });
    }
};

/**
 * Get Shop Specific Detailed Sales Report
 */
exports.getShopDetailedSalesReport = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period, page, limit } = req.query;

        if (!companyId) return res.status(400).json({ error: "companyId is required" });

        const { start, end } = require('../utils/dateUtils').getDateRange(startDate, endDate, period);

        const cacheKey = `REPORT:SALES:${companyId}:${shopId}:${start}:${end}:${page || 1}:${limit || 100}`;
        const cached = await getCache(cacheKey);
        if (cached) return res.json(cached);

        const report = await SalesReportService.getDetailedSalesReport(companyId, shopId, start, end, page, limit);

        await setCache(cacheKey, report, 300);
        res.json(report);
    } catch (error) {
        console.error('Error getting shop sales report:', error);
        res.status(500).json({ error: 'Failed to generate shop sales report' });
    }
};

/**
 * Export Sales Report (Async via Document/Notification Service)
 */
exports.exportSales = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { shopId, startDate, endDate, period, format = 'pdf' } = req.query;
        const { start, end } = require('../utils/dateUtils').getDateRange(startDate, endDate, period);

        // Fetch ALL data (high limit for export)
        const limit = 5000;
        const report = await SalesReportService.getDetailedSalesReport(companyId, shopId, start, end, 1, limit);
        const data = report.transactions || [];

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
            title: 'Sales Report',
            subtitle: `Period: ${start} to ${end}`,
            requester: req.user ? req.user.email : 'system',
            companyData: {
                ...companyData,
                shopName: shopData?.name
            }
        };

        if (format === 'excel') {
            exportPayload.columns = [
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Invoice No', key: 'invoiceNo', width: 20 },
                { header: 'Customer', key: 'customerName', width: 20 },
                { header: 'Items', key: 'items', width: 30 },
                { header: 'Amount', key: 'totalAmount', width: 15 },
                { header: 'Paid', key: 'amountPaid', width: 15 },
                { header: 'Balance', key: 'balance', width: 15 },
                { header: 'Status', key: 'status', width: 15 }
            ];

            exportPayload.rows = data.map(tx => ({
                date: moment(tx.date).format('YYYY-MM-DD'),
                invoiceNo: tx.invoiceNo,
                customerName: tx.customer?.name || 'Unknown',
                items: (tx.items || []).map(i => `${i.productName} (${i.qtySold})`).join(', '),
                totalAmount: tx.totalAmount,
                amountPaid: tx.debt?.amountPaid || 0,
                balance: tx.debt?.balance || 0,
                status: tx.debt?.status || 'Paid'
            }));
        } else {
            // PDF
            exportPayload.pdfHeaders = ['Date', 'Invoice', 'Customer', 'Amount', 'Status'];
            exportPayload.rows = data.map(tx => [
                moment(tx.date).format('YYYY-MM-DD'),
                tx.invoiceNo,
                tx.customer?.name || 'Unknown',
                (tx.totalAmount || 0).toLocaleString(),
                tx.debt?.status || 'Paid'
            ]);
            exportPayload.summary = {
                'Total Sales': (report.summary?.totalSales || 0).toLocaleString(),
                'Total Paid': (report.summary?.totalPaid || 0).toLocaleString(),
                'Outstanding': (report.summary?.outstandingDebt || 0).toLocaleString()
            };
        }

        // Trigger Async Generation
        await ReportEventProducer.requestReportGeneration(exportPayload);

        res.status(202).json({
            message: 'Report generation started',
            status: 'Processing',
            details: 'You will be notified when the report is ready.'
        });

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to initiate report export' });
    }
};
