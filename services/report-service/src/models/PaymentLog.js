const mongoose = require('mongoose');

// PaymentLog: Detailed Audit Trail for ALL incoming money
// Tracks both initial Sales payments and subsequent Debt payments
const PaymentLogSchema = new mongoose.Schema({
    // Indexes
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },

    // Core Payment Info
    paymentId: { type: String, unique: true }, // Unique ID for this specific payment transaction
    invoiceNo: { type: String, required: true },

    // Amounts
    amount: { type: Number, required: true },
    currency: { type: String, default: 'FRW' },
    method: { type: String, required: true }, // Mobile Money, Cash, Bank Transfer, Card

    // Customer Context
    customer: {
        name: { type: String, default: 'Walk-in' },
        phone: { type: String },
        id: { type: String }
    },

    // Tracking
    receivedBy: { type: String }, // Staff Name
    time: { type: String }, // "10:30 AM"

    // Reference (Link to Source)
    referenceType: { type: String, enum: ['SALE', 'DEBT'] }, // Was it a fresh sale or a debt repayment?
    referenceId: { type: String }, // saleId or debtRepaymentId

    // Status
    status: { type: String, default: 'Completed' } // Completed, Pending, Failed

}, { timestamps: true });

PaymentLogSchema.index({ companyId: 1, shopId: 1, date: -1 });

module.exports = mongoose.model('PaymentLog', PaymentLogSchema);
