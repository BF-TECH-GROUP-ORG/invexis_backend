const mongoose = require('mongoose');
const { Schema } = mongoose;

const discountSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  minPurchaseAmount: { type: Number, default: 0, min: 0 },
  maxDiscountAmount: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for performance
discountSchema.index({ companyId: 1, startDate: -1 });
discountSchema.index({ productId: 1 });
discountSchema.index({ categoryId: 1 });

discountSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  if (this.startDate > this.endDate) {
    return next(new Error('Start date must be before end date'));
  }

  if (!this.productId && !this.categoryId) {
    return next(new Error('Discount must be linked to a product or category'));
  }

  if (this.type === 'percentage' && this.value > 100) {
    return next(new Error('Percentage discount cannot exceed 100'));
  }

  next();
});

// Method to calculate discounted price
discountSchema.methods.calculateDiscountedPrice = function (originalPrice, quantity = 1) {
  let discountAmount = 0;
  const totalAmount = originalPrice * quantity;

  if (totalAmount < this.minPurchaseAmount) {
    return originalPrice;
  }

  if (this.type === 'percentage') {
    discountAmount = (this.value / 100) * originalPrice;
  } else {
    discountAmount = this.value;
  }

  if (this.maxDiscountAmount > 0 && discountAmount > this.maxDiscountAmount) {
    discountAmount = this.maxDiscountAmount;
  }

  return originalPrice - discountAmount;
};

// Static method to get active discounts for a product
discountSchema.statics.getActiveDiscounts = async function (productId) {
  const now = new Date();
  return await this.find({
    productId,
    startDate: { $lte: now },
    endDate: { $gte: now },
    isActive: true
  }).sort({ value: -1 });
};

module.exports = mongoose.model('Discount', discountSchema);