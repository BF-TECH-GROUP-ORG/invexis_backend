const DebtEvent = require('../models/debit_events.model');

async function createEvent(doc) {
    const ev = new DebtEvent(doc);
    return ev.save();
}

async function getUnprocessedBatch(limit = 25) {
    return DebtEvent.find({ processed: false }).limit(limit);
}

async function markProcessed(eventId) {
    return DebtEvent.findByIdAndUpdate(eventId, { processed: true });
}

module.exports = { createEvent, getUnprocessedBatch, markProcessed };
