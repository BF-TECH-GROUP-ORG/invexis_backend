/**
 * Alert Cron Job Worker
 * Automatically triggers alert generation at scheduled intervals
 * Runs smart checks, summaries, and other autonomous alert generation
 */

const schedule = require('node-schedule');
const AlertTriggerService = require('../services/alertTriggerService');
const StockMonitoringService = require('../services/stockMonitoringService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

class AlertCronJobWorker {
    static instance = null;

    static getInstance() {
        if (!AlertCronJobWorker.instance) {
            AlertCronJobWorker.instance = new AlertCronJobWorker();
        }
        return AlertCronJobWorker.instance;
    }

    constructor() {
        this.jobs = {};
    }

    /**
     * Initialize all cron jobs
     * Should be called when the application starts
     */
    async initializeAllJobs() {
        try {
            logger.info('Initializing alert cron jobs...');

            // LOW STOCK MONITORING - runs every 30 minutes
            this.scheduleLowStockMonitoring();

            // BACKORDER MONITORING - runs every 1 hour
            this.scheduleBackorderMonitoring();

            // Daily smart checks - runs every day at 2 AM
            this.scheduleSmartChecks();

            // Daily summary - runs every day at 11 PM
            this.scheduleDailySummary();

            // Weekly summary - runs every Monday at 9 AM
            this.scheduleWeeklySummary();

            // Monthly summary - runs on the 1st of every month at 9 AM
            this.scheduleMonthlySummary();

            // Yearly summary anniversary check - runs every day at 10 AM
            this.scheduleYearlySummary();

            // Cleanup old alerts - runs every day at 3 AM
            this.scheduleCleanupOldAlerts();

            // PRODUCT EXPIRATION MONITORING - runs every day at 4 AM
            this.scheduleExpirationMonitoring();

            // STOCK REBALANCING ANALYSIS - runs every day at 5 AM
            this.scheduleStockRebalancing();

            logger.info('✅ All alert cron jobs initialized successfully');
        } catch (error) {
            logger.error(`Failed to initialize alert cron jobs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Monitor low stock every 30 minutes
     * Checks all products against their lowStockThreshold in ProductStock
     */
    scheduleLowStockMonitoring() {
        const jobName = 'lowStockMonitoring';

        // Cancel existing job if it exists
        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('*/30 * * * *', async () => {
            try {
                logger.info('🔍 Running low stock monitoring...');

                // Get all companies
                const companies = await this.getAllCompanies();
                let totalMonitored = 0;

                for (const company of companies) {
                    try {
                        // Monitor low stock for company level
                        const alerts = await StockMonitoringService.monitorLowStock(company._id.toString());
                        totalMonitored += alerts;

                        // Monitor for each shop in the company (if applicable)
                        const shops = company.shops || [];
                        for (const shop of shops) {
                            const shopAlerts = await StockMonitoringService.monitorLowStock(
                                company._id.toString(),
                                shop._id.toString()
                            );
                            totalMonitored += shopAlerts;
                        }
                    } catch (error) {
                        logger.error(`Error monitoring low stock for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Low stock monitoring completed. Processed: ${totalMonitored} alerts.`);
            } catch (error) {
                logger.error(`Failed to run low stock monitoring: ${error.message}`);
            }
        });

        logger.info('✓ Low stock monitoring job scheduled every 30 minutes');
    }

    /**
     * Monitor backorders every 1 hour
     * Checks for out-of-stock products with backorder enabled that have been restocked
     */
    scheduleBackorderMonitoring() {
        const jobName = 'backorderMonitoring';

        // Cancel existing job if it exists
        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 * * * *', async () => {
            try {
                logger.info('📦 Running backorder monitoring...');

                // Get all companies
                const companies = await this.getAllCompanies();
                let totalBackorders = 0;

                for (const company of companies) {
                    try {
                        // Monitor backorders for company level
                        const processed = await StockMonitoringService.monitorBackorders(company._id.toString());
                        totalBackorders += processed;

                        // Monitor backorders for each shop in the company (if applicable)
                        const shops = company.shops || [];
                        for (const shop of shops) {
                            const shopProcessed = await StockMonitoringService.monitorBackorders(
                                company._id.toString(),
                                shop._id.toString()
                            );
                            totalBackorders += shopProcessed;
                        }
                    } catch (error) {
                        logger.error(`Error monitoring backorders for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Backorder monitoring completed. Processed: ${totalBackorders} backorders.`);
            } catch (error) {
                logger.error(`Failed to run backorder monitoring: ${error.message}`);
            }
        });

        logger.info('✓ Backorder monitoring job scheduled hourly');
    }

    /**
     * Run smart checks every day at 2:00 AM
     * Detects high velocity, dead stock, and stock out predictions
     */
    scheduleSmartChecks() {
        const jobName = 'smartChecks';

        // Cancel existing job if it exists
        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 2 * * *', async () => {
            try {
                logger.info('🔄 Running scheduled smart checks...');

                // Get all companies
                const companies = await this.getAllCompanies();
                let totalAlertsGenerated = 0;

                for (const company of companies) {
                    try {
                        // Run smart checks for company level
                        const alerts = await AlertTriggerService.runSmartChecks(company._id.toString());
                        totalAlertsGenerated += alerts.length;

                        // Run smart checks for each shop in the company (if applicable)
                        const shops = company.shops || [];
                        for (const shop of shops) {
                            const shopAlerts = await AlertTriggerService.runSmartChecks(
                                company._id.toString(),
                                shop._id.toString()
                            );
                            totalAlertsGenerated += shopAlerts.length;
                        }
                    } catch (error) {
                        logger.error(`Error running smart checks for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Smart checks completed. Generated ${totalAlertsGenerated} alerts.`);
            } catch (error) {
                logger.error(`Failed to run scheduled smart checks: ${error.message}`);
            }
        });

        logger.info('✓ Smart checks job scheduled for 2:00 AM daily');
    }

    /**
     * Run daily summary at 11:00 PM every day
     */
    scheduleDailySummary() {
        const jobName = 'dailySummary';

        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 23 * * *', async () => {
            try {
                logger.info('📊 Running daily summary generation...');

                const companies = await this.getAllCompanies();
                let summariesGenerated = 0;

                for (const company of companies) {
                    try {
                        // Generate daily summary for company level
                        await AlertTriggerService.generateDailySummary(company._id.toString());
                        summariesGenerated++;

                        // Generate for each shop
                        const shops = company.shops || [];
                        for (const shop of shops) {
                            await AlertTriggerService.generateDailySummary(
                                company._id.toString(),
                                shop._id.toString()
                            );
                            summariesGenerated++;
                        }
                    } catch (error) {
                        logger.error(`Error generating daily summary for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Daily summaries completed. Generated ${summariesGenerated} summaries.`);
            } catch (error) {
                logger.error(`Failed to run daily summary: ${error.message}`);
            }
        });

        logger.info('✓ Daily summary job scheduled for 11:00 PM');
    }

    /**
     * Run weekly summary every Monday at 9:00 AM
     */
    scheduleWeeklySummary() {
        const jobName = 'weeklySummary';

        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 9 * * 1', async () => {
            try {
                logger.info('📈 Running weekly summary generation...');

                const companies = await this.getAllCompanies();
                let summariesGenerated = 0;

                for (const company of companies) {
                    try {
                        // Generate weekly summary for company level
                        await AlertTriggerService.generateWeeklySummary(company._id.toString());
                        summariesGenerated++;

                        // Generate for each shop
                        const shops = company.shops || [];
                        for (const shop of shops) {
                            await AlertTriggerService.generateWeeklySummary(
                                company._id.toString(),
                                shop._id.toString()
                            );
                            summariesGenerated++;
                        }
                    } catch (error) {
                        logger.error(`Error generating weekly summary for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Weekly summaries completed. Generated ${summariesGenerated} summaries.`);
            } catch (error) {
                logger.error(`Failed to run weekly summary: ${error.message}`);
            }
        });

        logger.info('✓ Weekly summary job scheduled for Monday 9:00 AM');
    }

    /**
     * Run monthly summary on the 1st of each month at 9:00 AM
     */
    scheduleMonthlySummary() {
        const jobName = 'monthlySummary';

        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 9 1 * *', async () => {
            try {
                logger.info('📅 Running monthly summary generation...');

                const companies = await this.getAllCompanies();
                let summariesGenerated = 0;

                for (const company of companies) {
                    try {
                        // Generate monthly summary for company level
                        await AlertTriggerService.generateMonthlySummary(company._id.toString());
                        summariesGenerated++;

                        // Generate for each shop
                        const shops = company.shops || [];
                        for (const shop of shops) {
                            await AlertTriggerService.generateMonthlySummary(
                                company._id.toString(),
                                shop._id.toString()
                            );
                            summariesGenerated++;
                        }
                    } catch (error) {
                        logger.error(`Error generating monthly summary for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Monthly summaries completed. Generated ${summariesGenerated} summaries.`);
            } catch (error) {
                logger.error(`Failed to run monthly summary: ${error.message}`);
            }
        });

        logger.info('✓ Monthly summary job scheduled for 1st of month at 9:00 AM');
    }

    /**
     * Run yearly summary on the anniversary of the company registration
     * Runs every day at 10:00 AM to check for anniversaries
     */
    scheduleYearlySummary() {
        const jobName = 'yearlySummary';

        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 10 * * *', async () => {
            try {
                logger.info('🎆 Checking for yearly anniversaries...');

                const companies = await this.getAllCompanies();
                const today = new Date();
                let anniversariesFound = 0;

                for (const company of companies) {
                    try {
                        // Assumption: Company has createdAt. If not, anniversary check is skipped.
                        if (!company.createdAt) continue;

                        const createdAt = new Date(company.createdAt);
                        const isAnniversary = today.getMonth() === createdAt.getMonth() &&
                            today.getDate() === createdAt.getDate() &&
                            today.getFullYear() > createdAt.getFullYear();

                        if (isAnniversary) {
                            await AlertTriggerService.generateYearlySummary(company._id.toString());
                            anniversariesFound++;
                        }
                    } catch (error) {
                        logger.error(`Error checking yearly anniversary for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Yearly anniversary check completed. Found ${anniversariesFound} anniversaries.`);
            } catch (error) {
                logger.error(`Failed to run yearly summary check: ${error.message}`);
            }
        });

        logger.info('✓ Yearly summary anniversary check scheduled daily at 10:00 AM');
    }

    /**
     * Cleanup old, resolved alerts every day at 3:00 AM
     * Keeps the system clean and removes alerts older than 90 days
     */
    scheduleCleanupOldAlerts() {
        const jobName = 'cleanupAlerts';

        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 3 * * *', async () => {
            try {
                logger.info('🧹 Running alert cleanup...');

                const Alert = require('../models/Alert');
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

                const result = await Alert.deleteMany({
                    isResolved: true,
                    createdAt: { $lt: ninetyDaysAgo }
                });

                logger.info(`✅ Alert cleanup completed. Deleted ${result.deletedCount} old alerts.`);
            } catch (error) {
                logger.error(`Failed to cleanup old alerts: ${error.message}`);
            }
        });

        logger.info('✓ Alert cleanup job scheduled for 3:00 AM daily');
    }

    /**
     * Monitor product expirations every day at 4:00 AM
     */
    scheduleExpirationMonitoring() {
        const jobName = 'expirationMonitoring';

        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 4 * * *', async () => {
            try {
                logger.info('⏳ Running product expiration monitoring...');

                const companies = await this.getAllCompanies();
                let totalAlerts = 0;

                for (const company of companies) {
                    try {
                        // Monitor for company level
                        const alerts = await AlertTriggerService.checkProductExpirations(company._id.toString());
                        totalAlerts += (alerts || []).length;

                        // Monitor for each shop
                        const shops = company.shops || [];
                        for (const shop of shops) {
                            const shopAlerts = await AlertTriggerService.checkProductExpirations(
                                company._id.toString(),
                                shop._id.toString()
                            );
                            totalAlerts += (shopAlerts || []).length;
                        }
                    } catch (error) {
                        logger.error(`Error monitoring expirations for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Product expiration monitoring completed. Generated ${totalAlerts} alerts.`);
            } catch (error) {
                logger.error(`Failed to run product expiration monitoring: ${error.message}`);
            }
        });

        logger.info('✓ Product expiration monitoring job scheduled daily at 4:00 AM');
    }

    /**
     * Monitor stock rebalancing opportunities every day at 5:00 AM
     */
    scheduleStockRebalancing() {
        const jobName = 'stockRebalancing';

        if (this.jobs[jobName]) {
            this.jobs[jobName].cancel();
        }

        this.jobs[jobName] = schedule.scheduleJob('0 5 * * *', async () => {
            try {
                logger.info('⚖️ Running stock rebalancing analysis...');

                const companies = await this.getAllCompanies();
                let totalSuggestions = 0;

                for (const company of companies) {
                    try {
                        const alerts = await AlertTriggerService.checkStockRebalancing(company._id.toString());
                        totalSuggestions += (alerts || []).length;
                    } catch (error) {
                        logger.error(`Error analyzing rebalancing for company ${company._id}: ${error.message}`);
                    }
                }

                logger.info(`✅ Stock rebalancing analysis completed. Generated ${totalSuggestions} suggestions.`);
            } catch (error) {
                logger.error(`Failed to run stock rebalancing: ${error.message}`);
            }
        });

        logger.info('✓ Stock rebalancing analysis job scheduled daily at 5:00 AM');
    }

    /**
     * Schedule custom alert check for a specific company
     * Allows on-demand execution
     */
    async runSmartChecksForCompany(companyId, shopId = null) {
        try {
            logger.info(`Running on-demand smart checks for company: ${companyId}`);
            const alerts = await AlertTriggerService.runSmartChecks(companyId, shopId);
            return alerts;
        } catch (error) {
            logger.error(`Failed to run smart checks for company ${companyId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Schedule custom daily summary for a specific company
     */
    async generateDailySummaryForCompany(companyId, shopId = null) {
        try {
            logger.info(`Generating on-demand daily summary for company: ${companyId}`);
            const alert = await AlertTriggerService.generateDailySummary(companyId, shopId);
            return alert;
        } catch (error) {
            logger.error(`Failed to generate daily summary for company ${companyId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all companies and shops that have products in the system
     * Uses Product.distinct to efficiently find active entities
     */
    async getAllCompanies() {
        try {
            const Product = require('../models/Product');
            const companyIds = await Product.distinct('companyId', { isDeleted: false });

            const companies = [];
            for (const companyId of companyIds) {
                const shopIds = await Product.distinct('shopId', { companyId, isDeleted: false });
                companies.push({
                    _id: companyId,
                    shops: shopIds.map(id => ({ _id: id }))
                });
            }
            return companies;
        } catch (error) {
            logger.error(`Failed to retrieve companies from products: ${error.message}`);
            return [];
        }
    }

    /**
     * Stop all cron jobs (useful for graceful shutdown)
     */
    stopAllJobs() {
        try {
            Object.keys(this.jobs).forEach(jobName => {
                this.jobs[jobName].cancel();
                logger.info(`Cancelled cron job: ${jobName}`);
            });
            logger.info('✅ All alert cron jobs stopped');
        } catch (error) {
            logger.error(`Failed to stop cron jobs: ${error.message}`);
        }
    }

    /**
     * Get status of all scheduled jobs
     */
    getJobStatus() {
        const status = {};
        Object.keys(this.jobs).forEach(jobName => {
            status[jobName] = {
                isScheduled: !!this.jobs[jobName],
                nextInvocation: this.jobs[jobName]?.nextInvocation()
            };
        });
        return status;
    }
}

module.exports = AlertCronJobWorker;
