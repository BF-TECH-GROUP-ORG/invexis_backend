// models/debt.model.js
const mongoose = require('mongoose');


const DebtSchema = new mongoose.Schema({
    companyId: { type: mongoose.Types.ObjectId, required: true },
    shopId: { type: mongoose.Types.ObjectId, required: true },
    customerId: { type: mongoose.Types.ObjectId, required: true },

    // Hashed customer identifier for cross-company visibility (do NOT store raw phone/NID)
    hashedCustomerId: { type: String, index: true },

    // Sales / staff info
    salesId: { type: mongoose.Types.ObjectId, required: true },
    salesStaffId: { type: mongoose.Types.ObjectId, required: true },


    items: [
        {
            itemId: { type: mongoose.Types.ObjectId, required: true },
            quantity: { type: Number, required: true },
            unitPrice: { type: Number, required: true },
            totalPrice: { type: Number, required: true }
        }
    ],


    totalAmount: { type: Number, required: true },
    amountPaidNow: { type: Number, default: 0 },
    balance: { type: Number, required: true },


    status: {
        type: String,
        enum: ["UNPAID", "PARTIALLY_PAID", "PAID"],
        default: "UNPAID"
    },


    dueDate: { type: Date },
    overdueDays: { type: Number, default: 0 },

    // Consent reference and share level control cross-company visibility
    consentRef: { type: String },
    shareLevel: {
        type: String,
        enum: ['NONE', 'PARTIAL', 'FULL'],
        default: 'NONE'
    },

    // Embedded repayment references for fast reads
    repayments: [{ type: mongoose.Types.ObjectId, ref: 'Repayment' }],

    // Track balance over time (simple denormalized history)
    balanceHistory: [
        {
            date: { type: Date, default: Date.now },
            balance: { type: Number }
        }
    ],

    // Soft delete support
    isDeleted: { type: Boolean, default: false },


    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indexes (remove inline index: true to avoid duplicates)
DebtSchema.index({ companyId: 1 });
DebtSchema.index({ shopId: 1 });
DebtSchema.index({ customerId: 1 });
DebtSchema.index({ dueDate: 1 });
DebtSchema.index({ status: 1 });
DebtSchema.index({ isDeleted: 1 });
DebtSchema.index({ companyId: 1, shopId: 1 });
DebtSchema.index({ companyId: 1, customerId: 1 });


module.exports = mongoose.model('Debt', DebtSchema);