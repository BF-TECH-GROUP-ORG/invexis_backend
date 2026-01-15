const mongoose = require('mongoose');

const SalesAggregateSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },
    productId: { type: String, index: true },
    productName: { type: String },
    staffId: { type: String, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD

    quantitySold: { type: Number, default: 0 },
    quantityReturned: { type: Number, default: 0 },
    grossSales: { type: Number, default: 0 },
    discounts: { type: Number, default: 0 },
    netSales: { type: Number, default: 0 },
    totalCosts: { type: Number, default: 0 },
    amountReceived: { type: Number, default: 0 },
    amountPending: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 }
}, { timestamps: true });

SalesAggregateSchema.index({ companyId: 1, date: 1 });
SalesAggregateSchema.index({ shopId: 1, date: 1 });

module.exports = mongoose.model('SalesAggregate', SalesAggregateSchema);
