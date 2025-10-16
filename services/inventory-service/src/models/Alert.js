const mongoose = require('mongoose');
const { Schema } = mongoose;

const alertSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  type: { type: String, enum: ['low_stock', 'out_of_stock', 'price_change', 'new_product', 'expired_discount', 'high_returns'], required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  threshold: { type: Number, min: 0 },
  message: { type: String, trim: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  isResolved: { type: Boolean, default: false },
  resolvedBy: { type: String , default: null },
  resolvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for performance
alertSchema.index({ companyId: 1, type: 1, createdAt: -1 });
alertSchema.index({ productId: 1 });
alertSchema.index({ categoryId: 1 });
alertSchema.index({ isResolved: 1 });

alertSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  if (['low_stock', 'out_of_stock'].includes(this.type) && !this.threshold) {
    return next(new Error('Threshold required for stock alerts'));
  }

  if (this.isResolved && !this.resolvedBy) {
    this.resolvedBy = this.resolvedBy || this.userId; // Assume resolved by current user
    this.resolvedAt = new Date();
  }

  next();
});

// Static method to get unresolved alerts for a company
alertSchema.statics.getUnresolvedAlerts = async function (companyId) {
  return await this.find({ companyId, isResolved: false }).sort({ priority: -1, createdAt: -1 }).populate('productId categoryId');
};

// Method to resolve an alert
alertSchema.methods.resolve = async function (resolvedBy) {
  this.isResolved = true;
  this.resolvedBy = resolvedBy;
  this.resolvedAt = new Date();
  this.updatedAt = new Date();
  await this.save();
};

module.exports = mongoose.model('Alert', alertSchema);