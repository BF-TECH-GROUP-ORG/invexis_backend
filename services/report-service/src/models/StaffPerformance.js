const mongoose = require('mongoose');

const StaffPerformanceSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },
    staffId: { type: String, required: true, index: true },
    role: { type: String },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD

    transactionCount: { type: Number, default: 0 },
    revenueGenerated: { type: Number, default: 0 },
    averageSaleValue: { type: Number, default: 0 }
}, { timestamps: true });

StaffPerformanceSchema.index({ companyId: 1, staffId: 1, date: 1 });

module.exports = mongoose.model('StaffPerformance', StaffPerformanceSchema);
