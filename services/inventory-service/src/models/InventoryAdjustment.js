// models/InventoryAdjustment.js (New model for detailed adjustments, as discussed)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const inventoryAdjustmentSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  shopId: { type: String, required: true, index: true }, // Shop-level tracking for multi-tenant isolation
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  variationId: { type: Schema.Types.ObjectId, default: null },
  // warehouseId removed - warehouses no longer supported
  adjustmentType: { type: String, enum: ['damage', 'theft', 'count', 'other'], required: true },
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

// models/InventoryAdjustment.js (Updated pre-save hook)
inventoryAdjustmentSchema.pre('save', async function (next) {
  this.updatedAt = new Date();

  if (this.isModified('status') && this.status === 'approved') {
    try {
      // Fetch product to get current stock
      const Product = mongoose.model('Product');
      const product = await Product.findOne({ _id: this.productId, companyId: this.companyId });
      if (!product) {
        return next(new Error('Product not found for adjustment'));
      }

      // Get current stock from ProductStock model
      const ProductStock = mongoose.model('ProductStock');
      const stockRecord = await ProductStock.findOne({
        productId: this.productId,
        variationId: this.variationId || null
      });

      if (!stockRecord) return next(new Error('Stock record not found for adjustment'));
      
      const oldQuantity = stockRecord.stockQty;
      const stockDelta = this.quantity * -1; // As per schema, negative for loss
      const newQuantity = Math.max(0, oldQuantity + stockDelta);

      if (newQuantity < 0) {
        return next(new Error('Adjustment would result in negative stock'));
      }

      // Create StockChange with required fields pre-calculated
      const StockChange = mongoose.model('StockChange');
      const stockChange = new StockChange({
        companyId: this.companyId,
        shopId: this.shopId, // Include shopId for shop-level tracking
        productId: this.productId,
        variationId: this.variationId,
        changeType: 'adjustment',
        quantity: stockDelta,
        previousStock: oldQuantity,
        newStock: newQuantity, // Required field set
        reason: this.reason,
        userId: this.userId
      });
      await stockChange.save();

      // Update ProductStock
      stockRecord.stockQty = newQuantity;
      await stockRecord.save();
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