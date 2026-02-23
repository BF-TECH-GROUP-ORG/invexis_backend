const mongoose = require('mongoose');
const { Schema } = mongoose;

const stocktakeLineSchema = new Schema({
    stocktakeId: { type: Schema.Types.ObjectId, ref: 'Stocktake', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String },
    variationId: { type: Schema.Types.ObjectId, default: null },

    expectedQty: { type: Number, required: true }, // Current system stock
    actualQty: { type: Number, default: 0 },       // Manually counted stock
    discrepancy: { type: Number, default: 0 },      // actual - expected

    unitCost: { type: Number, default: 0 },
    discrepancyValue: { type: Number, default: 0 }, // discrepancy * unitCost

    reason: {
        type: String,
        enum: ['damage', 'theft', 'count_error', 'loss', 'gain', 'expired', 'none'],
        default: 'none'
    },
    note: { type: String, trim: true },
    isCounted: { type: Boolean, default: false }
}, {
    timestamps: true
});

stocktakeLineSchema.index({ stocktakeId: 1, productId: 1 });

module.exports = mongoose.model('StocktakeLine', stocktakeLineSchema);
