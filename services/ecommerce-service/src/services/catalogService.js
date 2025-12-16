const { CatalogRepository } = require('../repositories');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

/**
 * Find single product by ID with caching
 * Cache TTL: 30 minutes
 * Query speed: <1ms with index
 */
async function findByProductId(productId) {
    const cacheKey = `catalog:product:${productId}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: ${cacheKey}`);
        return cached;
    }

    console.log(`🔍 DB QUERY: findByProductId(${productId})`);
    const p = await CatalogRepository.findByProductId(productId);

    if (p) {
        await cache.setJSON(cacheKey, p, 1800); // 30 min TTL
        console.log(`💾 CACHED: ${cacheKey}`);
    }

    return p;
}

/**
 * Find product by slug with caching
 * Cache TTL: 30 minutes
 * Query speed: <1ms with unique index
 */
async function findBySlug(slug) {
    const cacheKey = `catalog:slug:${slug}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: ${cacheKey}`);
        return cached;
    }

    console.log(`🔍 DB QUERY: findBySlug(${slug})`);
    const p = await CatalogRepository.findBySlug(slug);

    if (p) {
        await cache.setJSON(cacheKey, p, 1800);
        console.log(`💾 CACHED: ${cacheKey}`);
    }

    return p;
}

/**
 * Find product by barcode with caching
 * Cache TTL: 30 minutes
 * Query speed: <1ms with index
 */
async function findByBarcode(barcode) {
    const cacheKey = `catalog:barcode:${barcode}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: ${cacheKey}`);
        return cached;
    }

    console.log(`🔍 DB QUERY: findByBarcode(${barcode})`);
    const p = await CatalogRepository.findByBarcode(barcode);

    if (p) {
        await cache.setJSON(cacheKey, p, 1800);
        console.log(`💾 CACHED: ${cacheKey}`);
    }

    return p;
}

/**
 * Find product by SKU with caching
 * Cache TTL: 30 minutes
 * Query speed: <1ms with compound index
 */
async function findBySKU(sku, companyId) {
    const cacheKey = `catalog:sku:${sku}:${companyId}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: ${cacheKey}`);
        return cached;
    }

    console.log(`🔍 DB QUERY: findBySKU(${sku})`);
    const p = await CatalogRepository.findBySKU(sku, companyId);

    if (p) {
        await cache.setJSON(cacheKey, p, 1800);
        console.log(`💾 CACHED: ${cacheKey}`);
    }

    return p;
}

/**
 * Search products with intelligent caching
 * Cache TTL: 5 minutes
 * Query speed: <5ms with optimal indexes
 */
async function search(query = {}, opts = {}) {
    const companyId = query.companyId || 'global';
    const queryHash = JSON.stringify({ ...query, limit: opts.limit, page: opts.page });
    const cacheKey = `catalog:search:${companyId}:${Buffer.from(queryHash).toString('base64').substring(0, 32)}`;

    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: search query`);
        return cached;
    }

    console.log(`🔍 DB QUERY: search(${JSON.stringify(query)})`);
    const res = await CatalogRepository.search(query, opts);
    await cache.setJSON(cacheKey, res, 300); // 5 min TTL
    console.log(`💾 CACHED: search results (${res?.length || 0} items)`);

    return res;
}

/**
 * Get featured products with caching
 * Cache TTL: 10 minutes
 * Query speed: <2ms with compound index
 */
async function getFeaturedProducts(companyId, limit = 10) {
    const cacheKey = `catalog:featured:${companyId}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: featured products`);
        return cached;
    }

    console.log(`🔍 DB QUERY: getFeaturedProducts(${companyId})`);
    const res = await CatalogRepository.getFeaturedProducts(companyId, limit);
    await cache.setJSON(cacheKey, res, 600); // 10 min TTL
    console.log(`💾 CACHED: ${res?.length || 0} featured products`);

    return res;
}

/**
 * Get products by category with caching
 * Cache TTL: 5 minutes
 * Query speed: <2ms with compound index
 */
async function getByCategory(categoryId, companyId, opts = {}) {
    const cacheKey = `catalog:category:${categoryId}:${companyId}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: category products`);
        return cached;
    }

    console.log(`🔍 DB QUERY: getByCategory(${categoryId})`);
    const res = await CatalogRepository.getByCategory(categoryId, companyId, opts);
    await cache.setJSON(cacheKey, res, 300); // 5 min TTL
    console.log(`💾 CACHED: ${res?.length || 0} category products`);

    return res;
}

/**
 * Get available products (in stock) with caching
 * Cache TTL: 5 minutes
 * Query speed: <3ms
 */
async function getAvailable(companyId, opts = {}) {
    const cacheKey = `catalog:available:${companyId}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: available products`);
        return cached;
    }

    console.log(`🔍 DB QUERY: getAvailable(${companyId})`);
    const res = await CatalogRepository.getAvailable(companyId, opts);
    await cache.setJSON(cacheKey, res, 300); // 5 min TTL
    console.log(`💾 CACHED: ${res?.length || 0} available products`);

    return res;
}

/**
 * Get recently updated products with caching
 * Cache TTL: 5 minutes
 * Query speed: <2ms
 */
async function getRecent(companyId, limit = 20) {
    const cacheKey = `catalog:recent:${companyId}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: recent products`);
        return cached;
    }

    console.log(`🔍 DB QUERY: getRecent(${companyId})`);
    const res = await CatalogRepository.getRecent(companyId, limit);
    await cache.setJSON(cacheKey, res, 300); // 5 min TTL
    console.log(`💾 CACHED: ${res?.length || 0} recent products`);

    return res;
}

/**
 * Full-text search with caching
 * Cache TTL: 5 minutes
 * Query speed: <20ms with text index
 */
async function textSearch(keyword, companyId, opts = {}) {
    const cacheKey = `catalog:textsearch:${companyId}:${keyword}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: text search`);
        return cached;
    }

    console.log(`🔍 DB QUERY: textSearch("${keyword}")`);
    const res = await CatalogRepository.textSearch(keyword, companyId, opts);
    await cache.setJSON(cacheKey, res, 300); // 5 min TTL
    console.log(`💾 CACHED: ${res?.length || 0} text search results`);

    return res;
}

/**
 * Check availability of multiple products
 * Cache TTL: 30 seconds (short-lived for inventory accuracy)
 * Query speed: <5ms even with 100+ products
 */
async function checkAvailability(productIds = []) {
    if (!productIds || productIds.length === 0) {
        return [];
    }

    const cacheKey = `catalog:availability:${productIds.join(',')}`;
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
        console.log(`⚡ Cache HIT: availability check`);
        return cached;
    }

    console.log(`🔍 DB QUERY: checkAvailability(${productIds.length} items)`);
    const res = await CatalogRepository.checkAvailability(productIds);
    await cache.setJSON(cacheKey, res, 30); // 30 sec TTL
    console.log(`💾 CACHED: ${res?.length || 0} availability checks`);

    return res;
}

/**
 * Create new product
 * Invalidates related caches
 */
async function create(companyId, data) {
    if (!companyId || !data) {
        throw new Error('companyId and data are required');
    }

    data.companyId = companyId;
    data.isDeleted = false;

    console.log(`➕ Creating product: ${data.name}`);

    try {
        const created = await CatalogRepository.create(data);

        // Publish event
        try {
            const { publish, exchanges } = require('/app/shared/rabbitmq');
            await publish(exchanges.topic, 'ecommerce.catalog.created', {
                productId: created.productId,
                companyId,
                timestamp: Date.now()
            });
        } catch (e) {
            logger.error('Failed to publish catalog.created event', e.message);
        }

        // Invalidate company-wide caches
        await cache.del(`catalog:featured:${companyId}`);
        if (data.categoryId) {
            await cache.del(`catalog:category:${data.categoryId}:${companyId}`);
        }

        console.log(`✅ Product created: ${created.productId}`);
        return created;
    } catch (error) {
        console.error(`❌ Error creating product:`, error.message);
        throw error;
    }
}

/**
 * Update product
 * Invalidates product and related caches
 */
async function update(productId, patch) {
    if (!productId || !patch) {
        throw new Error('productId and patch are required');
    }

    console.log(`✏️ Updating product: ${productId}`);

    try {
        const updated = await CatalogRepository.update(productId, patch);

        if (!updated) {
            throw new Error('Product not found');
        }

        // Publish event
        try {
            const { publish, exchanges } = require('/app/shared/rabbitmq');
            await publish(exchanges.topic, 'ecommerce.catalog.updated', {
                productId,
                patch,
                timestamp: Date.now()
            });
        } catch (e) {
            logger.error('Failed to publish catalog.updated event', e.message);
        }

        // Invalidate caches
        await cache.del(`catalog:product:${productId}`);
        if (updated?.slug) {
            await cache.del(`catalog:slug:${updated.slug}`);
        }
        if (updated?.sku && updated?.companyId) {
            await cache.del(`catalog:sku:${updated.sku}:${updated.companyId}`);
        }
        if (updated?.companyId) {
            await cache.del(`catalog:featured:${updated.companyId}`);
        }

        console.log(`✅ Product updated: ${productId}`);
        return updated;
    } catch (error) {
        console.error(`❌ Error updating product:`, error.message);
        throw error;
    }
}

/**
 * Soft delete product
 * Marks as deleted and invalidates caches
 */
async function deleteProduct(productId, companyId) {
    if (!productId || !companyId) {
        throw new Error('productId and companyId are required');
    }

    console.log(`🗑️ Soft-deleting product: ${productId}`);

    try {
        // Verify ownership
        const product = await CatalogRepository.findByProductId(productId);

        if (!product) {
            throw new Error('Product not found');
        }

        if (product.companyId !== companyId) {
            throw new Error('Unauthorized: Product does not belong to this company');
        }

        const deleted = await CatalogRepository.softDelete(productId);

        // Publish event
        try {
            const { publish, exchanges } = require('/app/shared/rabbitmq');
            await publish(exchanges.topic, 'ecommerce.catalog.deleted', {
                productId,
                companyId,
                timestamp: Date.now()
            });
        } catch (e) {
            logger.error('Failed to publish catalog.deleted event', e.message);
        }

        // Invalidate caches
        await cache.del(`catalog:product:${productId}`);
        if (deleted?.slug) {
            await cache.del(`catalog:slug:${deleted.slug}`);
        }

        console.log(`✅ Product deleted: ${productId}`);
        return { success: true, message: 'Product deleted successfully' };
    } catch (error) {
        console.error(`❌ Error deleting product:`, error.message);
        throw error;
    }
}

/**
 * Bulk update products (optimized for inventory sync)
 * Invalidates affected caches
 */
async function bulkUpdate(updates = []) {
    if (!updates || updates.length === 0) {
        return { modifiedCount: 0 };
    }

    console.log(`📦 Bulk updating ${updates.length} products`);

    try {
        const result = await CatalogRepository.bulkUpdate(updates);

        // Invalidate affected caches
        for (const update of updates) {
            if (update.productId) {
                await cache.del(`catalog:product:${update.productId}`);
            }
        }

        console.log(`✅ Bulk update completed: ${result.modifiedCount} products modified`);
        return result;
    } catch (error) {
        console.error(`❌ Error in bulk update:`, error.message);
        throw error;
    }
}

/**
 * Count matching products
 */
async function count(query = {}) {
    try {
        const total = await CatalogRepository.count(query);
        return total;
    } catch (error) {
        console.error(`❌ Error counting products:`, error.message);
        throw error;
    }
}




module.exports = {
    findByProductId,
    findBySlug,
    findByBarcode,
    findBySKU,
    search,
    getFeaturedProducts,
    getByCategory,
    getAvailable,
    getRecent,
    textSearch,
    checkAvailability,
    create,
    update,
    deleteProduct,
    bulkUpdate,
    count
};
