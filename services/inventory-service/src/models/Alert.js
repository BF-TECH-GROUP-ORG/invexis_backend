// models/Alert.js (Unchanged from improved version)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const alertSchema = new Schema({
  companyId: { type: String, required: true, index: true }, // Links to company for multi-tenancy
  type: { type: String, enum: ['low_stock', 'out_of_stock', 'price_change', 'new_product', 'expired_discount', 'high_returns'], required: true }, // Relevant alert types tied to inventory events
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null, index: true }, // Optional link to specific product
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true }, // Optional link to category for broader alerts
  threshold: { type: Number, min: 0 }, // Threshold for stock-related alerts
  message: { type: String, required: true, trim: true }, // Descriptive message for the alert
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }, // Priority level for sorting/handling
  isResolved: { type: Boolean, default: false, index: true }, // Status tracking
  resolvedBy: { type: String, default: null }, // User who resolved it
  resolvedAt: { type: Date, default: null }, // Timestamp of resolution
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Improved indexes for better query performance
alertSchema.index({ companyId: 1, type: 1, createdAt: -1 });
alertSchema.index({ companyId: 1, isResolved: 1, priority: -1 });

// Pre-save middleware with improved validation
alertSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  // Require threshold only for stock-related types
  if (['low_stock', 'out_of_stock'].includes(this.type) && this.threshold == null) {
    return next(new Error('Threshold is required for stock-related alerts'));
  }

  // Auto-set resolution details if marking as resolved
  if (this.isModified('isResolved') && this.isResolved && !this.resolvedAt) {
    this.resolvedAt = new Date();
    this.resolvedBy = this.resolvedBy || 'system'; // Fallback to 'system' if no user
  }

  // Ensure at least one link (product or category) for non-global alerts, but allow global if type allows (e.g., new_product)
  if (!['new_product', 'expired_discount'].includes(this.type) && !this.productId && !this.categoryId) {
    return next(new Error('Alert must be linked to a product or category for this type'));
  }

  next();
});

// Static method to get unresolved alerts, improved with limit and populate
alertSchema.statics.getUnresolvedAlerts = async function (companyId, limit = 50) {
  return await this.find({ companyId, isResolved: false })
    .populate('productId', 'name slug')
    .populate('categoryId', 'name slug')
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit);
};

// Instance method to resolve alert
alertSchema.methods.resolve = async function (resolvedBy) {
  this.isResolved = true;
  this.resolvedBy = resolvedBy || 'system';
  this.resolvedAt = new Date();
  this.updatedAt = new Date();
  await this.save();
};

module.exports = mongoose.model('Alert', alertSchema);