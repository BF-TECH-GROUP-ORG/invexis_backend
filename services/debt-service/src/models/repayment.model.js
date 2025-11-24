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


    paymentId: { type: mongoose.Types.ObjectId, required: true },
    amountPaid: { type: Number, required: true },
    paymentMethod: {
        type: String,
        enum: ["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"],
        default: "CASH"
    },
    paymentReference: { type: String },

    // Audit: who recorded the repayment
    createdBy: {
        id: { type: mongoose.Types.ObjectId },
        name: { type: String }
    },

    paidAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Indexes (removed inline index: true)
RepaymentSchema.index({ companyId: 1 });
RepaymentSchema.index({ shopId: 1 });
RepaymentSchema.index({ customerId: 1 });
RepaymentSchema.index({ debtId: 1 });
RepaymentSchema.index({ companyId: 1, shopId: 1 });


module.exports = mongoose.model('Repayment', RepaymentSchema);