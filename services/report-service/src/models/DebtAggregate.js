const mongoose = require('mongoose');

const DebtAggregateSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },
    customerId: { type: String, index: true },
    customerName: { type: String },
    customerPhone: { type: String },
    invoiceNumber: { type: String, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD

    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    dueDate: { type: Date },
    status: { type: String, index: true } // PENDING, OVERDUE, PAID
}, { timestamps: true });


module.exports = mongoose.model('DebtAggregate', DebtAggregateSchema);
