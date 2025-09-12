const mongoose = require('mongoose');
const { Schema } = mongoose;

const dailyReportSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  reportDate: { type: Date, required: true, unique: true },
  totalSales: { type: Number, default: 0 },
  totalSalesCount: { type: Number, default: 0 },
  totalRestocks: { type: Number, default: 0 },
  stockChanges: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    netChange: { type: Number },
    endingStock: { type: Number }
  }],
  generatedAt: { type: Date, default: Date.now }
});

dailyReportSchema.index({ companyId: 1, reportDate: 1 }, { unique: true });

module.exports = mongoose.model('DailyReport', dailyReportSchema);