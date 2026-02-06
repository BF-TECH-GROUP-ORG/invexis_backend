const cron = require('node-cron');
const moment = require('moment');
const internalServiceClient = require('../utils/internalServiceClient');
const SalesReportService = require('../services/SalesReportService');
const DebtReportService = require('../services/DebtReportService');
const PaymentReportService = require('../services/PaymentReportService');
const PerformanceHubService = require('../services/PerformanceHubService');
const ReportEventProducer = require('../events/ReportEventProducer');

/**
 * Scheduled Report Worker
 * Automatically triggers hierarchical reports for all companies/shops
 */
class ScheduledReportWorker {
    constructor() {
        this.batchSize = 5; // Processes 5 reports at a time to avoid saturation
    }

    /**
     * Start the scheduled jobs
     */
    start() {
        // 1. Weekly Schedule: Run every Monday at 00:01
        // '1 0 * * 1'
        cron.schedule('1 0 * * 1', async () => {
            console.log('[ScheduledWorker] 🕒 Starting Weekly Reporting Cycle...');
            const start = moment().subtract(1, 'week').startOf('week').format('YYYY-MM-DD'); // Monday
            const end = moment().subtract(1, 'week').endOf('week').format('YYYY-MM-DD');   // Sunday
            await this.processCycle('Weekly', start, end);
        });

        // 2. Monthly Schedule: Run on the 1st of every month at 00:15
        // '15 0 1 * *'
        cron.schedule('15 0 1 * *', async () => {
            console.log('[ScheduledWorker] 🕒 Starting Monthly Reporting Cycle...');
            const start = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
            const end = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
            await this.processCycle('Monthly', start, end);
        });

        console.log('[ScheduledWorker] ✅ Cron jobs scheduled: Weekly (Mon 00:01) and Monthly (1st 00:15)');
    }

    /**
     * Process a full reporting cycle for all entities
     */
    async processCycle(type, start, end) {
        try {
            const companies = await internalServiceClient.getAllCompanies();
            console.log(`[ScheduledWorker] Found ${companies.length} companies for ${type} report.`);

            for (const company of companies) {
                console.log(`[ScheduledWorker] Processing company: ${company.name}`);

                // 1. Trigger Company-Level Reports
                await this.triggerCompanyReports(company, type, start, end);

                // 2. Trigger Shop-Level Reports
                const shops = await internalServiceClient.getCompanyShops(company.id);
                for (const shop of shops) {
                    await this.triggerShopReports(company, shop, type, start, end);
                    // Subtle delay to prevent event burst
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            console.log(`[ScheduledWorker] 🏁 ${type} Reporting Cycle completed.`);
        } catch (error) {
            console.error(`[ScheduledWorker] ❌ ${type} Cycle failed:`, error);
        }
    }

    async triggerCompanyReports(company, type, start, end) {
        const reports = [
            { name: 'Sales Performance', service: SalesReportService, method: 'getDetailedSalesReport' },
            { name: 'Debt & Aging', service: DebtReportService, method: 'getDetailedDebtReport' },
            { name: 'Payment Log', service: PaymentReportService, method: 'getDetailedPaymentReport' }
        ];

        for (const report of reports) {
            const data = await report.service[report.method](company.id, null, start, end, 1, 5000);
            await this.emitReport(company, null, `${type} ${report.name}`, start, end, data);
        }
    }

    async triggerShopReports(company, shop, type, start, end) {
        // High-fidelity performance at shop level
        const performanceData = await PerformanceHubService.getBranchPerformance(company.id, shop.id, start, end);
        await this.emitReport(company, shop, `${type} Branch Performance`, start, end, performanceData, 'Branch Performance');
    }

    async emitReport(company, shop, title, start, end, reportData, customTitle) {
        // Format for Document Service
        const payload = {
            companyId: company.id,
            shopId: shop?.id || null,
            format: 'pdf',
            title: customTitle || title,
            subtitle: `Period: ${start} to ${end}`,
            requester: 'Scheduled System',
            companyData: {
                name: company.name,
                email: company.email,
                shopName: shop?.name || 'All Branches'
            },
            // Mapping logic for flat rows (simplified for worker)
            rows: this.flattenDataForExport(reportData),
            pdfHeaders: this.getHeadersForReport(title)
        };

        await ReportEventProducer.requestReportGeneration(payload);
    }

    flattenDataForExport(data) {
        // Minimal flattening - Generator handles the rest
        // In a real app, this would be more granular based on report type
        if (data.groups) {
            let rows = [];
            data.groups.forEach(g => {
                g.branches.forEach(b => {
                    if (b.invoices) b.invoices.forEach(i => rows.push(Object.values(i)));
                    if (b.payments) b.payments.forEach(p => rows.push(Object.values(p)));
                });
            });
            return rows;
        }
        return Array.isArray(data) ? data.map(i => Object.values(i)) : [];
    }

    getHeadersForReport(title) {
        if (title.includes('Sales')) return ['Invoice', 'Customer', 'Total', 'Status'];
        if (title.includes('Debt')) return ['Invoice', 'Customer', 'Balance', 'Due Date', 'Status'];
        if (title.includes('Payment')) return ['Date', 'Invoice', 'Customer', 'Amount', 'Method'];
        return ['Name', 'Value', 'Status'];
    }
}

module.exports = new ScheduledReportWorker();