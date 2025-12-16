<<<<<<< HEAD
const debtRepo = require('../repositories/debtRepository');
const eventRepo = require('../repositories/eventRepository');

let running = false;

const perf = require('../utils/perf');

async function checkOverdues() {
    return perf.measureAsync('overdue.checkOverdues', async () => {
        const now = new Date();
        const Debt = require('../models/debt.model');
        const debts = await debtRepo.findOverdueUnpaid(now, 200);
        
        // Batch create events for all overdue debts
        const events = [];
        const updates = [];
        
        for (const d of debts) {
            const overdueDays = Math.max(0, Math.floor((now - d.dueDate) / (1000 * 60 * 60 * 24)));
                if (d.overdueDays !== overdueDays) {
                    updates.push({ id: d._id, overdueDays });
                    events.push({
                        eventType: 'DEBT_OVERDUE',
                        payload: {
                            debtId: d._id,
                            companyId: d.companyId,
                            shopId: d.shopId,
                            hashedCustomerId: d.hashedCustomerId,
                            customer: {
                                name: d.customer?.name || null,
                                phone: d.customer?.phone || null
                            },
                            overdueDays,
                            totalAmount: d.totalAmount,
                            balance: d.balance,
                            dueDate: d.dueDate
                        }
                    });
            }
        }
        
        // Batch update overdue days
        if (updates.length > 0) {
            try {
                await Promise.all(updates.map(u => 
                    Debt.updateOne({ _id: u.id }, { overdueDays: u.overdueDays })
                ));
            } catch (e) { console.warn('Batch overdue update failed', e.message); }
        }
        
        // Batch create events
        if (events.length > 0) {
            try {
                await Promise.all(events.map(e => eventRepo.createEvent(e)));
            } catch (e) { console.warn('Batch event creation failed', e.message); }
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
=======
const debtRepo = require('../repositories/debtRepository');
const eventRepo = require('../repositories/eventRepository');

let running = false;

const perf = require('../utils/perf');

async function checkOverdues() {
    return perf.measureAsync('overdue.checkOverdues', async () => {
        const now = new Date();
        const Debt = require('../models/debt.model');
        const debts = await debtRepo.findOverdueUnpaid(now, 200);
        
        // Batch create events for all overdue debts
        const events = [];
        const updates = [];
        
        for (const d of debts) {
            const overdueDays = Math.max(0, Math.floor((now - d.dueDate) / (1000 * 60 * 60 * 24)));
            if (d.overdueDays !== overdueDays) {
                updates.push({ id: d._id, overdueDays });
                events.push({ eventType: 'DEBT_OVERDUE', payload: { debtId: d._id, companyId: d.companyId, shopId: d.shopId, customerId: d.customerId, overdueDays } });
            }
        }
        
        // Batch update overdue days
        if (updates.length > 0) {
            try {
                await Promise.all(updates.map(u => 
                    Debt.updateOne({ _id: u.id }, { overdueDays: u.overdueDays })
                ));
            } catch (e) { console.warn('Batch overdue update failed', e.message); }
        }
        
        // Batch create events
        if (events.length > 0) {
            try {
                await Promise.all(events.map(e => eventRepo.createEvent(e)));
            } catch (e) { console.warn('Batch event creation failed', e.message); }
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
>>>>>>> 55eb3af5e260dabebd54e7923b37bc5096e6e6ae
