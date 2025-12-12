// models/ProductVariation.js
// FINAL VERSION — DO NOT CHANGE EVER AGAIN
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

    // Only what actually changes per variant
    options: {
      type: Map,
      of: String,
      required: true,
    },
    // Example: { color: "Black", size: "XL", material: "Cotton", storage: "256GB" }

    price: {
      type: Number,
      required: true,
      min: 0,
    },
    compareAtPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    cost: {
      type: Number,
      min: 0,
      default: 0,
    }, // COGS — for profit reports

    stockQty: {
      type: Number,
      min: 0,
      default: 0,
    },
    reservedQty: {
      type: Number,
      min: 0,
      default: 0,
    }, // For cart/order holds

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
// COMPOUND INDEXES — Optimized for 99% of real queries
// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASE: Prevent duplicate variations for same product with same options
ProductVariationSchema.index({ productId: 1, options: 1 }, { unique: true, sparse: true });

ProductVariationSchema.index({ productId: 1, isActive: 1 });
ProductVariationSchema.index({ productId: 1, 'options.color': 1 });
ProductVariationSchema.index({ productId: 1, 'options.size': 1 });
ProductVariationSchema.index({ productId: 1, 'options.storage': 1 });

// For low-stock alerts & analytics
ProductVariationSchema.index({ stockQty: 1, isActive: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS — Clean frontend display
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

// Example: "color: Black • size: XL • material: Cotton"

module.exports = mongoose.model('ProductVariation', ProductVariationSchema);