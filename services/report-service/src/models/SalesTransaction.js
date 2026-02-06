const mongoose = require('mongoose');

// SalesTransaction: Detailed "Read Model" for Sales Reports
// Optimized for the "Invoice List" view (Hierarchy: Branch -> Invoice -> Items)
const SalesTransactionSchema = new mongoose.Schema({
    // Indexes
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true }, // For filtering

    // Invoice Details
    invoiceNo: { type: String, required: true }, // e.g., INV-2022-001
    saleId: { type: String, unique: true },

    // Customer
    customer: {
        name: { type: String, default: 'Walk-in' },
        type: { type: String, default: 'Retail' }, // Retail, Wholesale, Corporate
        id: { type: String }
    },

    // Tracking
    soldBy: { type: String }, // Staff Name
    saleTime: { type: String }, // e.g. "10:30 AM"

    // Line Items (Nested for fast "Expand Invoice" view)
    items: [{
        productId: { type: String },
        productName: { type: String },
        category: { type: String },

        // Quantities
        qtySold: { type: Number, default: 0 },
        returns: { type: Number, default: 0 },
        netQty: { type: Number, default: 0 },

        // Values
        unitPrice: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 },

        soldBy: { type: String } // Item level staff tracking? (Image shows "Sold By" in Tracking col for item?)
    }],

    // Totals
    totalAmount: { type: Number, default: 0 },
    paymentMethod: { type: String },

    // Debt & Payment Tracking (Mutable State)
    debt: {
        isDebt: { type: Boolean, default: false },
        originalAmount: { type: Number, default: 0 },
        amountPaid: { type: Number, default: 0 },
        balance: { type: Number, default: 0 },

        dueDate: { type: Date },
        lastPaymentDate: { type: Date },
        debtId: { type: String, index: true }, // For cross-service correlation

        status: { type: String, default: 'Pending' } // Pending, Overdue, Paid
    }

}, { timestamps: true, collection: 'salestransactions' });

// Compound index for Report Query
SalesTransactionSchema.index({ companyId: 1, shopId: 1, date: -1 });

// Index for Debt Queries (Ultra Performance for "Overdue" lookups)
SalesTransactionSchema.index({ companyId: 1, "debt.isDebt": 1, "debt.dueDate": 1 });

module.exports = mongoose.model('SalesTransaction', SalesTransactionSchema);