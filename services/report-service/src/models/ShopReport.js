const mongoose = require('mongoose');
const BaseReportSchema = require('./BaseReportSchema');

const ShopReportSchema = new mongoose.Schema({
    ...BaseReportSchema,
    salesPerformance: { type: Number, default: 0 }, // Revenue
    stockLevel: { type: Number, default: 0 }, // Item count
    activeStaff: { type: Number, default: 0 },
    dailyFootfall: { type: Number, default: 0 } // If tracked
}, { timestamps: true });

ShopReportSchema.index({ shopId: 1, 'period.day': 1 });

module.exports = mongoose.model('ShopReport', ShopReportSchema);
