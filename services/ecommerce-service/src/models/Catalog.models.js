// models/CatalogProduct.js
const mongoose = require("mongoose");

const CatalogProductSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true, index: true }, // Inventory product ID
        companyId: { type: String, required: true, index: true },

        // Basic info snapshots for display
        name: { type: String, required: true },
        slug: { type: String, required: true },
        shortDescription: { type: String },
        price: { type: Number, required: true },
        currency: { type: String, default: "USD" },
        salePrice: { type: Number },
        featured: { type: Boolean, default: false },
        images: [{ url: String, alt: String, isPrimary: Boolean, sortOrder: Number }],

        // Product visibility and status
        status: {
            type: String,
            enum: ["active", "inactive", "archived"],
            default: "active",
            index: true,
        },
        visibility: {
            type: String,
            enum: ["public", "private", "unlisted"],
            default: "public",
            index: true,
        },

        // Categorization (copied from inventory)
        categoryId: { type: String },
        subcategoryId: { type: String },
        subSubcategoryId: { type: String },

        // Inventory snapshot
        stockQty: { type: Number, default: 0 },
        availability: {
            type: String,
            enum: ["in_stock", "out_of_stock", "low_stock", "backorder", "scheduled"],
            default: "in_stock",
        },

        // Promotions & featured banners
        relatedPromotionIds: [{ type: String }],
        relatedBannerIds: [{ type: String }],

        metadata: { type: mongoose.Schema.Types.Mixed }, // Any additional info

        // Auditing
        createdBy: { type: String },
        updatedBy: { type: String },
    },
    { timestamps: true }
);

// Index for fast queries
CatalogProductSchema.index({ companyId: 1, status: 1, visibility: 1 });
CatalogProductSchema.index({ productId: 1 });
CatalogProductSchema.index({ featured: 1, price: 1 });

// Methods
CatalogProductSchema.methods.isAvailable = function () {
    return this.status === "active" && this.visibility === "public" && this.stockQty > 0;
};

module.exports = mongoose.model("CatalogProduct", CatalogProductSchema);
