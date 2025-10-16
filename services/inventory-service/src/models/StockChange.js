const mongoose = require('mongoose');
const { Schema } = mongoose;
const Product = require('./Product');

const stockChangeSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  changeType: { type: String, enum: ['restock', 'adjustment', 'sale', 'return'], required: true },
  quantity: { type: Number, required: true },
  previousStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  reason: { type: String, trim: true },
  userId: { type: String, default: null },
  changeDate: { type: Date, default: Date.now, index: true }
});

// Indexes for reporting
stockChangeSchema.index({ companyId: 1, changeDate: -1 });
stockChangeSchema.index({ productId: 1, changeType: 1 });

stockChangeSchema.pre('save', async function(next) {
  if (this.quantity === 0) {
    return next(new Error('Quantity cannot be zero'));
  }

  if (['sale', 'adjustment'].includes(this.changeType) && this.quantity > 0) {
    return next(new Error('Quantity must be negative for sale or adjustment'));
  }

  if (['restock', 'return'].includes(this.changeType) && this.quantity < 0) {
    return next(new Error('Quantity must be positive for restock or return'));
  }

  // Fetch the product to verify and update
  const product = await Product.findOne({ _id: this.productId, companyId: this.companyId });
  if (!product) {
    return next(new Error('Product not found or not owned by company'));
  }

  if (product.stockQty !== this.previousStock) {
    return next(new Error('Previous stock mismatch - concurrent update detected'));
  }

  this.newStock = this.previousStock + this.quantity;
  if (this.newStock < 0) {
    return next(new Error('New stock cannot be negative'));
  }

  product.stockQty = this.newStock;
  await product.save();

  next();
});

// Static method to get stock history for a product
stockChangeSchema.statics.getStockHistory = async function (productId, startDate, endDate) {
  const filter = { productId };
  if (startDate) filter.changeDate = { $gte: new Date(startDate) };
  if (endDate) filter.changeDate.$lte = new Date(endDate);
  return await this.find(filter).sort({ changeDate: 1 });
};

module.exports = mongoose.model('StockChange', stockChangeSchema);