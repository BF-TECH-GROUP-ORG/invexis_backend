const mongoose = require('mongoose');

const BranchPerformanceSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, required: true, index: true },
    shopName: { type: String },
    location: { type: String },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD

    transactionCount: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    activeStaffCount: { type: Number, default: 0 },
    averageDailySales: { type: Number, default: 0 }
}, { timestamps: true });

BranchPerformanceSchema.index({ companyId: 1, shopId: 1, date: 1 });

module.exports = mongoose.model('BranchPerformance', BranchPerformanceSchema);
