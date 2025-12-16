const cron = require('node-cron');
const debtRepo = require('../repositories/debtRepository');
const eventRepo = require('../repositories/eventRepository');
const reminderWorker = require('../workers/reminderWorker');

// hourly overdue check
function startOverdueCron() {
    // run every hour at minute 5
    cron.schedule('5 * * * *', async () => {
        try {
            const now = new Date();
            const debts = await debtRepo.findOverdueUnpaid(now, 500);
            for (const d of debts) {
                const overdueDays = Math.max(0, Math.floor((now - d.dueDate) / (1000 * 60 * 60 * 24)));
                if (d.overdueDays !== overdueDays) {
                    d.overdueDays = overdueDays;
                    await d.save();
                    await eventRepo.createEvent({ eventType: 'DEBT_OVERDUE', payload: { debtId: d._id, companyId: d.companyId, shopId: d.shopId, customerId: d.customerId, overdueDays } });
                }
            }
        } catch (err) {
            console.error('Overdue cron error', err && err.message ? err.message : err);
        }
    }, { scheduled: true });
    console.log('Overdue cron scheduled: runs every hour at minute 5');
}

// monthly summary job - runs 1st day of month at 00:15
function startMonthlySummaryCron() {
    cron.schedule('15 0 1 * *', async () => {
        try {
            // we will compute per-company monthly totals (simple implementation)
            // For scale: this should be batched per company from a companies collection; here we will skip and rely on offline aggregation
            console.log('Monthly summary cron triggered - implement as needed');
        } catch (err) {
            console.error('Monthly summary cron error', err && err.message ? err.message : err);
        }
    }, { scheduled: true });
    console.log('Monthly summary cron scheduled: 1st day monthly');
}

function start() {
    startOverdueCron();
    startMonthlySummaryCron();
    // start reminder cron
    try { reminderWorker.startDailyCron(); } catch (e) { console.warn('Failed to start reminder cron', e && e.message ? e.message : e); }
}

module.exports = { start };
