const mongoose = require('mongoose');

// models/debtEvent.model.js (optional)
const DebtEventSchema = new mongoose.Schema({
    // eventType kept as free-form string to allow many integrations (audit, notifications, registry, etc.)
    eventType: { type: String, required: true },
    payload: { type: Object, required: true },
    processed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});


DebtEventSchema.index({ processed: 1 });


module.exports = mongoose.model('DebtEvent', DebtEventSchema);