const mongoose = require('mongoose');

// ProductDailySnapshot: Pre-aggregated stats PER PRODUCT per Day.
// This supports the "Magical" table view where you expand a Branch and see Product rows instantly.
// Without this, we'd have to sum up thousands of FactSale records for every request.
const ProductDailySnapshotSchema = new mongoose.Schema({
    // Dimensions
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, required: true, index: true },

    productId: { type: String, required: true, index: true },
    productName: { type: String }, // Denormalized for speed
    categoryId: { type: String, index: true },
    categoryName: { type: String },

    // Inventory Stats (Start of Day vs End of Day)
    inventory: {
        initialStock: { type: Number, default: 0 }, // "Open"
        remainingStock: { type: Number, default: 0 }, // "Close"
        stockValue: { type: Number, default: 0 } // remaining * unitCost
    },

    // Inventory Movement (Flow)
    movement: {
        in: { type: Number, default: 0 },  // Restocks / Returns
        out: { type: Number, default: 0 }   // Sales / Damaged / Theft
    },

    // Tracking Dates
    tracking: {
        lastRestock: { type: Date },
        lastMove: { type: Date }
    },

    // Status Indicators
    status: {
        reorderPoint: { type: Number, default: 10 }, // Can come from Product Service sync
        isLowStock: { type: Boolean, default: false }
    },

    // Sales Stats
    sales: {
        grossSales: { type: Number, default: 0 },
        discounts: { type: Number, default: 0 },
        netSales: { type: Number, default: 0 }, // gross - discount
        unitsSold: { type: Number, default: 0 },
        transactionCount: { type: Number, default: 0 }
    },

    // Financials
    financials: {
        costOfGoods: { type: Number, default: 0 },
        grossProfit: { type: Number, default: 0 },
        marginPercent: { type: Number, default: 0 }, // Calculated field
        amountReceived: { type: Number, default: 0 },
        amountPending: { type: Number, default: 0 } // Debt
    }

}, { timestamps: true, collection: 'productdailysnapshots' });

// Compound Indexes for fast "Get me all products for this shop on this date"
ProductDailySnapshotSchema.index({ companyId: 1, shopId: 1, date: 1 });
ProductDailySnapshotSchema.index({ companyId: 1, productId: 1, date: 1 }); // Product history

module.exports = mongoose.model('ProductDailySnapshot', ProductDailySnapshotSchema);
