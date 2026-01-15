const mongoose = require('mongoose');

const MetricSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true }, // Optional for company-level
    type: {
        type: String,
        required: true,
        enum: ['hourly', 'daily', 'weekly', 'monthly', 'yearly'],
        index: true
    },
    key: { type: String, required: true, index: true }, // e.g., '2024-01-14:13' for hourly, '2024-01-14' for daily

    // Metrics
    netSales: { type: Number, default: 0 },
    grossSales: { type: Number, default: 0 },
    totalCosts: { type: Number, default: 0 },
    returns: { type: Number, default: 0 },
    discounts: { type: Number, default: 0 },
    outstandingDebts: { type: Number, default: 0 },
    paymentsReceived: { type: Number, default: 0 },
    inventoryValue: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },

    // Payment Breakdown
    payments: {
        cash: { type: Number, default: 0 },
        momo: { type: Number, default: 0 },
        bank: { type: Number, default: 0 }
    },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// Compound indexes for fast retrieval
MetricSchema.index({ companyId: 1, type: 1, key: 1 });
MetricSchema.index({ shopId: 1, type: 1, key: 1 });

module.exports = mongoose.model('Metric', MetricSchema);
