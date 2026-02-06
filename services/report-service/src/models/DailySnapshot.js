const mongoose = require('mongoose');

// DailySnapshot: Pre-aggregated high-speed dashboard data
// One document per Shop per Day.
// Updated in real-time or periodically via Aggregate Workers.
const DailySnapshotSchema = new mongoose.Schema({
    // Dimensions
    date: { type: String, required: true, index: true }, // YYYY-MM-DD (String for easy lookup)
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, required: true, index: true },

    // 1. Sales Performance
    sales: {
        totalRevenue: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
        grossProfit: { type: Number, default: 0 },
        netProfit: { type: Number, default: 0 },
        transactionCount: { type: Number, default: 0 },
        avgBasketSize: { type: Number, default: 0 },
        discountTotal: { type: Number, default: 0 }
    },

    // 2. Inventory Health (End of Day scope)
    inventory: {
        totalValue: { type: Number, default: 0 },
        itemsInStock: { type: Number, default: 0 },
        lowStockItems: { type: Number, default: 0 },
        outOfStockItems: { type: Number, default: 0 }
    },

    // 3. Financials (Cash Flow)
    finance: {
        cashIn: { type: Number, default: 0 }, // Total payments received (Cash + MoMo)
        cashOut: { type: Number, default: 0 }, // Expenses + Refunds
        debtIncurred: { type: Number, default: 0 }, // Credit sales
        debtRepaid: { type: Number, default: 0 }   // Debt payments received
    },

    // 4. Operational
    performance: {
        topStaffId: { type: String },
        topProductId: { type: String }
    },

    lastUpdated: { type: Date, default: Date.now }

}, { timestamps: true, collection: 'dailysnapshots' });

// Compound Index for "Get me this month's data for this shop"
DailySnapshotSchema.index({ companyId: 1, shopId: 1, date: 1 });

module.exports = mongoose.model('DailySnapshot', DailySnapshotSchema);
