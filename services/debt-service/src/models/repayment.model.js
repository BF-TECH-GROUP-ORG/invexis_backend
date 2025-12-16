<<<<<<< HEAD
const mongoose = require('mongoose');

// models/repayment.model.js
const RepaymentSchema = new mongoose.Schema({
    companyId: { type: mongoose.Types.ObjectId, required: true },
    shopId: { type: mongoose.Types.ObjectId, required: true },

    // We no longer store raw customerId or embedded customer object here.
    // All per-customer linkage is done via hashedCustomerId on the Debt.
    hashedCustomerId: { type: String, required: true },

    debtId: { type: mongoose.Types.ObjectId, required: true },


    // paymentId is an external idempotency key (may be ObjectId or external string like a payment provider id)
    paymentId: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    paymentMethod: {
        type: String,
        enum: ["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"],
        default: "CASH"
    },
    paymentReference: { type: String },

    // Audit: who recorded the repayment
    createdBy: {
        // allow non-ObjectId actor ids (e.g. temp-user-id or external system ids)
        id: { type: String },
        name: { type: String }
    },

    paidAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Composite indexes for optimal query performance
RepaymentSchema.index({ companyId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ shopId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ hashedCustomerId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ debtId: 1, paidAt: -1 }, { background: true });
RepaymentSchema.index({ companyId: 1, shopId: 1 }, { background: true });
RepaymentSchema.index({ paidAt: -1 }, { background: true });


=======
const mongoose = require('mongoose');

// models/repayment.model.js
const RepaymentSchema = new mongoose.Schema({
    companyId: { type: mongoose.Types.ObjectId, required: true },
    shopId: { type: mongoose.Types.ObjectId, required: true },
    customerId: { type: mongoose.Types.ObjectId, required: true },
    // Embedded customer object to provide name/phone for frontend
    customer: {
        id: { type: mongoose.Types.ObjectId },
        name: { type: String },
        phone: { type: String }
    },
    debtId: { type: mongoose.Types.ObjectId, required: true },


    // paymentId is an external idempotency key (may be ObjectId or external string like a payment provider id)
    paymentId: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    paymentMethod: {
        type: String,
        enum: ["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"],
        default: "CASH"
    },
    paymentReference: { type: String },

    // Audit: who recorded the repayment
    createdBy: {
        // allow non-ObjectId actor ids (e.g. temp-user-id or external system ids)
        id: { type: String },
        name: { type: String }
    },

    paidAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Composite indexes for optimal query performance
RepaymentSchema.index({ companyId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ shopId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ customerId: 1, createdAt: -1 }, { background: true });
RepaymentSchema.index({ debtId: 1, paidAt: -1 }, { background: true });
RepaymentSchema.index({ companyId: 1, shopId: 1 }, { background: true });
RepaymentSchema.index({ paidAt: -1 }, { background: true });


>>>>>>> 55eb3af5e260dabebd54e7923b37bc5096e6e6ae
module.exports = mongoose.model('Repayment', RepaymentSchema);