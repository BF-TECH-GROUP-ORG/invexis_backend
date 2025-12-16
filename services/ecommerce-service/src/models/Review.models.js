const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
    productId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: String,
    isApproved: { type: Boolean, default: false },
    flagged: { type: Boolean, default: false },

    helpfulCount: { type: Number, default: 0 },
    metadata: mongoose.Schema.Types.Mixed,

    createdBy: String,
    updatedBy: String,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date
}, { timestamps: true });

ReviewSchema.index({ productId: 1, companyId: 1 });
ReviewSchema.index({ userId: 1 });

module.exports = mongoose.model('Review', ReviewSchema);
