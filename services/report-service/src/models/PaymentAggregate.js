const mongoose = require('mongoose');

const PaymentAggregateSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },
    customerId: { type: String, index: true },
    customerName: { type: String },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD

    paymentMethod: { type: String, index: true }, // cash, momo, bank, etc.
    amount: { type: Number, default: 0 },
    reference: { type: String },
    invoiceId: { type: String, index: true }
}, { timestamps: true });

PaymentAggregateSchema.index({ companyId: 1, date: 1 });

module.exports = mongoose.model('PaymentAggregate', PaymentAggregateSchema);
