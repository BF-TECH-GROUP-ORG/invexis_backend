// models/Discount.js (Unchanged from improved version)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const discountSchema = new Schema({
  companyId: { type: String, required: true, index: true }, // Multi-tenancy link
  name: { type: String, required: true, trim: true }, // Descriptive name
  type: { type: String, enum: ['percentage', 'fixed'], required: true }, // Discount type
  value: { type: Number, required: true, min: 0 }, // Discount amount/percentage
  startDate: { type: Date, required: true }, // Validity start
  endDate: { type: Date, required: true }, // Validity end
  appliesTo: { type: String, enum: ['global', 'product', 'category'], default: 'product' }, // Improved: Allow global discounts
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true }, // Specific product if appliesTo 'product'
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true }, // Specific category if appliesTo 'category'
  minPurchaseAmount: { type: Number, default: 0, min: 0 }, // Minimum amount for eligibility
  maxDiscountAmount: { type: Number, default: 0, min: 0 }, // Cap on discount
  isActive: { type: Boolean, default: true, index: true }, // Active status
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Improved indexes
discountSchema.index({ companyId: 1, startDate: -1, endDate: 1 });
discountSchema.index({ companyId: 1, isActive: 1 });

// Pre-save middleware with conditional validation
discountSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  if (this.startDate > this.endDate) {
    return next(new Error('Start date must be before end date'));
  }

  // Conditional required fields based on appliesTo
  if (this.appliesTo === 'product' && !this.productId) {
    return next(new Error('Product ID required for product-specific discount'));
  }
  if (this.appliesTo === 'category' && !this.categoryId) {
    return next(new Error('Category ID required for category-specific discount'));
  }
  if (this.appliesTo !== 'global' && (this.productId && this.categoryId)) {
    return next(new Error('Discount cannot apply to both product and category'));
  }

  if (this.type === 'percentage' && this.value > 100) {
    return next(new Error('Percentage discount cannot exceed 100'));
  }

  next();
});

// Instance method to calculate discounted price, improved to handle quantity and min amount
discountSchema.methods.calculateDiscountedPrice = function (originalPrice, quantity = 1) {
  const totalAmount = originalPrice * quantity;
  if (totalAmount < this.minPurchaseAmount) {
    return originalPrice;
  }

  let discountAmount = this.type === 'percentage' ? (this.value / 100) * originalPrice : this.value;
  if (this.maxDiscountAmount > 0 && discountAmount > this.maxDiscountAmount) {
    discountAmount = this.maxDiscountAmount;
  }

  return originalPrice - discountAmount;
};

// Static method to get active discounts, improved to handle product or category
discountSchema.statics.getActiveDiscounts = async function ({ productId, categoryId }) {
  const now = new Date();
  const query = {
    startDate: { $lte: now },
    endDate: { $gte: now },
    isActive: true
  };

  if (productId) query.productId = productId;
  if (categoryId) query.categoryId = categoryId;

  return await this.find(query).sort({ value: -1 });
};

module.exports = mongoose.model('Discount', discountSchema);