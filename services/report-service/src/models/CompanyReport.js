const mongoose = require('mongoose');
const BaseReportSchema = require('./BaseReportSchema');

const CompanyReportSchema = new mongoose.Schema({
    ...BaseReportSchema,
    activeShops: { type: Number, default: 0 },
    totalEmployees: { type: Number, default: 0 },
    subscriptionTier: String,
    totalSales: { type: Number, default: 0 },
    totalInventoryValue: { type: Number, default: 0 }
}, { timestamps: true });

CompanyReportSchema.index({ companyId: 1, 'period.month': 1 });

module.exports = mongoose.model('CompanyReport', CompanyReportSchema);
