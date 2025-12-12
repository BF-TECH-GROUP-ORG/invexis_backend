// models/ProductStock.js — FINAL LOCKED (THE MISSING PIECE)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductStockSchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  // Optional link to a specific variation (one stock record per product+variation)
  variationId: {
    type: Schema.Types.ObjectId,
    ref: 'ProductVariation',
    default: null,
    index: true
  },
  // Current tracked quantity for this product (or variation when variationId set)
  quantity: { type: Number, default: 0, min: 0 },
  
  // Core tracking settings
  trackQuantity:     { type: Boolean, default: true },
  allowBackorder:    { type: Boolean, default: false },
  lowStockThreshold: { type: Number, default: 10, min: 0 },
  minReorderQty:     { type: Number, default: 20, min: 1 },

  // Safety stock (for advanced forecasting)
  safetyStock:       { type: Number, default: 0, min: 0 }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

/* -------------------------------------------------------------------------- */
/*                            UNIQUE INDEX: ONE RECORD PER (product + variation) */
/* -------------------------------------------------------------------------- */
ProductStockSchema.index(
  { productId: 1, variationId: 1 },
  { unique: true }
);

/* -------------------------------------------------------------------------- */
/*                            VIRTUAL: CURRENT STOCK (from Variation)           */
/* -------------------------------------------------------------------------- */
ProductStockSchema.virtual('currentStock').get(async function() {
  if (this.variationId) {
    const v = await mongoose.model('ProductVariation').findById(this.variationId).select('stockQty').lean();
    return v?.stockQty || 0;
  }
  // Master product = sum of all variations
  const total = await mongoose.model('ProductVariation').aggregate([
    { $match: { productId: this.productId } },
    { $group: { _id: null, total: { $sum: '$stockQty' } } }
  ]);
  return total[0]?.total || 0;
});

/* -------------------------------------------------------------------------- */
/*                            INDEXES FOR ALERTS & REPORTS                     */
/* -------------------------------------------------------------------------- */
ProductStockSchema.index({ lowStockThreshold: 1 });
ProductStockSchema.index({ allowBackorder: 1 });

module.exports = mongoose.model('ProductStock', ProductStockSchema);