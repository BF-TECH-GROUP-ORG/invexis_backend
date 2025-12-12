// models/ProductSpecs.js  ← NEW & FINAL
const mongoose = require("mongoose")
const { Schema } = mongoose;

const ProductSpecsSchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  l2Category: { type: String, index: true }, // e.g., "Phones & Tablets"

  specs: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

ProductSpecsSchema.index({ 'specs': 1 });
ProductSpecsSchema.index({ l2Category: 1 });

module.exports = mongoose.model('ProductSpecs', ProductSpecsSchema);