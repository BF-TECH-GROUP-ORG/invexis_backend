const Debt = require('../models/debt.model');
const inMemoryStore = require('../utils/inMemoryStore');

// Helper to attempt immediate publish and enqueue outbox
async function emitReminderEvent(eventType, payload) {
    try { inMemoryStore.enqueueEvent({ eventType, payload }); } catch (e) { /* swallow */ }
    try {
        if (global && typeof global.rabbitmqPublish === 'function') {
            await global.rabbitmqPublish(eventType.toLowerCase().replace(/_/g, '.'), payload);
        }
    } catch (e) { /* best-effort publish failed, outbox will handle */ }
}

async function triggerDebtReminder(req, res) {
    try {
        const debtId = req.params.debtId;
        const companyId = req.body.companyId || req.headers['x-company-id'];
        if (!debtId) return res.status(400).json({ error: 'debtId required' });
        if (!companyId) return res.status(400).json({ error: 'companyId required' });

        const debt = await Debt.findOne({ _id: debtId, companyId, isDeleted: false });
        if (!debt) return res.status(404).json({ error: 'Debt not found or access denied' });

        const payload = {
            debtId: debt._id,
            companyId: debt.companyId,
            shopId: debt.shopId,
            customerId: debt.customerId,
            dueDate: debt.dueDate,
            totalAmount: debt.totalAmount,
            balance: debt.balance
        };

        const eventType = `DEBT_REMINDER_MANUAL`;
        await emitReminderEvent(eventType, payload);

        // record manual trigger in reminderHistory
        debt.reminderHistory = debt.reminderHistory || [];
        debt.reminderHistory.push({ type: 'manual', date: new Date(), meta: { triggeredBy: req.user || 'api' } });
        await debt.save();

        res.json({ message: 'Reminder triggered', debtId: debt._id });
    } catch (err) {
        console.error('triggerDebtReminder error', err && err.message ? err.message : err);
        res.status(500).json({ error: err.message });
    }
}

async function triggerCompanyReminders(req, res) {
    try {
        const companyId = req.params.companyId || req.body.companyId || req.headers['x-company-id'];
        if (!companyId) return res.status(400).json({ error: 'companyId required' });

        // optional query param limit
        const limit = Number(req.query.limit) || 500;
        const debts = await Debt.find({ companyId, status: { $ne: 'PAID' }, isDeleted: false }).limit(limit);
        let count = 0;
        for (const d of debts) {
            const payload = {
                debtId: d._id,
                companyId: d.companyId,
                shopId: d.shopId,
                customerId: d.customerId,
                dueDate: d.dueDate,
                totalAmount: d.totalAmount,
                balance: d.balance
            };
            const eventType = `DEBT_REMINDER_MANUAL`;
            await emitReminderEvent(eventType, payload);
            d.reminderHistory = d.reminderHistory || [];
            d.reminderHistory.push({ type: 'manual_company', date: new Date(), meta: { triggeredBy: req.user || 'api' } });
            try { await d.save(); } catch (e) { }
            count++;
        }
        res.json({ message: 'Company reminders triggered', companyId, count });
    } catch (err) {
        console.error('triggerCompanyReminders error', err && err.message ? err.message : err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { triggerDebtReminder, triggerCompanyReminders };
