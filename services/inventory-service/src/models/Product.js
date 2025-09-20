const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  asin: { type: String, required: true, unique: true, index: true },
  sku: { type: String, required: true, unique: true },
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, required: true },
  bulletPoints: [{ type: String }],
  brand: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stockQty: { type: Number, required: true, default: 0, min: 0 },
  condition: { type: String, enum: ['new', 'used', 'refurbished'], default: 'new' },
  availability: { type: String, enum: ['in_stock', 'out_of_stock', 'limited'], default: 'in_stock' },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

productSchema.index({ companyId: 1, category: 1 });
productSchema.index({ keywords: 'text' });

productSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Product', productSchema);