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
  
  stockQty: {
      type: Number,
      min: 0,
      default: 0,
    },
  // Core tracking settings
  trackQuantity:     { type: Boolean, default: true },
  allowBackorder:    { type: Boolean, default: false },
  lowStockThreshold: { type: Number, default: 10, min: 0 },
  minReorderQty:     { type: Number, default: 20, min: 1 },

  // Safety stock (for advanced forecasting)
  safetyStock:       { type: Number, default: 0, min: 0 },

  // ========== FORECASTING FIELDS ==========
  avgDailySales:     { type: Number, default: 0, min: 0 },           // Last 30 days rolling average
  stockoutRiskDays:  { type: Number, default: 0, min: 0 },           // Projected days until stockout
  suggestedReorderQty: { type: Number, default: 0, min: 0 },         // Auto-calculated reorder qty
  lastRestockDate:   { type: Date, default: null },                  // Last time stock was added
  supplierLeadDays:  { type: Number, default: 7, min: 1 },           // Supplier lead time
  lastForecastUpdate: { type: Date, default: null },                 // When forecast was last calculated

  // ========== ANALYTICS TRACKING ==========
  totalUnitsSold:    { type: Number, default: 0, min: 0 },           // Lifetime units sold
  totalRevenue:      { type: Number, default: 0, min: 0 },           // Lifetime revenue from this SKU
  avgCost:           { type: Number, default: 0, min: 0 },           // COGS per unit (average)
  profitMarginPercent: { type: Number, default: 0, min: 0, max: 100 } // Avg profit margin %
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
/*              VIRTUAL: AVAILABLE QUANTITY (currentStock - safety)             */
/* -------------------------------------------------------------------------- */
ProductStockSchema.virtual('availableQty').get(async function() {
  const current = await this.currentStock;
  return Math.max(0, current - this.safetyStock);
});

/* -------------------------------------------------------------------------- */
/*           VIRTUAL: DAYS OF INVENTORY REMAINING (forecast)                   */
/* -------------------------------------------------------------------------- */
ProductStockSchema.virtual('daysOfInventory').get(async function() {
  if (this.avgDailySales <= 0) return null; // Can't forecast if no sales
  const available = await this.availableQty;
  return Math.ceil(available / this.avgDailySales);
});

/* -------------------------------------------------------------------------- */
/*          PRE-SAVE: VALIDATE FORECASTING FIELDS & CALCULATE RISK              */
/* -------------------------------------------------------------------------- */
ProductStockSchema.pre('save', function(next) {
  // Validate consistency
  if (this.minReorderQty < 1) {
    return next(new Error('minReorderQty must be at least 1'));
  }
  if (this.lowStockThreshold < 0) {
    return next(new Error('lowStockThreshold cannot be negative'));
  }
  if (this.supplierLeadDays < 1) {
    return next(new Error('supplierLeadDays must be at least 1'));
  }

  // Auto-calculate suggestedReorderQty if avgDailySales is set
  if (this.avgDailySales > 0 && this.supplierLeadDays > 0) {
    const demandDuringLead = this.avgDailySales * this.supplierLeadDays;
    this.suggestedReorderQty = Math.ceil(demandDuringLead + this.safetyStock);
  }

  // Calculate stockoutRiskDays
  if (this.avgDailySales > 0) {
    const current = this.currentStock || 0;
    const available = Math.max(0, current - this.safetyStock);
    this.stockoutRiskDays = available > 0 ? Math.ceil(available / this.avgDailySales) : 0;
  }

  next();
});

/* -------------------------------------------------------------------------- */
/*                            INDEXES FOR ALERTS & REPORTS                     */
/* -------------------------------------------------------------------------- */
ProductStockSchema.index({ lowStockThreshold: 1 });
ProductStockSchema.index({ allowBackorder: 1 });

module.exports = mongoose.model('ProductStock', ProductStockSchema);