<<<<<<< HEAD
const mongoose = require('mongoose');

// models/customerSummary.model.js
// NOTE: Customer summaries are now keyed by hashedCustomerId instead of raw customerId
const CustomerSummarySchema = new mongoose.Schema({
    companyId: { type: mongoose.Types.ObjectId, index: true, required: true },
    hashedCustomerId: { type: String, index: true, required: true },

    totalDebts: { type: Number, default: 0 },
    activeDebts: { type: Number, default: 0 },
    paidDebts: { type: Number, default: 0 },
    totalOutstanding: { type: Number, default: 0 },
    totalRepaid: { type: Number, default: 0 },
    largestDebt: { type: Number, default: 0 },
    lastPaymentDate: { type: Date },
    riskRating: { type: String, default: "GOOD" },
    updatedAt: { type: Date, default: Date.now }
});

CustomerSummarySchema.index({ companyId: 1, hashedCustomerId: 1 }, { unique: true });

=======
const mongoose = require('mongoose');

// models/customerSummary.model.js
const CustomerSummarySchema = new mongoose.Schema({
    companyId: { type: mongoose.Types.ObjectId, index: true, required: true },
    customerId: { type: mongoose.Types.ObjectId, index: true, required: true },

    totalDebts: { type: Number, default: 0 },
    activeDebts: { type: Number, default: 0 },
    paidDebts: { type: Number, default: 0 },
    totalOutstanding: { type: Number, default: 0 },
    totalRepaid: { type: Number, default: 0 },
    largestDebt: { type: Number, default: 0 },
    lastPaymentDate: { type: Date },
    riskRating: { type: String, default: "GOOD" },
    updatedAt: { type: Date, default: Date.now }
});

CustomerSummarySchema.index({ companyId: 1, customerId: 1 }, { unique: true });

>>>>>>> 55eb3af5e260dabebd54e7923b37bc5096e6e6ae
module.exports = mongoose.model('CustomerDebtSummary', CustomerSummarySchema);