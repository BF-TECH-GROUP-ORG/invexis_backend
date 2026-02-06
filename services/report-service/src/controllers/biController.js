const BusinessIntelligenceService = require('../services/BusinessIntelligenceService');
const moment = require('moment');

exports.getBusinessPerformance = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { shopId, period, date } = req.query; // period: Monthly, Yearly, Weekly

        const report = await BusinessIntelligenceService.getPerformanceOverview(companyId, shopId, period, date);
        res.json(report);
    } catch (error) {
        console.error('Error getting business performance:', error);
        res.status(500).json({ error: 'Failed to generate business performance report' });
    }
};

exports.exportPerformanceOverview = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { shopId, period, date, format = 'pdf' } = req.query;

        const report = await BusinessIntelligenceService.getPerformanceOverview(companyId, shopId, period, date);

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
            title: 'Business Intelligence Overview',
            subtitle: `${period} Performance as of ${report.selectedDate}`,
            requester: req.user ? req.user.email : 'system',
            companyData: {
                ...companyData,
                shopName: shopData?.name
            },
            pdfHeaders: ['Date', 'Inventory Value', 'Net Sales', 'New Debts', 'Payments'],
            rows: report.chartData.map(d => [
                d.label,
                d.inventoryValue.toLocaleString(),
                d.netSales.toLocaleString(),
                d.outstandingDebts.toLocaleString(),
                d.paymentsReceived.toLocaleString()
            ]),
            summary: {
                'Total Revenue': report.totals.netSales.toLocaleString(),
                'Total Payments': report.totals.paymentsReceived.toLocaleString(),
                'Current Inventory': report.totals.inventoryValue.toLocaleString()
            }
        };

        await ReportEventProducer.requestReportGeneration(exportPayload);

        res.status(202).json({ message: 'BI report export started' });
    } catch (error) {
        console.error('BI export error:', error);
        res.status(500).json({ error: 'Failed to initiate BI export' });
    }
};
