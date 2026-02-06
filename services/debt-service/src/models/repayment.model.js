const mongoose = require('mongoose');
const Money = require('/app/shared/utils/MoneyUtil');

// models/repayment.model.js
const RepaymentSchema = new mongoose.Schema({
    companyId: { type: String, required: true },
    shopId: { type: String, required: true },

    // We no longer store raw customerId or embedded customer object here.
    // All per-customer linkage is done via hashedCustomerId on the Debt.
    hashedCustomerId: { type: String, required: false },

    debtId: { type: mongoose.Types.ObjectId, required: true },


    // paymentId is an external idempotency key (may be ObjectId or external string like a payment provider id)
    paymentId: { type: String, required: true },
    amountPaid: {
        type: Number,
        required: true,
        get: v => Money.toMajor(v),
        set: v => Money.toMinor(v)
    },
    paymentMethod: {
        type: String,
        enum: ["CASH", "MTN", "AIRTEL", "BANK_TRANSFER"],
        default: "CASH"
    },
    paymentReference: { type: String },

    // Audit: who recorded the repayment
    createdBy: {
        // allow non-ObjectId actor ids (e.g. temp-user-id or external system ids)
        id: { type: String },
        name: { type: String }
    },

    status: {
        type: String,
        enum: ['pending', 'succeeded', 'failed'],
        default: 'pending'
    },

    invoiceUrl: { type: String, default: null },

    paidAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
}, {
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Composite indexes for optimal query performance
RepaymentSchema.index({ companyId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ shopId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ hashedCustomerId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ debtId: 1, paidAt: -1 }, { background: true });
RepaymentSchema.index({ companyId: 1, shopId: 1 }, { background: true });
RepaymentSchema.index({ paidAt: -1 }, { background: true });


module.exports = mongoose.model('Repayment', RepaymentSchema);