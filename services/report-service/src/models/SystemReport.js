const mongoose = require('mongoose');
const BaseReportSchema = require('./BaseReportSchema');

const SystemReportSchema = new mongoose.Schema({
    ...BaseReportSchema, // Generally systemId="INVEXIS", companyId=null
    totalCompanies: { type: Number, default: 0 },
    totalUsers: { type: Number, default: 0 },
    totalRevenueProcessed: { type: Number, default: 0 },
    systemHealthScore: { type: Number, default: 100 },
    serviceUptime: { type: Map, of: Number } // Service Name -> Uptime %
}, { timestamps: true });

SystemReportSchema.index({ systemId: 1, 'period.day': 1 });

module.exports = mongoose.model('SystemReport', SystemReportSchema);
