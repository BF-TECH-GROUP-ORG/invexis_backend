// models/InventoryAdjustment.js (New model for detailed adjustments, as discussed)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const inventoryAdjustmentSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  variationId: { type: Schema.Types.ObjectId, default: null },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  adjustmentType: { type: String, enum: ['damage', 'theft', 'count', 'other'], required: true },
  quantity: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

inventoryAdjustmentSchema.index({ companyId: 1, status: 1 });

// models/InventoryAdjustment.js (Updated pre-save hook)
inventoryAdjustmentSchema.pre('save', async function(next) {
  this.updatedAt = new Date();

  if (this.isModified('status') && this.status === 'approved') {
    try {
      // Fetch product to get current stock
      const Product = mongoose.model('Product');
      const product = await Product.findOne({ _id: this.productId, companyId: this.companyId });
      if (!product) {
        return next(new Error('Product not found for adjustment'));
      }

      let oldQuantity;
      if (this.variationId) {
        const variation = product.variations.find(v => v._id.equals(this.variationId));
        if (!variation) return next(new Error('Variation not found for adjustment'));
        oldQuantity = variation.stockQty;
      } else {
        oldQuantity = product.inventory.quantity;
      }

      const stockDelta = this.quantity * -1; // As per schema, negative for loss
      const newQuantity = Math.max(0, oldQuantity + stockDelta);

      if (newQuantity < 0) {
        return next(new Error('Adjustment would result in negative stock'));
      }

      // Create StockChange with required fields pre-calculated
      const StockChange = mongoose.model('StockChange');
      const stockChange = new StockChange({
        companyId: this.companyId,
        productId: this.productId,
        variationId: this.variationId,
        changeType: 'adjustment',
        quantity: stockDelta,
        previousStock: oldQuantity,
        newStock: newQuantity, // Required field set
        reason: this.reason,
        userId: this.userId,
        warehouseId: this.warehouseId
      });
      await stockChange.save();

      // Update product stock
      if (this.variationId) {
        const variation = product.variations.find(v => v._id.equals(this.variationId));
        variation.stockQty = newQuantity;
      } else {
        product.inventory.quantity = newQuantity;
      }
      product.availability = newQuantity > 0 ? 'in_stock' : 'out_of_stock';
      await product.save();

      // Add to product auditTrail
      product.auditTrail.push({
        action: 'stock_change',
        changedBy: this.userId || 'system',
        oldValue: { quantity: oldQuantity },
        newValue: { quantity: newQuantity, adjustmentType: this.adjustmentType }
      });
      await product.save();

      this.approvedBy = this.approvedBy || this.userId;
      this.approvedAt = new Date();
    } catch (error) {
      return next(error);
    }
  }

  next();
});
module.exports = mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);