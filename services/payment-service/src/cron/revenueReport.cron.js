const cron = require('node-cron');
const transactionRepository = require('../repositories/transactionRepository');
const { publishPaymentEvent } = require('../events/producer');
const internalServiceClient = require('../services/internalServiceClient');
const { getLogger } = require('/app/shared/logger');

const logger = getLogger('revenue-report-cron');

/**
 * Daily Revenue Report Cron
 * Runs at 00:05 every day to capture the previous day's activity.
 */
const startRevenueCron = () => {
    // Schedule: 00:05 daily (5 minutes past midnight)
    cron.schedule('5 0 * * *', async () => {
        logger.info('⏰ [Cron] Starting Daily Revenue Report generation...');
        try {
            // 1. Fetch Stats (Grouped by Company)
            const companyStats = await transactionRepository.getRevenueStats('day', 'company_id');

            for (const cStat of companyStats) {
                const companyId = cStat.company_id;
                if (!companyId) continue;

                // 2. Fetch company details from company-service
                let companySettings;
                try {
                    companySettings = await internalServiceClient.getCompanySettings(companyId);
                } catch (e) {
                    logger.warn(`Could not fetch settings for company ${companyId}, skipping report.`, { error: e.message });
                    continue;
                }

                if (!companySettings) {
                    logger.warn(`Company settings not found for ${companyId}, skipping report.`);
                    continue;
                }

                // 3. Construct Report Data
                const reportData = {
                    reportType: 'DAILY_REVENUE',
                    period: 'Daily',
                    date: new Date().toISOString(),
                    companyId: companyId,
                    totalRevenue: cStat.total_revenue,
                    transactionCount: cStat.transaction_count,
                    currency: 'XAF', // Assuming single currency for now
                };

                // 4. Construct Payload for document-service
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

                // 5. Emit Event
                await publishPaymentEvent.reportRequested(payload);
                logger.info(`[Cron] Requested report for Company: ${companyId} (${companySettings.company_name})`);
            }

            logger.info('✅ [Cron] Daily Revenue Reports requested successfully.');

        } catch (error) {
            logger.error('❌ [Cron] Error generating revenue reports:', { error: error.message });
        }
    });

    logger.info('🗓️ Revenue Reporting Cron Scheduled (00:05 Daily)');
};

module.exports = { startRevenueCron };
