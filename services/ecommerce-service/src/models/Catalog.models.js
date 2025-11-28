/**
 * E-Commerce Catalog Product Model
 * 
 * CRITICAL INFO ONLY - Synced from Inventory Service
 * Designed to work independently if inventory service is down
 * Keeps only essential fields needed for storefront operations
 */

const mongoose = require("mongoose");


const CatalogProductSchema = new mongoose.Schema(
    {
        // ===== SYNC REFERENCES (From Inventory) =====
        productId: {
            type: String,
            required: true,
            index: true,
            unique: true
        },
        companyId: {
            type: String,
            required: true,
            index: true
        },
        shopId: {
            type: String,
            index: true
        },

        // ===== IDENTIFIERS (Critical for fulfillment & operations) =====
        sku: {
            type: String,
            uppercase: true,
            trim: true,
            sparse: true
        },
        barcode: {
            type: String,
            sparse: true,
            trim: true
        },
        qrCode: {
            type: String
        },
        scanId: {
            type: String,
            sparse: true
        },

        // ===== BASIC INFO (Critical for display) =====
        name: {
            type: String,
            required: true,
            maxlength: 200,
            trim: true,
            index: true
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            index: true,
            trim: true
        },

        // ===== DESCRIPTIONS (Critical for storefront) =====
        description: {
            short: {
                type: String,
                maxlength: 250
            },
            long: {
                type: String,
                maxlength: 5000
            }
        },
        bulletPoints: [{
            type: String,
            trim: true
        }],

        // ===== MEDIA (Critical for display) =====
        images: [
            {
                url: { type: String, required: true, trim: true },
                alt: { type: String, trim: true },
                isPrimary: { type: Boolean, default: false },
                sortOrder: { type: Number, default: 0 }
            }
        ],
        videoUrls: [{
            type: String,
            trim: true
        }],

        // ===== VARIANTS & VARIATIONS (Critical for options/SKUs) =====
        variants: [
            {
                name: { type: String, trim: true },
                options: [{ type: String, trim: true }]
            }
        ],
        variations: [
            {
                attributes: [
                    {
                        name: String,
                        value: mongoose.Schema.Types.Mixed
                    }
                ],
                sku: { type: String, uppercase: true, trim: true },
                stockQty: { type: Number, default: 0, min: 0 },
                price: { type: Number, min: 0 },
                images: [
                    {
                        url: { type: String, trim: true },
                        alt: { type: String, trim: true },
                        isPrimary: { type: Boolean, default: false }
                    }
                ]
            }
        ],

        // ===== CATEGORY (Critical for browsing) =====
        categoryId: {
            type: String,
            index: true
        },

        // ===== PRICING (Critical for checkout) =====
        basePrice: {
            type: Number,
            required: true,
            min: 0
        },
        salePrice: {
            type: Number,
            min: 0
        },
        currency: {
            type: String,
            default: "USD"
        },
        price: {
            type: Number,
            required: true
        },

        // ===== INVENTORY (Critical for cart/checkout) =====
        stockQty: {
            type: Number,
            default: 0,
            min: 0
        },
        availability: {
            type: String,
            enum: ["in_stock", "out_of_stock", "limited", "scheduled"],
            default: "in_stock",
            index: true
        },

        // ===== STATUS (Critical for visibility) =====
        status: {
            type: String,
            enum: ["draft", "active", "inactive", "discontinued"],
            default: "active",
            index: true
        },
        visibility: {
            type: String,
            enum: ["public", "private", "hidden"],
            default: "public",
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        featured: {
            type: Boolean,
            default: false,
            index: true
        },

        // ===== ECOMMERCE-ONLY FIELDS (Not from inventory) =====
        // Promotions - Managed separately in ecommerce
        relatedPromotionIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Promotion"
        }],

        // Banners - Managed separately in ecommerce
        relatedBannerIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Banner"
        }],

        // Reviews - Aggregated from ecommerce reviews
        reviewSummary: {
            averageRating: { type: Number, default: 0, min: 0, max: 5 },
            totalReviews: { type: Number, default: 0, min: 0 },
            ratingBreakdown: {
                five: { type: Number, default: 0 },
                four: { type: Number, default: 0 },
                three: { type: Number, default: 0 },
                two: { type: Number, default: 0 },
                one: { type: Number, default: 0 }
            }
        },

        // ===== SYNC METADATA (Ecommerce-managed) =====
        lastSyncedAt: {
            type: Date,
            default: Date.now
        },
        syncStatus: {
            type: String,
            enum: ["synced", "pending", "failed"],
            default: "synced"
        },
        lastUpdatedFrom: {
            type: String,
            enum: ["inventory", "ecommerce"],
            default: "inventory"
        }
    },
    {
        timestamps: true,
        strict: true,
        collection: "catalog_products"
    }
);

// ===== INDEXES FOR PERFORMANCE =====
CatalogProductSchema.index({ companyId: 1, status: 1, visibility: 1 });
CatalogProductSchema.index({ companyId: 1, featured: 1 });
CatalogProductSchema.index({ categoryId: 1, status: 1 });
CatalogProductSchema.index({ sku: 1, companyId: 1 });
CatalogProductSchema.index({ name: "text", description: "text" });

// ===== VIRTUALS =====
CatalogProductSchema.virtual("effectivePrice").get(function () {
    return this.salePrice || this.basePrice || this.price;
});

CatalogProductSchema.virtual("isOnSale").get(function () {
    return this.salePrice && this.salePrice < this.basePrice;
});

CatalogProductSchema.virtual("discountPercent").get(function () {
    if (!this.isOnSale) return 0;
    return Math.round(((this.basePrice - this.salePrice) / this.basePrice) * 100);
});

CatalogProductSchema.virtual("totalStock").get(function () {
    if (this.variations && this.variations.length > 0) {
        return this.variations.reduce((sum, v) => sum + (v.stockQty || 0), 0);
    }
    return this.stockQty || 0;
});

CatalogProductSchema.virtual("isAvailable").get(function () {
    return (
        this.status === "active" &&
        this.visibility === "public" &&
        this.isActive &&
        this.availability !== "out_of_stock"
    );
});

// ===== METHODS =====

/**
 * Check if product can be purchased
 */
CatalogProductSchema.methods.canBePurchased = function () {
    return (
        this.isAvailable &&
        (this.totalStock > 0 || this.availability === "scheduled")
    );
};

/**
 * Update from Inventory Service event payload
 * Only updates inventory-sourced fields, preserves ecommerce-only data
 */
CatalogProductSchema.methods.updateFromInventory = function (inventoryData) {
    // Map inventory fields to catalog fields
    if (inventoryData.sku) this.sku = inventoryData.sku;
    if (inventoryData.barcode) this.barcode = inventoryData.barcode;
    if (inventoryData.qrCode) this.qrCode = inventoryData.qrCode;
    if (inventoryData.scanId) this.scanId = inventoryData.scanId;

    if (inventoryData.name) this.name = inventoryData.name;
    if (inventoryData.slug) this.slug = inventoryData.slug;
    if (inventoryData.description) this.description = inventoryData.description;
    if (inventoryData.bulletPoints) this.bulletPoints = inventoryData.bulletPoints;

    if (inventoryData.images) this.images = inventoryData.images;
    if (inventoryData.videoUrls) this.videoUrls = inventoryData.videoUrls;

    if (inventoryData.variants) this.variants = inventoryData.variants;
    if (inventoryData.variations) this.variations = inventoryData.variations;

    if (inventoryData.categoryId) this.categoryId = inventoryData.categoryId;

    // Pricing
    if (inventoryData.pricing?.basePrice) {
        this.basePrice = inventoryData.pricing.basePrice;
        this.price = inventoryData.pricing.basePrice; // Keep in sync
    }
    if (inventoryData.pricing?.salePrice) this.salePrice = inventoryData.pricing.salePrice;
    if (inventoryData.pricing?.currency) this.currency = inventoryData.pricing.currency;

    // Inventory
    if (inventoryData.inventory?.quantity !== undefined) {
        this.stockQty = inventoryData.inventory.quantity;
    }
    if (inventoryData.availability) this.availability = inventoryData.availability;

    // Status
    if (inventoryData.status) this.status = inventoryData.status;
    if (inventoryData.visibility) this.visibility = inventoryData.visibility;
    if (inventoryData.isActive !== undefined) this.isActive = inventoryData.isActive;
    if (inventoryData.featured !== undefined) this.featured = inventoryData.featured;

    // Update tracking
    this.lastSyncedAt = new Date();
    this.syncStatus = "synced";
    this.lastUpdatedFrom = "inventory";

    return this;
};

/**
 * Update review summary (ecommerce-only operation)
 */
CatalogProductSchema.methods.updateReviewSummary = function (summary) {
    this.reviewSummary = {
        averageRating: summary.averageRating || 0,
        totalReviews: summary.totalReviews || 0,
        ratingBreakdown: summary.ratingBreakdown || {}
    };
    this.lastUpdatedFrom = "ecommerce";
    return this.save();
};

/**
 * Add promotion link (ecommerce-only operation)
 */
CatalogProductSchema.methods.addPromotion = function (promotionId) {
    if (!this.relatedPromotionIds.includes(promotionId)) {
        this.relatedPromotionIds.push(promotionId);
        this.lastUpdatedFrom = "ecommerce";
    }
    return this;
};

/**
 * Remove promotion link (ecommerce-only operation)
 */
CatalogProductSchema.methods.removePromotion = function (promotionId) {
    this.relatedPromotionIds = this.relatedPromotionIds.filter(
        id => id.toString() !== promotionId.toString()
    );
    this.lastUpdatedFrom = "ecommerce";
    return this;
};

module.exports = mongoose.model("CatalogProduct", CatalogProductSchema);
