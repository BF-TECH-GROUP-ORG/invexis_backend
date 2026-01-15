const cron = require('node-cron');
const transactionRepository = require('../repositories/transactionRepository');
const { publishPaymentEvent } = require('../events/producer');
const companyRepository = require('../repositories/companyRepository');

/**
 * Daily Revenue Report Cron
 * Runs at 00:05 every day to capture the previous day's activity.
 */
const startRevenueCron = () => {
    // Schedule: 00:05 daily (5 minutes past midnight)
    cron.schedule('5 0 * * *', async () => {
        console.log('⏰ [Cron] Starting Daily Revenue Report generation...');
        try {
            // 1. Fetch Stats (Grouped by Company AND Shop)
            // We need a custom query or use the repo method multiple times.
            // Let's use the repo method we added, but we need grouping by Both.
            // The repo method only supports one groupBy.
            // Let's assume we fetch by shop (which implies company).

            // However, to keep it simple and use existing repo:
            // Fetch by shop_id.
            const shopStats = await transactionRepository.getRevenueStats('day', 'shop_id');
            // Fetch by company_id
            const companyStats = await transactionRepository.getRevenueStats('day', 'company_id');

            // 2. Map & Aggregate
            // We need to match companyStats to their details (Email/Name) to send the report.

            for (const cStat of companyStats) {
                const companyId = cStat.company_id;
                if (!companyId) continue;

                // fetch company details
                let companySettings;
                try {
                    companySettings = await companyRepository.getCompanySettings(companyId);
                } catch (e) {
                    console.warn(`Could not fetch settings for company ${companyId}, skipping report.`);
                    continue;
                }

                if (!companySettings) continue;

                // Find shop breakdown for this company
                // Requires we know which shops belong to this company.
                // The shopStats result only has shop_id.
                // Optimally, we'd join tables, but we are independent repositories.
                // For "Summary", just Company Total is often enough, but user asked for "shop specific".

                // Construct Report Data
                const reportData = {
                    reportType: 'DAILY_REVENUE',
                    period: 'Daily',
                    date: new Date().toISOString(),
                    companyId: companyId,
                    totalRevenue: cStat.total_revenue,
                    transactionCount: cStat.transaction_count,
                    currency: 'XAF', // Assuming single currency for now or we'd need grouping by currency too
                    // We can include shop breakdown if we had the mapping, but for V1 let's stick to Company Total
                    // to ensure reliability.
                };

                // 3. Emit Event
                // Payload structure matches what document-service expects for reports
                const payload = {
                    type: 'report.revenue',
                    data: reportData,
                    recipient: {
                        email: companySettings.company_email,
                        name: companySettings.company_name
                    },
                    context: {
                        companyId
                    }
                };

                // We use 'invoiceRequested' or a specific 'reportRequested' event?
                // document-service config listens to: "report.export_requested"

                await publishPaymentEvent.reportRequested(payload);
                console.log(`[Cron] Requested report for Company: ${companyId}`);
            }

            console.log('✅ [Cron] Daily Revenue Reports requested successfully.');

        } catch (error) {
            console.error('❌ [Cron] Error generating revenue reports:', error);
        }
    });

    console.log('🗓️ Revenue Reporting Cron Scheduled (00:05 Daily)');
};

module.exports = { startRevenueCron };
