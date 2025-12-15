const Catalog = require('../models/Catalog.models');
const mongoose = require('mongoose');

/**
 * Fields to always select for optimal performance
 * Excludes large arrays and heavy objects when not needed
 */
const FAST_FIELDS = {
    full: undefined, // Selects all fields
    list: {
        productId: 1,
        companyId: 1,
        shopId: 1,
        name: 1,
        slug: 1,
        images: 1,
        basePrice: 1,
        salePrice: 1,
        currency: 1,
        stockQty: 1,
        availability: 1,
        featured: 1,
        reviewSummary: 1,
        categoryId: 1,
        status: 1,
        visibility: 1
    },
    summary: {
        productId: 1,
        name: 1,
        slug: 1,
        basePrice: 1,
        salePrice: 1,
        featured: 1,
        availability: 1
    }
};

class CatalogRepository {
    /**
     * Find single product by ID - ULTRA FAST (<1ms with index)
     * Uses index: idx_productId
     */
    async findByProductId(productId, fields = FAST_FIELDS.full) {
        const query = { isDeleted: { $ne: true } };

        if (mongoose.Types.ObjectId.isValid(productId)) {
            query.$or = [
                { productId: productId },
                { _id: productId }
            ];
        } else {
            query.productId = productId;
        }

        return Catalog.findOne(query, fields).lean().exec();
    }

    /**
     * Find single product by slug - ULTRA FAST (<1ms with index)
     * Uses index: idx_slug
     */
    async findBySlug(slug, fields = FAST_FIELDS.full) {
        return Catalog.findOne(
            { slug, isDeleted: { $ne: true } },
            fields
        ).lean().exec();
    }

    /**
     * Find single product by barcode - ULTRA FAST (<1ms with index)
     * Uses index: idx_barcode
     */
    async findByBarcode(barcode, fields = FAST_FIELDS.full) {
        return Catalog.findOne(
            { barcode, isDeleted: { $ne: true } },
            fields
        ).lean().exec();
    }

    /**
     * Find single product by SKU and company - ULTRA FAST (<1ms with compound index)
     * Uses index: idx_sku_company
     */
    async findBySKU(sku, companyId, fields = FAST_FIELDS.full) {
        return Catalog.findOne(
            { sku: sku.toUpperCase(), companyId, isDeleted: { $ne: true } },
            fields
        ).lean().exec();
    }

    /**
     * Search products with filtering - SUPER FAST (<5ms with proper indexes)
     * Automatically uses best index based on query
     * Uses indexes: idx_deleted_company_status, idx_deleted_status_visibility, etc.
     */
    async search(query = {}, opts = {}) {
        const q = { isDeleted: { $ne: true }, ...query };
        const limit = Math.min(parseInt(opts.limit || 20, 10), 100); // Max 100 per page
        const page = Math.max(parseInt(opts.page || 1, 10), 1);
        const sort = opts.sort || { featured: -1 };
        const fields = opts.fields || FAST_FIELDS.list;

        return Catalog.find(q, fields)
            .sort(sort)
            .limit(limit)
            .skip((page - 1) * limit)
            .lean()
            .exec();
    }

    /**
     * Count matching products - ULTRA FAST with indexes
     */
    async count(query = {}) {
        const q = { isDeleted: { $ne: true }, ...query };
        return Catalog.countDocuments(q).exec();
    }

    /**
     * Full-text search - FAST (<20ms with text index)
     * Uses index: idx_text_search
     */
    async textSearch(keyword, companyId, opts = {}) {
        const q = {
            isDeleted: { $ne: true },
            $text: { $search: keyword },
            ...(companyId && { companyId })
        };

        const limit = Math.min(parseInt(opts.limit || 20, 10), 100);
        const page = Math.max(parseInt(opts.page || 1, 10), 1);
        const fields = opts.fields || FAST_FIELDS.list;

        return Catalog.find(q, fields)
            .sort({ score: { $meta: "textScore" } })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean()
            .exec();
    }

    /**
     * Get featured products per company - SUPER FAST (<2ms with compound index)
     * Uses index: idx_company_featured_status
     */
    async getFeaturedProducts(companyId, limit = 10) {
        return Catalog.find(
            { companyId, featured: true, status: 'active', isDeleted: { $ne: true } },
            FAST_FIELDS.list
        )
            .sort({ createdAt: -1 })
            .limit(Math.min(limit, 100))
            .lean()
            .exec();
    }

    /**
     * Get products by category - SUPER FAST (<2ms with compound index)
     * Uses index: idx_category_company_status
     */
    async getByCategory(categoryId, companyId, opts = {}) {
        const q = {
            categoryId,
            companyId,
            status: 'active',
            isDeleted: { $ne: true }
        };

        const limit = Math.min(parseInt(opts.limit || 20, 10), 100);
        const page = Math.max(parseInt(opts.page || 1, 10), 1);

        return Catalog.find(q, FAST_FIELDS.list)
            .sort({ featured: -1, createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean()
            .exec();
    }

    /**
     * Get available products (in stock) - SUPER FAST (<2ms with compound index)
     */
    async getAvailable(companyId, opts = {}) {
        const q = {
            companyId,
            availability: { $ne: 'out_of_stock' },
            status: 'active',
            isDeleted: { $ne: true }
        };

        const limit = Math.min(parseInt(opts.limit || 20, 10), 100);
        const page = Math.max(parseInt(opts.page || 1, 10), 1);

        return Catalog.find(q, FAST_FIELDS.list)
            .sort({ featured: -1, createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean()
            .exec();
    }

    /**
     * Get recently updated products - SUPER FAST (<2ms with timestamp index)
     * Uses index: idx_updatedAt_desc
     */
    async getRecent(companyId, limit = 20) {
        return Catalog.find(
            { companyId, status: 'active', isDeleted: { $ne: true } },
            FAST_FIELDS.list
        )
            .sort({ updatedAt: -1 })
            .limit(Math.min(limit, 100))
            .lean()
            .exec();
    }

    /**
     * Bulk check availability - OPTIMIZED for cart validation
     * Use for checking multiple product IDs at once
     */
    async checkAvailability(productIds = []) {
        return Catalog.find(
            { productId: { $in: productIds }, isDeleted: { $ne: true } },
            { productId: 1, availability: 1, stockQty: 1, totalStock: 1 }
        )
            .lean()
            .exec();
    }

    /**
     * Create new product
     */
    async create(data) {
        const c = new Catalog({
            ...data,
            isDeleted: false
        });
        return c.save();
    }

    /**
     * Update product - FAST with indexed lookup
     */
    async update(productId, patch) {
        return Catalog.findOneAndUpdate(
            { productId, isDeleted: { $ne: true } },
            { $set: patch },
            { new: true, lean: true }
        ).exec();
    }

    /**
     * Soft delete product - FAST with indexed lookup
     */
    async softDelete(productId) {
        return Catalog.findOneAndUpdate(
            { productId },
            { $set: { isDeleted: true, status: 'discontinued' } },
            { new: true, lean: true }
        ).exec();
    }

    /**
     * Bulk update products - OPTIMIZED for inventory sync
     */
    async bulkUpdate(updates = []) {
        const bulkOps = updates.map(u => ({
            updateOne: {
                filter: { productId: u.productId, isDeleted: { $ne: true } },
                update: { $set: u.patch }
            }
        }));

        return Catalog.bulkWrite(bulkOps);
    }
}

module.exports = new CatalogRepository();
