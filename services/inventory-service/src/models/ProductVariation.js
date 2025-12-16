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

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS — Computed properties for API responses (stock data from ProductStock)
// ─────────────────────────────────────────────────────────────────────────────
ProductVariationSchema.virtual('stock', {
  ref: 'ProductStock',
  localField: '_id',
  foreignField: 'variationId',
  justOne: true
});

ProductVariationSchema.virtual('optionString').get(function () {
  return Array.from(this.options.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join(' • ');
});

module.exports = mongoose.model('ProductVariation', ProductVariationSchema);