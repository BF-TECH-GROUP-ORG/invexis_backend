const Queue = require('bull');
const ShopSchedule = require('../models/ShopSchedule');
const logger = require('../utils/logger');
const { dispatchBroadcastEvent } = require('./dispatcher');

const REDIS_CONFIG = {
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined
    }
};

class SchedulerService {
    constructor() {
        this.scheduleQueue = new Queue('shop-schedule-checks', REDIS_CONFIG);
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        logger.info('⏰ Initializing Scheduler Service...');

        // Process the check job
        this.scheduleQueue.process('check-schedules', this.checkSchedules.bind(this));

        // Add the repeatable job (runs every minute)
        // clean any old repeatable jobs first to avoid duplicates
        const repeatableJobs = await this.scheduleQueue.getRepeatableJobs();
        for (const job of repeatableJobs) {
            await this.scheduleQueue.removeRepeatableByKey(job.key);
        }

        await this.scheduleQueue.add('check-schedules', {}, {
            repeat: { cron: '* * * * *' } // Every minute
        });

        this.isInitialized = true;
        logger.info('✅ Scheduler Service initialized and running.');
    }

    async checkSchedules(job) {
        try {
            // Get all distinct timezones to minimize calculations
            const timezones = await ShopSchedule.distinct('timezone');
            const defaultTz = 'Africa/Kigali';
            if (!timezones.includes(defaultTz)) timezones.push(defaultTz);

            logger.debug(`⏰ Checking schedules for ${timezones.length} timezones...`);

            for (const tz of timezones) {
                await this.checkTimezone(tz);
            }

        } catch (error) {
            logger.error('❌ Error in checkSchedules:', error);
            throw error;
        }
    }

    async checkTimezone(timezone) {
        // Calculate target time (Now + 15 minutes) in the specific timezone
        const target = this.getTimeInTimezone(timezone, 15);

        // Find shops in this timezone matching the criteria
        const openingShops = await ShopSchedule.find({
            timezone: timezone,
            isActive: true,
            operatingHours: {
                $elemMatch: {
                    day_of_week: target.day,
                    open_time: target.time
                }
            }
        });

        const closingShops = await ShopSchedule.find({
            timezone: timezone,
            isActive: true,
            operatingHours: {
                $elemMatch: {
                    day_of_week: target.day,
                    close_time: target.time
                }
            }
        });

        if (openingShops.length > 0) {
            logger.info(`⏰ Found ${openingShops.length} shops opening at ${target.time} in ${timezone}`);
            for (const shop of openingShops) {
                await this.sendReminder(shop, 'shop.reminder.opening', target.time, 15);
            }
        }

        if (closingShops.length > 0) {
            logger.info(`⏰ Found ${closingShops.length} shops closing at ${target.time} in ${timezone}`);
            for (const shop of closingShops) {
                await this.sendReminder(shop, 'shop.reminder.closing', target.time, 15);
            }
        }
    }

    async sendReminder(shop, eventType, timeStr, minutes) {
        try {
            await dispatchBroadcastEvent({
                event: eventType,
                data: {
                    shopId: shop.shopId,
                    shopName: shop.shopName,
                    time: timeStr,
                    minutes: minutes
                },
                companyId: shop.companyId,
                templateName: eventType,
                channels: ['push', 'inApp'],
                scope: 'company',
                roles: ['worker', 'company_admin'] // Notify staff
            });
            logger.debug(`✅ Sent ${eventType} for shop ${shop.shopName} (${shop.shopId})`);
        } catch (error) {
            logger.error(`❌ Failed to send reminder for shop ${shop.shopId}:`, error.message);
        }
    }

    // Helper: Get time components for a timezone with offset
    getTimeInTimezone(timezone, offsetMinutes = 0) {
        const date = new Date(Date.now() + offsetMinutes * 60000);

        try {
            const options = {
                timeZone: timezone,
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                weekday: "short"
            };
            const formatter = new Intl.DateTimeFormat("en-US", options);
            const parts = formatter.formatToParts(date);

            const hour = parts.find(p => p.type === 'hour').value;
            const minute = parts.find(p => p.type === 'minute').value;
            const weekday = parts.find(p => p.type === 'weekday').value;

            const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };

            return {
                time: `${hour}:${minute}`,
                day: dayMap[weekday]
            };
        } catch (e) {
            logger.error(`Invalid timezone ${timezone}, falling back to UTC`);
            // Fallback logic if needed, or just throw
            const utcDate = new Date(Date.now() + offsetMinutes * 60000);
            return {
                time: utcDate.toISOString().substr(11, 5),
                day: utcDate.getUTCDay()
            };
        }
    }
}

module.exports = new SchedulerService();
