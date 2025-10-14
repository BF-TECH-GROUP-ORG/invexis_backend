// models/Review.js
const mongoose = require('mongoose');
const ReviewSchema = new mongoose.Schema({
    reviewId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    companyId: { type: String, required: true },

    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },

    isApproved: { type: Boolean, default: false, index: true }, // moderation flow
    flagged: { type: Boolean, default: false },

    createdBy: { type: String },
    updatedBy: { type: String },

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);
