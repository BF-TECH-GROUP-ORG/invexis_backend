const mongoose = require('mongoose');
const { Schema } = mongoose;

const stocktakeSchema = new Schema({
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: {
        type: String,
        enum: ['draft', 'in_progress', 'completed', 'cancelled'],
        default: 'draft'
    },
    createdBy: { type: String, required: true },
    completedBy: { type: String, default: null },
    completedAt: { type: Date, default: null },

    // Summary fields calculated upon completion
    totalExpectedValue: { type: Number, default: 0 },
    totalActualValue: { type: Number, default: 0 },
    totalDiscrepancyValue: { type: Number, default: 0 }, // Financial loss (or gain)
    itemsCounted: { type: Number, default: 0 },
    itemsWithDiscrepancy: { type: Number, default: 0 },

    notes: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed }
}, {
    timestamps: true
});

stocktakeSchema.index({ companyId: 1, status: 1 });
stocktakeSchema.index({ companyId: 1, shopId: 1, createdAt: -1 });

module.exports = mongoose.model('Stocktake', stocktakeSchema);
