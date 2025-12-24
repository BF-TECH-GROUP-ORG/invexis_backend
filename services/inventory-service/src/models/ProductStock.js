// models/ProductStock.js — OPTIMIZED SINGLE SOURCE OF TRUTH FOR ALL INVENTORY
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

  // ========== CORE STOCK TRACKING ==========
  stockQty: {
    type: Number,
    min: 0,
    default: 0,
    index: true // For fast stock queries
  },
  reservedQty: {
    type: Number,
    min: 0,
    default: 0
  },

  // Core tracking settings
  trackQuantity: { type: Boolean, default: true },
  allowBackorder: { type: Boolean, default: false },
  lowStockThreshold: { type: Number, default: 10, min: 0 },
  minReorderQty: { type: Number, default: 20, min: 1 },

  // Safety stock (for advanced forecasting)
  safetyStock: { type: Number, default: 0, min: 0 },

  // ========== OPTIMIZED FAST ACCESS FIELDS ==========
  availableQty: { type: Number, default: 0, min: 0, index: true }, // Computed and stored for speed
  inStock: { type: Boolean, default: false, index: true },     // Computed and stored for speed
  isLowStock: { type: Boolean, default: false, index: true },     // Computed and stored for speed

  // ========== FORECASTING FIELDS ==========
  avgDailySales: { type: Number, default: 0, min: 0 },           // Last 30 days rolling average
  stockoutRiskDays: { type: Number, default: 0, min: 0 },           // Projected days until stockout
  suggestedReorderQty: { type: Number, default: 0, min: 0 },         // Auto-calculated reorder qty
  lastRestockDate: { type: Date, default: null },                  // Last time stock was added
  supplierLeadDays: { type: Number, default: 7, min: 1 },           // Supplier lead time
  lastForecastUpdate: { type: Date, default: null },                 // When forecast was last calculated

  // ========== ANALYTICS TRACKING ==========
  totalUnitsSold: { type: Number, default: 0, min: 0 },           // Lifetime units sold
  totalRevenue: { type: Number, default: 0, min: 0 },           // Lifetime revenue from this SKU
  avgCost: { type: Number, default: 0, min: 0 },           // COGS per unit (average)
  // ========== PERFORMANCE OPTIMIZED INDEXES ==========
  profitMarginPercent: { type: Number, default: 0, min: 0, max: 100 } // Avg profit margin %
}, {
  timestamps: true,
  toJSON: {
    virtuals: true, transform: (doc, ret) => {
      // Include computed fields in JSON output
      ret.availableQty = ret.stockQty - ret.reservedQty;
      ret.inStock = ret.availableQty > 0;
      ret.isLowStock = ret.stockQty <= ret.lowStockThreshold;
      return ret;
    }
  }
});

/* -------------------------------------------------------------------------- */
/*                            OPTIMIZED INDEXES FOR SUPER FAST QUERIES        */
/* -------------------------------------------------------------------------- */

// UNIQUE INDEX: ONE RECORD PER (product + variation)
ProductStockSchema.index(
  { productId: 1, variationId: 1 },
  { unique: true }
);

// PERFORMANCE INDEXES
ProductStockSchema.index({ stockQty: 1, lowStockThreshold: 1 }); // Low stock alerts
ProductStockSchema.index({ inStock: 1, isLowStock: 1 });         // Stock status queries
ProductStockSchema.index({ productId: 1, inStock: 1 });          // Product availability
ProductStockSchema.index({ lastRestockDate: 1 });                // Restock analysis
ProductStockSchema.index({ lowStockThreshold: 1 });
ProductStockSchema.index({ allowBackorder: 1 });

/* -------------------------------------------------------------------------- */
/*                            PRE-SAVE: COMPUTE FAST ACCESS FIELDS            */
/* -------------------------------------------------------------------------- */
ProductStockSchema.pre('save', async function () {
  // Compute and store frequently accessed values for maximum speed
  this.availableQty = Math.max(0, this.stockQty - this.reservedQty);
  this.inStock = this.availableQty > 0;
  this.isLowStock = this.stockQty <= this.lowStockThreshold;

  // Update forecast if stock changed significantly
  if (this.isModified('stockQty')) {
    this.lastForecastUpdate = new Date();

    // Auto-calculate stockout risk
    if (this.avgDailySales > 0) {
      this.stockoutRiskDays = Math.floor(this.availableQty / this.avgDailySales);
    }
  }
});

/* -------------------------------------------------------------------------- */
/*                            STATIC METHODS FOR FAST QUERIES                 */
/* -------------------------------------------------------------------------- */
ProductStockSchema.statics.findLowStock = function (companyId) {
  return this.find({
    isLowStock: true,
    trackQuantity: true
  }).populate('productId', 'name sku companyId').exec();
};

ProductStockSchema.statics.findOutOfStock = function (companyId) {
  return this.find({
    inStock: false,
    trackQuantity: true
  }).populate('productId', 'name sku companyId').exec();
};

ProductStockSchema.statics.getStockSummary = function (productId, variationId = null) {
  const query = { productId };
  if (variationId) query.variationId = variationId;

  return this.findOne(query).lean().exec();
};

module.exports = mongoose.model('ProductStock', ProductStockSchema);