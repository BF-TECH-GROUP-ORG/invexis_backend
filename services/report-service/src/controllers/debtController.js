const DebtReportService = require('../services/DebtReportService');
const moment = require('moment');
const { getCache, setCache } = require('../utils/redisHelper');
const { getDateRange } = require('../utils/dateUtils');

exports.getDetailedDebtReport = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period, page, limit } = req.query;

        // Use standard date utility (defaults to current month if no params)
        const { start, end } = getDateRange(startDate, endDate, period);

        const cacheKey = `REPORT:DEBT:${companyId}:ALL:${start}:${end}:${page || 1}:${limit || 100}`;
        const cached = await getCache(cacheKey);
        if (cached) return res.json(cached);

        const report = await DebtReportService.getDetailedDebtReport(companyId, null, start, end, page, limit);

        await setCache(cacheKey, report, 300);
        res.json(report);
    } catch (error) {
        console.error('Error getting debt report:', error);
        res.status(500).json({ error: 'Failed to generate debt report' });
    }
};

exports.getShopDetailedDebtReport = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period, page, limit } = req.query;

        if (!companyId) return res.status(400).json({ error: "companyId is required" });

        const { start, end } = getDateRange(startDate, endDate, period);

        const cacheKey = `REPORT:DEBT:${companyId}:${shopId}:${start}:${end}:${page || 1}:${limit || 100}`;
        const cached = await getCache(cacheKey);
        if (cached) return res.json(cached);

        const report = await DebtReportService.getDetailedDebtReport(companyId, shopId, start, end, page, limit);

        await setCache(cacheKey, report, 300);
        res.json(report);
    } catch (error) {
        console.error('Error getting shop debt report:', error);
        res.status(500).json({ error: 'Failed to generate shop debt report' });
    }
};

/**
 * Export Shop Debt Report (Async via Document/Notification Service)
 */
exports.exportShopDebt = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period, format = 'pdf' } = req.query;

        if (!companyId) return res.status(400).json({ error: 'companyId is required' });

        const { start, end } = getDateRange(startDate, endDate, period);

        // Fetch ALL data (high limit)
        const limit = 5000;
        const report = await DebtReportService.getDetailedDebtReport(companyId, shopId, start, end, 1, limit);

        const internalServiceClient = require('../utils/internalServiceClient');
        const [companyData, shopData] = await Promise.all([
            internalServiceClient.getCompanyData(companyId),
            internalServiceClient.getShopData(shopId)
        ]);

        // Flatten invoices from the hierarchical groups
        let invoices = [];
        if (report.groups && report.groups.length > 0) {
            report.groups.forEach(group => {
                group.branches.forEach(branch => {
                    if (branch.invoices) {
                        // Attach shopName to each invoice for the flat export list
                        branch.invoices.forEach(inv => {
                            inv.shopName = branch.shopName;
                            invoices.push(inv);
                        });
                    }
                });
            });
        }

        const ReportEventProducer = require('../events/ReportEventProducer');

        let exportPayload = {
            companyId,
            shopId,
            format,
            title: 'Debt Report',
            subtitle: `Period: ${start} to ${end}`,
            requester: req.user ? req.user.email : 'system',
            companyData: {
                ...companyData,
                shopName: shopData?.name
            }
        };

        if (format === 'excel') {
            exportPayload.columns = [
                { header: 'Date', key: 'saleDate', width: 15 },
                { header: 'Invoice', key: 'invoiceNo', width: 15 },
                { header: 'Customer', key: 'customerName', width: 20 },
                { header: 'Total Debt', key: 'original', width: 15 },
                { header: 'Paid', key: 'paid', width: 15 },
                { header: 'Balance', key: 'balance', width: 15 },
                { header: 'Due Date', key: 'dueDate', width: 15 },
                { header: 'Status', key: 'status', width: 12 },
                { header: 'Age (Days)', key: 'age', width: 10 }
            ];

            exportPayload.rows = invoices.map(inv => ({
                saleDate: inv.tracking.saleDate,
                invoiceNo: inv.invoiceNo,
                customerName: inv.customer.name,
                original: inv.debt.original,
                paid: inv.debt.paid,
                balance: inv.debt.balance,
                dueDate: inv.payment.dueDate,
                status: inv.status.status,
                age: inv.status.age
            }));
        } else {
            // PDF
            exportPayload.pdfHeaders = ['Invoice', 'Customer', 'Balance', 'Due Date', 'Status'];
            exportPayload.rows = invoices.map(inv => [
                inv.invoiceNo,
                inv.customer.name,
                (inv.debt.balance || 0).toLocaleString(),
                inv.payment.dueDate,
                inv.status.status
            ]);
            exportPayload.summary = {
                'Total Outstanding': invoices.reduce((sum, i) => sum + i.debt.balance, 0).toLocaleString(),
                'Total Overdue': invoices.filter(i => i.status.status === 'Overdue').length
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
        res.status(500).json({ error: 'Failed to initiate debt report export' });
    }
};
