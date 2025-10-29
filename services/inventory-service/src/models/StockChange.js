// models/StockChange.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const stockChangeSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  variationId: { type: Schema.Types.ObjectId, default: null, index: true }, // Added for variant-specific logging, aligning with Product variations
  changeType: { type: String, enum: ['restock', 'adjustment', 'sale', 'return', 'transfer'], required: true }, // Added 'transfer' for multi-warehouse
  quantity: { type: Number, required: true },
  previousStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  reason: { type: String, trim: true },
  userId: { type: String, default: null },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null, index: true }, // Added for multi-location support
  changeDate: { type: Date, default: Date.now, index: true }
});

// Improved indexes for better querying
stockChangeSchema.index({ companyId: 1, changeDate: -1 });

stockChangeSchema.pre('save', async function(next) {
  if (this.quantity === 0) {
    return next(new Error('Quantity cannot be zero'));
  }

  // Validate quantity sign based on type
  if (['sale', 'adjustment'].includes(this.changeType) && this.quantity > 0) {
    return next(new Error('Quantity must be negative for sale or adjustment'));
  }
  if (['restock', 'return', 'transfer'].includes(this.changeType) && this.quantity < 0) {
    return next(new Error('Quantity must be positive for restock, return, or transfer'));
  }

  // Fetch product and handle variant/warehouse if specified
  const Product = mongoose.model('Product');
  const product = await Product.findOne({ _id: this.productId, companyId: this.companyId });
  if (!product) {
    return next(new Error('Product not found or not owned by company'));
  }

  let targetStock = product.inventory.quantity; // Default to main stock
  if (this.variationId) {
    const variation = product.variations.find(v => v._id.equals(this.variationId));
    if (!variation) return next(new Error('Variation not found'));
    targetStock = variation.stockQty;
  }

  if (targetStock !== this.previousStock) {
    return next(new Error('Previous stock mismatch - concurrent update detected'));
  }

  this.newStock = this.previousStock + this.quantity;
  if (this.newStock < 0) {
    return next(new Error('You do not have enough products in stock'));
  }

  // Update product stock
  if (this.variationId) {
    const variation = product.variations.find(v => v._id.equals(this.variationId));
    variation.stockQty = this.newStock;
  } else {
    product.inventory.quantity = this.newStock;
  }

  // Add to product auditTrail for alignment
  product.auditTrail.push({
    action: 'stock_change',
    changedBy: this.userId || 'system',
    oldValue: { quantity: this.previousStock },
    newValue: { quantity: this.newStock, changeType: this.changeType }
  });

  await product.save();

  // Optional: Trigger Alert if newStock <= lowStockThreshold
  if (this.newStock <= product.inventory.lowStockThreshold && ['sale', 'adjustment'].includes(this.changeType)) {
    const Alert = mongoose.model('Alert');
    const alert = new Alert({
      companyId: this.companyId,
      type: 'low_stock',
      productId: this.productId,
      threshold: product.inventory.lowStockThreshold,
      message: `Stock for product ${product.name} is low: ${this.newStock}`
    });
    await alert.save();
  }

  next();
});

// Improved static method with optional filters
stockChangeSchema.statics.getStockHistory = async function ({ productId, variationId, startDate, endDate, changeType }) {
  const filter = { productId };
  if (variationId) filter.variationId = variationId;
  if (changeType) filter.changeType = changeType;
  if (startDate || endDate) {
    filter.changeDate = {};
    if (startDate) filter.changeDate.$gte = new Date(startDate);
    if (endDate) filter.changeDate.$lte = new Date(endDate);
  }
  return await this.find(filter).sort({ changeDate: 1 }).populate('productId', 'name slug');
};

module.exports = mongoose.model('StockChange', stockChangeSchema);