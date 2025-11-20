// models/Promotion.js
const mongoose = require("mongoose");

const PromotionSchema = new mongoose.Schema(
    {
        promotionId: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        code: { type: String },
        discountType: { type: String, enum: ["percentage", "fixed", "free_shipping"], required: true },
        discountValue: { type: Number, required: true },
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        relatedProductIds: [{ type: String }],
        status: { type: String, enum: ["active", "expired", "disabled"], default: "active" },
        visibility: { type: String, enum: ["public", "private", "unlisted"], default: "public" },
        createdBy: { type: String },
        updatedBy: { type: String },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Promotion", PromotionSchema);
