// models/InventoryAdjustment.js (New model for detailed adjustments, as discussed)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const inventoryAdjustmentSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  shopId: { type: String, required: true, index: true }, // Shop-level tracking for multi-tenant isolation
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  variationId: { type: Schema.Types.ObjectId, default: null },
  // warehouseId removed - warehouses no longer supported
  adjustmentType: { type: String, enum: ['damage', 'theft', 'count', 'loss', 'gain', 'restock', 'other'], required: true },
  quantity: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: String, default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

inventoryAdjustmentSchema.index({ companyId: 1, shopId: 1, status: 1 });
inventoryAdjustmentSchema.index({ companyId: 1, status: 1 });

inventoryAdjustmentSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);
