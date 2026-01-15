const mongoose = require('mongoose');

const ProductRegistrySchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    sku: { type: String },
    unitCost: { type: Number, default: 0 },
    category: { type: String },
    active: { type: Boolean, default: true }
}, { timestamps: true });

ProductRegistrySchema.index({ companyId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('ProductRegistry', ProductRegistrySchema);
