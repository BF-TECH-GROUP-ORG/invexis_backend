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

  // ========== MARGIN CALCULATIONS ==========
  marginAmount: { type: Number, default: 0 },           // basePrice - cost
  marginPercent: { type: Number, default: 0, min: 0, max: 100 }, // (marginAmount / basePrice) * 100
  saleMarginAmount: { type: Number, default: 0 },       // salePrice - cost (if on sale)
  saleMarginPercent: { type: Number, default: 0 },      // Sale margin percentage

  // ========== PROFITABILITY TRACKING ==========
  profitRank: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' }, // Ranked by margin%
  unitsSoldLastMonth: { type: Number, default: 0, min: 0 },
  revenue: { type: Number, default: 0, min: 0 },        // Total revenue (units * price)
  profit: { type: Number, default: 0 },                 // Total profit (units * marginAmount)

  // ========== PRICE CHANGE HISTORY ==========
  previousBasePrice: { type: Number, default: null },
  priceChangedAt: { type: Date, default: null },
  priceChangeReason: { type: String, default: null }    // 'seasonal', 'competitor_match', 'clearance', etc.
}, {
  timestamps: true,
});

ProductPricingSchema.index({ productId: 1 });

// Compute margin fields before save for analytics
ProductPricingSchema.pre('save', function(next) {
  try {
    const bp = this.basePrice || 0;
    const cost = this.cost || 0;
    this.marginAmount = Math.max(0, bp - cost);
    this.marginPercent = bp > 0 ? Number(((this.marginAmount / bp) * 100).toFixed(2)) : 0;
    next();
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/*         PRE-SAVE: VALIDATE & CALCULATE MARGIN & PROFIT METRICS              */
/* -------------------------------------------------------------------------- */
ProductPricingSchema.pre('save', function(next) {
  // Validate cost is not higher than basePrice
  if (this.cost > this.basePrice) {
    return next(new Error('Cost cannot exceed basePrice'));
  }

  // Calculate margin amount
  this.marginAmount = Math.max(0, this.basePrice - (this.cost || 0));

  // Calculate margin percent
  if (this.basePrice > 0) {
    this.marginPercent = (this.marginAmount / this.basePrice) * 100;
  } else {
    this.marginPercent = 0;
  }

  // Calculate sale margin if salePrice exists
  if (this.salePrice && this.salePrice > 0) {
    this.saleMarginAmount = Math.max(0, this.salePrice - (this.cost || 0));
    if (this.salePrice > 0) {
      this.saleMarginPercent = (this.saleMarginAmount / this.salePrice) * 100;
    }
  }

  // Rank profitability
  if (this.marginPercent >= 50) {
    this.profitRank = 'high';
  } else if (this.marginPercent >= 25) {
    this.profitRank = 'medium';
  } else {
    this.profitRank = 'low';
  }

  // Calculate total profit if units sold is tracked
  if (this.unitsSoldLastMonth > 0) {
    this.profit = this.unitsSoldLastMonth * this.marginAmount;
    this.revenue = this.unitsSoldLastMonth * this.basePrice;
  }

  // Track price change
  if (this.isModified('basePrice') && this.previousBasePrice === null) {
    this.previousBasePrice = this.basePrice;
  } else if (this.isModified('basePrice') && this.previousBasePrice !== this.basePrice) {
    this.previousBasePrice = this.basePrice;
    this.priceChangedAt = new Date();
  }

  next();
});

module.exports = mongoose.model('ProductPricing', ProductPricingSchema);