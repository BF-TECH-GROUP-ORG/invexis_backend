const mongoose = require('mongoose');
const Money = require('/app/shared/utils/MoneyUtil');


const DebtSchema = new mongoose.Schema({
    companyId: { type: String, required: true },
    shopId: { type: String, required: true },
    // We no longer store a raw customerId here to avoid leaking local identifiers.
    // Instead we keep:
    // - hashedCustomerId: the stable, privacy-preserving identifier
    // - customer: only the display information needed for the UI (name + phone)
    customer: {
        name: { type: String, default: null },
        phone: { type: String, default: null }
    },

    // Hashed customer identifier for cross-company and per-customer visibility
    hashedCustomerId: { type: String, required: false },

    // Sales / staff info
    salesId: { type: String, default: null },

    items: [
        {
            itemId: { type: mongoose.Types.ObjectId, required: true },
            itemName: { type: String, required: true },
            quantity: { type: Number, required: true },
            unitPrice: {
                type: Number,
                required: true,
                get: v => Money.toMajor(v),
                set: v => Money.toMinor(v)
            },
            totalPrice: {
                type: Number,
                required: true,
                get: v => Money.toMajor(v),
                set: v => Money.toMinor(v)
            }
        }
    ],

    totalAmount: {
        type: Number,
        required: true,
        get: v => Money.toMajor(v),
        set: v => Money.toMinor(v)
    },
    amountPaidNow: {
        type: Number,
        default: 0,
        get: v => Money.toMajor(v),
        set: v => Money.toMinor(v)
    },
    balance: {
        type: Number,
        required: true,
        get: v => Money.toMajor(v),
        set: v => Money.toMinor(v)
    },


    status: {
        type: String,
        enum: ["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"],
        default: "UNPAID"
    },


    dueDate: { type: Date },
    overdueDays: { type: Number, default: 3 },

    // Embedded repayment references for fast reads
    repayments: [{ type: mongoose.Types.ObjectId, ref: 'Repayment', default: [] }],

    // Audit: who created/updated the debt (store id + human name)
    createdBy: {
        // allow actor ids to be strings (external/system ids) to avoid casting errors
        type: String, default: null
    },
    updatedBy: {
        type: String, default: null
    },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    cancelledBy: {
        type: String, default: null
    },

    // Track balance over time (simple denormalized history)
    balanceHistory: [
        {
            date: { type: Date, default: Date.now },
            balance: {
                type: Number,
                get: v => Money.toMajor(v),
                set: v => Money.toMinor(v)
            }
        }
    ],

    // Invoice link
    invoiceUrl: { type: String, default: null },

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
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Indexes (remove inline index: true to avoid duplicates)
// Composite indexes for optimal query performance (background: true allows index creation without blocking)
DebtSchema.index({ companyId: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ shopId: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ hashedCustomerId: 1, isDeleted: 1 }, { background: true });
DebtSchema.index({ dueDate: 1, status: 1, isDeleted: 1 }, { background: true });
DebtSchema.index({ status: 1, isDeleted: 1, createdAt: -1 }, { background: true });
DebtSchema.index({ companyId: 1, shopId: 1, status: 1, createdAt: -1 }, { background: true });
// customerId removed from schema; customer-level lookups should now use hashedCustomerId
DebtSchema.index({ createdAt: -1 }, { background: true });
DebtSchema.index({ updatedAt: -1 }, { background: true });
DebtSchema.index({ isDeleted: 1, dueDate: 1 }, { background: true }); // For overdue queries

module.exports = mongoose.model('Debt', DebtSchema);