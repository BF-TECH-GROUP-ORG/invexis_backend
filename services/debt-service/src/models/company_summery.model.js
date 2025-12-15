const mongoose = require('mongoose');
// models/companySummary.model.js
const CompanySummarySchema = new mongoose.Schema({
    companyId: { type: mongoose.Types.ObjectId, index: true, required: true, unique: true },


    totalOutstanding: { type: Number, default: 0 },
    totalRepaid: { type: Number, default: 0 },
    totalCreditSales: { type: Number, default: 0 },


    overdueDebt: { type: Number, default: 0 },


    monthlyTrend: [
        {
            month: { type: String }, // YYYY-MM
            newDebts: { type: Number, default: 0 },
            repaid: { type: Number, default: 0 },
            outstanding: { type: Number, default: 0 }
        }
    ],


    updatedAt: { type: Date, default: Date.now }
});


CompanySummarySchema.index({ companyId: 1 });


module.exports = mongoose.model('CompanyDebtSummary', CompanySummarySchema);