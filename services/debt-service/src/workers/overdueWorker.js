const debtRepo = require('../repositories/debtRepository');
const eventRepo = require('../repositories/eventRepository');

let running = false;

const perf = require('../utils/perf');

async function checkOverdues() {
    return perf.measureAsync('overdue.checkOverdues', async () => {
        const now = new Date();
        // find debts which have dueDate in the past, not paid, and either overdueDays outdated or zero
        const debts = await debtRepo.findOverdueUnpaid(now, 200);
        for (const d of debts) {
            const overdueDays = Math.max(0, Math.floor((now - d.dueDate) / (1000 * 60 * 60 * 24)));
            if (d.overdueDays !== overdueDays) {
                d.overdueDays = overdueDays;
                await d.save();

                // create outbox event via repo
                await eventRepo.createEvent({ eventType: 'DEBT_OVERDUE', payload: { debtId: d._id, companyId: d.companyId, shopId: d.shopId, customerId: d.customerId, overdueDays } });
            }
        }
    });
}

function start(intervalMs = 60 * 1000) {
    if (running) return;
    running = true;
    console.log('Overdue worker started');
    setInterval(async () => {
        try { await checkOverdues(); } catch (err) { console.error('Overdue worker error', err); }
    }, intervalMs);
}

module.exports = { start };
