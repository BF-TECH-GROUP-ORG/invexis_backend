const Debt = require('../models/debt.model');
const inMemoryStore = require('../utils/inMemoryStore');

// Default thresholds (days before due date) and overdue thresholds (days after due date)
const DEFAULT_UPCOMING = [7, 3, 1];
const DEFAULT_OVERDUE = [1, 3, 7, 30];

function parseEnvList(env, fallback) {
    if (!env) return fallback;
    try {
        return env.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n) && n > 0);
    } catch (e) { return fallback; }
}

async function processReminders() {
    const upcomingDays = parseEnvList(process.env.REMINDER_DAYS_BEFORE, DEFAULT_UPCOMING);
    const overdueDays = parseEnvList(process.env.REMINDER_OVERDUE_DAYS, DEFAULT_OVERDUE);

    const now = new Date();
    try {
        // Upcoming reminders
        for (const days of upcomingDays) {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days + 1, 0, 0, 0);
            const debts = await Debt.find({ dueDate: { $gte: start, $lt: end }, status: { $ne: 'PAID' }, isDeleted: false }).limit(1000);
            for (const d of debts) {
                // Skip if a reminder for this days already sent
                const marker = `upcoming_${days}`;
                const already = (d.reminderHistory || []).some(r => r.type === marker);
                if (already) continue;

                // Build payload
                const payload = {
                    debtId: d._id,
                    companyId: d.companyId,
                    shopId: d.shopId,
                    hashedCustomerId: d.hashedCustomerId,
                    customer: {
                        name: d.customer?.name || null,
                        phone: d.customer?.phone || null
                    },
                    dueDate: d.dueDate,
                    daysUntilDue: days,
                    totalAmount: d.totalAmount,
                    balance: d.balance
                };

                // Always send a single unified reminder event (no consentRef / shareLevel distinction)
                const evType = `DEBT_REMINDER_UPCOMING_${days}`;
                try { inMemoryStore.enqueueEvent({ eventType: evType, payload }); } catch (e) { }
                try {
                    if (global && typeof global.rabbitmqPublish === 'function') {
                        await global.rabbitmqPublish(evType.toLowerCase().replace(/_/g, '.'), payload);
                    }
                } catch (e) { /* best-effort publish failed, outbox will handle */ }

                // Record reminder history
                d.reminderHistory = d.reminderHistory || [];
                d.reminderHistory.push({ type: marker, date: new Date(), meta: { via: 'cron' } });
                try { await d.save(); } catch (e) { console.warn('Failed to save reminderHistory', e && e.message ? e.message : e); }
            }
        }

        // Overdue reminders
        for (const days of overdueDays) {
            // Find debts where dueDate exists and days overdue equals threshold
            const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 0, 0, 0);
            const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0, 0);
            const debts = await Debt.find({ dueDate: { $gte: target, $lt: next }, dueDate: { $lt: now }, status: { $ne: 'PAID' }, isDeleted: false }).limit(1000);
            for (const d of debts) {
                const marker = `overdue_${days}`;
                const already = (d.reminderHistory || []).some(r => r.type === marker);
                if (already) continue;

                const payload = {
                    debtId: d._id,
                    companyId: d.companyId,
                    shopId: d.shopId,
                    hashedCustomerId: d.hashedCustomerId,
                    customer: {
                        name: d.customer?.name || null,
                        phone: d.customer?.phone || null
                    },
                    dueDate: d.dueDate,
                    overdueDays: days,
                    totalAmount: d.totalAmount,
                    balance: d.balance
                };

                const evType = `DEBT_REMINDER_OVERDUE_${days}`;
                try { inMemoryStore.enqueueEvent({ eventType: evType, payload }); } catch (e) { }
                try { if (global && typeof global.rabbitmqPublish === 'function') await global.rabbitmqPublish(evType.toLowerCase().replace(/_/g, '.'), payload); } catch (e) { }

                d.reminderHistory = d.reminderHistory || [];
                d.reminderHistory.push({ type: marker, date: new Date(), meta: { via: 'cron' } });
                try { await d.save(); } catch (e) { console.warn('Failed to save reminderHistory', e && e.message ? e.message : e); }
            }
        }

        // Final escalation: debts overdue > max overdueDays -> send final reminder if not sent
        const maxOverdue = Math.max(...overdueDays);
        const finalCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (maxOverdue + 1), 0, 0, 0);
        const finalDebts = await Debt.find({ dueDate: { $lt: finalCutoff }, status: { $ne: 'PAID' }, isDeleted: false }).limit(1000);
        for (const d of finalDebts) {
            const marker = `overdue_final`;
            const already = (d.reminderHistory || []).some(r => r.type === marker);
            if (already) continue;

            const payload = {
                debtId: d._id,
                companyId: d.companyId,
                shopId: d.shopId,
                hashedCustomerId: d.hashedCustomerId,
                customer: {
                    name: d.customer?.name || null,
                    phone: d.customer?.phone || null
                },
                dueDate: d.dueDate,
                overdueDays: Math.max(0, Math.floor((now - d.dueDate) / (1000 * 60 * 60 * 24))),
                totalAmount: d.totalAmount,
                balance: d.balance
            };

            // Final reminders should go to company and optionally customer if consent
            const evType = `DEBT_REMINDER_FINAL`;
            try { inMemoryStore.enqueueEvent({ eventType: evType, payload }); } catch (e) { }
            try { if (global && typeof global.rabbitmqPublish === 'function') await global.rabbitmqPublish(evType.toLowerCase().replace(/_/g, '.'), payload); } catch (e) { }

            d.reminderHistory = d.reminderHistory || [];
            d.reminderHistory.push({ type: marker, date: new Date(), meta: { via: 'cron' } });
            try { await d.save(); } catch (e) { console.warn('Failed to save reminderHistory', e && e.message ? e.message : e); }
        }

    } catch (err) {
        console.error('Reminder worker error', err && err.message ? err.message : err);
    }
}

function startDailyCron() {
    const cron = require('node-cron');
    // Run once a day at 00:10
    cron.schedule('10 0 * * *', async () => {
        try {
            await processReminders();
        } catch (e) { console.error('Daily reminders failed', e && e.message ? e.message : e); }
    }, { scheduled: true });
    console.log('Reminder cron scheduled: runs daily at 00:10');
}

module.exports = { processReminders, startDailyCron };
