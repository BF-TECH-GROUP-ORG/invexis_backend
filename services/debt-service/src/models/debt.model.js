// models/debt.model.js
const mongoose = require('mongoose');


const DebtSchema = new mongoose.Schema({
    companyId: { type: String, required: true },
    shopId: { type: String, required: true },
    customerId: { type: String, required: true },
    // Embedded customer object for convenience in front-end (id, name, phone)
    customer: {
        id: { type: String, default: null },
        name: { type: String, default: null },
        phone: { type: String, default: null }
    },

    // Hashed customer identifier for cross-company visibility (do NOT store raw phone/NID)
    hashedCustomerId: { type: String, index: true },

    // Sales / staff info
    salesId: { type: mongoose.Types.ObjectId, default: null },
    salesStaffId: { type: mongoose.Types.ObjectId, required: true, default: null },


    items: [
        {
            itemId: { type: mongoose.Types.ObjectId, required: true },
            itemName: { type: String, required: true },
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
    consentRef: { type: String, default: null },
    shareLevel: {
        type: String,
        enum: ['NONE', 'PARTIAL', 'FULL'],
        default: 'NONE'
    },

    // Embedded repayment references for fast reads
    repayments: [{ type: mongoose.Types.ObjectId, ref: 'Repayment', default: [] }],

    // Audit: who created/updated the debt (store id + human name)
    createdBy: {
        // allow actor ids to be strings (external/system ids) to avoid casting errors
        id: { type: String, default: null },
        name: { type: String, default: null }
    },
    updatedBy: {
        id: { type: String, default: null },
        name: { type: String, default: null }
    },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    cancelledBy: {
        id: { type: String, default: null },
        name: { type: String }
    },

    // Track balance over time (simple denormalized history)
    balanceHistory: [
        {
            date: { type: Date, default: Date.now },
            balance: { type: Number }
        }
    ],

    // Soft delete support
    isDeleted: { type: Boolean, default: false },

    deletedAt: { type: Date },

    // Track reminders sent to avoid duplicates: [{ type: 'upcoming_7'|'overdue_3'|'final', date: Date, meta: {} }]
    reminderHistory: [
        {
            type: { type: String },
            date: { type: Date, default: Date.now },
            meta: { type: Object }
        }
    ],

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indexes (remove inline index: true to avoid duplicates)
// Composite indexes for optimal query performance (background: true allows index creation without blocking)
DebtSchema.index({ companyId: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ shopId: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ customerId: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ hashedCustomerId: 1, isDeleted: 1 }, { background: true });
DebtSchema.index({ dueDate: 1, status: 1, isDeleted: 1 }, { background: true });
DebtSchema.index({ status: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ companyId: 1, shopId: 1, status: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ companyId: 1, customerId: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ createdAt: -1 }, { background: true });
DebtSchema.index({ updatedAt: -1 }, { background: true });
DebtSchema.index({ isDeleted: 1, dueDate: 1 }, { background: true }); // For overdue queries

module.exports = mongoose.model('Debt', DebtSchema);