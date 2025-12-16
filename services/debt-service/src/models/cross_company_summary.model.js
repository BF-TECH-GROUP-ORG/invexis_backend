const mongoose = require('mongoose');

const CrossCompanySummarySchema = new mongoose.Schema({
    hashedCustomerId: { type: String, index: true, required: true, unique: true },
    totalOutstanding: { type: Number, default: 0 },
    numActiveDebts: { type: Number, default: 0 },
    largestDebt: { type: Number, default: 0 },
    avgDaysOverdue: { type: Number, default: 0 },
    numCompaniesWithDebt: { type: Number, default: 0 },
    companies: { type: [String], default: [] },
    lastActivityAt: { type: Date },
    riskScore: { type: Number, default: 0 },
    riskLabel: { type: String, default: 'GOOD' },
    worstShareLevel: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    lastUpdated: { type: Date, default: Date.now }
});

CrossCompanySummarySchema.index({ hashedCustomerId: 1 });

module.exports = mongoose.model('CrossCompanySummary', CrossCompanySummarySchema);
