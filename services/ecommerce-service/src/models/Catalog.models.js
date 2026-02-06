/**
 * E-Commerce Catalog Product Model
 * 
 * CRITICAL INFO ONLY - Synced from Inventory Service
 * Designed to work independently if inventory service is down
 * Keeps only essential fields needed for storefront operations
 */

const mongoose = require("mongoose");
const Money = require("/app/shared/utils/MoneyUtil");


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
                price: {
                    type: Number,
                    min: 0,
                    get: v => Money.toMajor(v),
                    set: v => Money.toMinor(v)
                },
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
            min: 0,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
        },
        salePrice: {
            type: Number,
            min: 0,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
        },
        currency: {
            type: String,
            default: "USD"
        },
        price: {
            type: Number,
            required: true,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
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
        },

        // ===== SOFT DELETE =====
        isDeleted: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    {
        timestamps: true,
        strict: true,
        collection: "catalog_products",
        toJSON: { getters: true, virtuals: true },
        toObject: { getters: true, virtuals: true }
    }
);

// ===== INDEXES FOR ULTRA-FAST QUERIES (<1ms) =====
// Compound indexes optimized for common query patterns
CatalogProductSchema.index({ isDeleted: 1, companyId: 1, status: 1 }, { background: true, name: 'idx_deleted_company_status' }); // Most common
CatalogProductSchema.index({ isDeleted: 1, status: 1, visibility: 1 }, { background: true, name: 'idx_deleted_status_visibility' }); // Public products
CatalogProductSchema.index({ companyId: 1, featured: 1, status: 1 }, { background: true, name: 'idx_company_featured_status' }); // Featured products
CatalogProductSchema.index({ categoryId: 1, companyId: 1, status: 1 }, { background: true, name: 'idx_category_company_status' }); // Category browsing
CatalogProductSchema.index({ productId: 1 }, { unique: true, sparse: true, name: 'idx_productId' }); // Unique lookup
CatalogProductSchema.index({ slug: 1 }, { unique: true, sparse: true, name: 'idx_slug' }); // URL-friendly lookup
CatalogProductSchema.index({ sku: 1, companyId: 1 }, { sparse: true, name: 'idx_sku_company' }); // SKU lookup per company
CatalogProductSchema.index({ barcode: 1 }, { sparse: true, name: 'idx_barcode' }); // Barcode scan

// Single field indexes for filtering
CatalogProductSchema.index({ companyId: 1 }, { background: true, name: 'idx_companyId' });
CatalogProductSchema.index({ shopId: 1 }, { sparse: true, background: true, name: 'idx_shopId' });
CatalogProductSchema.index({ availability: 1 }, { background: true, name: 'idx_availability' });
CatalogProductSchema.index({ featured: 1 }, { background: true, name: 'idx_featured' });
CatalogProductSchema.index({ isActive: 1 }, { background: true, name: 'idx_isActive' });

// Text search index (separate for full-text search queries)
CatalogProductSchema.index({ name: "text", "description.long": "text", bulletPoints: "text" }, { background: true, name: 'idx_text_search', weights: { name: 10, "description.long": 5, bulletPoints: 3 } });

// Timestamp indexes for sorted queries
CatalogProductSchema.index({ createdAt: -1 }, { background: true, name: 'idx_createdAt_desc' });
CatalogProductSchema.index({ updatedAt: -1 }, { background: true, name: 'idx_updatedAt_desc' });
CatalogProductSchema.index({ lastSyncedAt: -1 }, { background: true, name: 'idx_lastSyncedAt_desc' });

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

    // Handle category - inventory sends 'category' as ObjectId, we need 'categoryId' as string
    if (inventoryData.categoryId) {
        this.categoryId = inventoryData.categoryId;
    } else if (inventoryData.category) {
        // Convert ObjectId to string
        this.categoryId = inventoryData.category._id
            ? inventoryData.category._id.toString()
            : inventoryData.category.toString();
    }

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
