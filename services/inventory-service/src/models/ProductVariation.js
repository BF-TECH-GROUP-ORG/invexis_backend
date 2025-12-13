// models/ProductVariation.js
// FINAL VERSION — Lean & Clean (only variant-specific data)
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductVariationSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },

    // Variant-specific option combinations (e.g., color=Black, size=XL)
    options: {
      type: Map,
      of: String,
      required: true,
    },

    // Variant-specific SKU/barcode
    sku: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },

    // Physical attributes (variant-specific)
    weight: {
      value: Number,
      unit: { type: String, enum: ["kg", "g", "lb", "oz"], default: "kg" },
    },

    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: { type: String, enum: ["cm", "in", "m"], default: "cm" },
    },

    // STOCK QUANTITY ONLY - everything else in ProductStock
    stockQty: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Reserved quantity for carts/orders
    reservedQty: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Active/Inactive status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// INDEXES — Optimized for queries
// ─────────────────────────────────────────────────────────────────────────────
// Prevent duplicate variations for same product with same options
ProductVariationSchema.index({ productId: 1, options: 1 }, { unique: true, sparse: true });

ProductVariationSchema.index({ productId: 1, isActive: 1 });
ProductVariationSchema.index({ sku: 1 });
ProductVariationSchema.index({ stockQty: 1, isActive: 1 }); // For low-stock alerts

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS — Computed properties for API responses
// ─────────────────────────────────────────────────────────────────────────────
ProductVariationSchema.virtual('availableStock').get(function () {
  return this.stockQty - this.reservedQty;
});

ProductVariationSchema.virtual('inStock').get(function () {
  return this.availableStock > 0;
});

ProductVariationSchema.virtual('optionString').get(function () {
  return Array.from(this.options.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join(' • ');
});

module.exports = mongoose.model('ProductVariation', ProductVariationSchema);