// models/InventoryAdjustment.js (New model for detailed adjustments, as discussed)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const inventoryAdjustmentSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  variationId: { type: Schema.Types.ObjectId, default: null },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  adjustmentType: { type: String, enum: ['damage', 'theft', 'count', 'other'], required: true },
  quantity: { type: Number, required: true, min: 1 }, // Positive for additions, but typically negative for losses
  reason: { type: String, required: true, trim: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

inventoryAdjustmentSchema.index({ companyId: 1, status: 1 });

inventoryAdjustmentSchema.pre('save', async function(next) {
  this.updatedAt = new Date();

  if (this.isModified('status') && this.status === 'approved') {
    // Create corresponding StockChange on approval
    const StockChange = mongoose.model('StockChange');
    const stockChange = new StockChange({
      companyId: this.companyId,
      productId: this.productId,
      variationId: this.variationId,
      changeType: 'adjustment',
      quantity: this.quantity * -1, // Assume loss by default; flip if addition
      reason: this.reason,
      userId: this.userId,
      warehouseId: this.warehouseId
    });
    await stockChange.save();

    this.approvedBy = this.approvedBy || this.userId;
    this.approvedAt = new Date();
  }

  next();
});

module.exports = mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);