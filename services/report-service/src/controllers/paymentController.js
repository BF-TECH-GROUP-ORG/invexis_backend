const PaymentReportService = require('../services/PaymentReportService');
const moment = require('moment');
const { getCache, setCache } = require('../utils/redisHelper');
const { getDateRange } = require('../utils/dateUtils');

exports.getDetailedPaymentReport = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period, page, limit } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const cacheKey = `REPORT:PAYMENT:${companyId}:ALL:${start}:${end}:${page || 1}:${limit || 100}`;
        const cached = await getCache(cacheKey);
        if (cached) return res.json(cached);

        const report = await PaymentReportService.getDetailedPaymentReport(companyId, null, start, end, page, limit);

        await setCache(cacheKey, report, 300);
        res.json(report);
    } catch (error) {
        console.error('Error getting payment report:', error);
        res.status(500).json({ error: 'Failed to generate payment report' });
    }
};

exports.getShopDetailedPaymentReport = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period, page, limit } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const cacheKey = `REPORT:PAYMENT:${companyId}:${shopId}:${start}:${end}:${page || 1}:${limit || 100}`;
        const cached = await getCache(cacheKey);
        if (cached) return res.json(cached);

        const report = await PaymentReportService.getDetailedPaymentReport(companyId, shopId, start, end, page, limit);

        await setCache(cacheKey, report, 300);
        res.json(report);
    } catch (error) {
        console.error('Error getting shop payment report:', error);
        res.status(500).json({ error: 'Failed to generate shop payment report' });
    }
};

exports.exportShopPayments = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period, format = 'pdf' } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        // Fetch Data
        const report = await PaymentReportService.getDetailedPaymentReport(companyId, shopId, start, end, 1, 1000);

        const internalServiceClient = require('../utils/internalServiceClient');
        const [companyData, shopData] = await Promise.all([
            internalServiceClient.getCompanyData(companyId),
            internalServiceClient.getShopData(shopId)
        ]);

        // Flatten payments from the hierarchical groups
        const rows = [];
        if (report.groups && report.groups.length > 0) {
            report.groups.forEach(group => {
                group.branches.forEach(branch => {
                    if (branch.payments) {
                        branch.payments.forEach(pay => {
                            rows.push([
                                pay.date,
                                pay.invoiceNo,
                                pay.customer.name,
                                pay.payment.method,
                                pay.payment.amount,
                                pay.reference.type,
                                pay.receivedBy
                            ]);
                        });
                    }
                });
            });
        }

        const columns = ['Date', 'Invoice #', 'Customer', 'Method', 'Amount', 'Ref Type', 'Staff'];

        // Request generation
        const ReportEventProducer = require('../events/ReportEventProducer');
        const reportId = `report_payment_${shopId}_${Date.now()}`;

        await ReportEventProducer.requestReport({
            reportId,
            title: `Payment Log - ${shopId}`,
            subtitle: `From ${start} to ${end}`,
            headers: columns,
            rows: rows,
            format: format === 'excel' ? 'excel' : 'pdf',
            period: { start, end },
            companyData: {
                ...companyData,
                shopName: shopData?.name
            },
            context: {
                requester: req.user?.id || 'system',
                shopId,
                companyId
            }
        }, { companyId, shopId, level: 'shop' });

        res.json({ message: 'Payment report generation started', reportId });
    } catch (error) {
        console.error('Error exporting payment report:', error);
        res.status(500).json({ error: 'Failed to start payment report export' });
    }
};
