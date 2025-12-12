const mongoose = require('mongoose');
const { Schema } = mongoose;

const PricingTierSchema = new Schema({
  minQuantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
});

const ProductPricingSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
  basePrice: { type: Number, required: true, min: 0 },
  salePrice: { type: Number, min: 0 },
  listPrice: { type: Number, min: 0 },
  cost: { type: Number, min: 0 },
  currency: { type: String, default: 'USD' },
  priceTiers: { type: [PricingTierSchema], default: [] },
  effectiveFrom: { type: Date, default: null },
  effectiveTo: { type: Date, default: null },
}, {
  timestamps: true,
});

ProductPricingSchema.index({ productId: 1 });

module.exports = mongoose.model('ProductPricing', ProductPricingSchema);
