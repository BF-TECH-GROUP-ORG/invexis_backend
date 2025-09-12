const mongoose = require('mongoose');
const { Schema } = mongoose;

const productReportSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
  companyId: { type: String, required: true },
  totalSales: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  averageDailySales: { type: Number, default: 0 },
  lowStockAlerts: { type: Number, default: 0 },
  lastRestockDate: { type: Date },
  stockHistory: [{
    date: { type: Date },
    stockQty: { type: Number }
  }],
  updatedAt: { type: Date, default: Date.now }
});

productReportSchema.index({ companyId: 1, productId: 1 });

productReportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ProductReport', productReportSchema);