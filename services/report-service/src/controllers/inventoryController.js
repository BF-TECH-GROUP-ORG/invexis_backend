const InventoryReportService = require('../services/InventoryReportService');
const moment = require('moment');
const { getDateRange } = require('../utils/dateUtils');

/**
 * Get Company Level Inventory Report
 * Aggregated by Shop
 */
exports.getCompanyInventoryReport = async (req, res) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate, period } = req.query;

        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await InventoryReportService.getCompanyInventoryReport(companyId, start, end);
        res.json(report);
    } catch (error) {
        console.error('Error getting company inventory report:', error);
        res.status(500).json({ error: 'Failed to generate inventory report' });
    }
};

/**
 * Get Shop Level Inventory Report
 * Detailed Product List with Movement & Tracking
 */
exports.getShopInventoryReport = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period } = req.query;

        if (!companyId) {
            return res.status(400).json({ error: 'companyId is required' });
        }

        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await InventoryReportService.getShopInventoryReport(companyId, shopId, start, end);
        res.json(report);
    } catch (error) {
        console.error('Error getting shop inventory report:', error);
        res.status(500).json({ error: 'Failed to generate shop inventory report' });
    }
};

/**
 * Export Shop Inventory (Async via Document/Notification Service)
 */
exports.exportShopInventory = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { companyId, startDate, endDate, period, format = 'pdf' } = req.query;

        if (!companyId) return res.status(400).json({ error: 'companyId is required' });

        const { start, end } = getDateRange(startDate, endDate, period);

        const report = await InventoryReportService.getShopInventoryReport(companyId, shopId, start, end);
        const data = report.products || [];

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
            title: 'Inventory Report',
            subtitle: `Period: ${start} to ${end}`,
            requester: req.user ? req.user.email : 'system',
            companyData: {
                ...companyData,
                shopName: shopData?.name
            }
        };

        if (format === 'excel') {
            exportPayload.columns = [
                { header: 'Product', key: 'productName', width: 25 },
                { header: 'Category', key: 'category', width: 15 },
                { header: 'Open', key: 'open', width: 10 },
                { header: 'In', key: 'in', width: 10 },
                { header: 'Out', key: 'out', width: 10 },
                { header: 'Close', key: 'close', width: 10 },
                { header: 'Unit Cost', key: 'unitCost', width: 12 },
                { header: 'Value', key: 'totalValue', width: 15 },
                { header: 'Status', key: 'status', width: 12 }
            ];

            exportPayload.rows = data.map(p => ({
                productName: p.productName,
                category: p.category,
                open: p.movement.open,
                in: p.movement.in,
                out: p.movement.out,
                close: p.movement.close,
                unitCost: p.value.unitCost,
                totalValue: p.value.totalValue,
                status: p.status.status
            }));
        } else {
            // PDF
            exportPayload.pdfHeaders = ['Product', 'In', 'Out', 'Stock', 'Value', 'Status'];
            exportPayload.rows = data.map(p => [
                p.productName,
                p.movement.in,
                p.movement.out,
                p.movement.close,
                (p.value.totalValue || 0).toLocaleString(),
                p.status.status
            ]);
            exportPayload.summary = {
                'Total Items': data.length,
                'Total Value': data.reduce((sum, p) => sum + p.value.totalValue, 0).toLocaleString()
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
        res.status(500).json({ error: 'Failed to initiate inventory report export' });
    }
};
