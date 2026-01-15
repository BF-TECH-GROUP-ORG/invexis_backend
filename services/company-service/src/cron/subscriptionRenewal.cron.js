const cron = require('node-cron');
const SubscriptionService = require('../services/subscription.service');
const logger = require('../utils/logger');

/**
 * Auto-Renewal Cron Job
 * Runs daily at midnight to check for subscriptions due for renewal
 */
class SubscriptionRenewalCron {
    constructor() {
        this.isRunning = false;
    }

    /**
     * Start the cron job
     */
    start() {
        // Run every day at 00:00 (Midnight)
        cron.schedule('0 0 * * *', async () => {
            await this.processRenewals();
        });

        console.log('✅ [Cron] Subscription auto-renewal job scheduled (daily at 00:00)');
    }

    /**
     * Process all subscriptions due for renewal
     */
    async processRenewals() {
        if (this.isRunning) {
            console.log('⚠️ [Cron] Renewal process already running, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('🔄 [Cron] Starting subscription auto-renewal check...');

        try {
            // Use the consolidated service logic
            await SubscriptionService.processDueRenewals();
            console.log('✅ [Cron] Auto-renewal process completed');
        } catch (error) {
            console.error('❌ [Cron] Error in auto-renewal process:', error);
        } finally {
            this.isRunning = false;
        }
    }
}

module.exports = new SubscriptionRenewalCron();
