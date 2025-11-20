const { CatalogRepository } = require('../repositories');
const cache = require('../utils/cache');

async function findByProductId(productId) {
    const cacheKey = `catalog:product:${productId}`;
    const cached = await cache.getJSON(cacheKey);
    if (cached) return cached;
    const p = await CatalogRepository.findByProductId(productId);
    if (p) await cache.setJSON(cacheKey, p);
    return p;
}

async function search(query, opts) {
    // simple cache keyed by company + options
    const companyId = query.companyId || 'global';
    const key = `catalog:company:${companyId}:search:${JSON.stringify(opts || {})}:${JSON.stringify(query || {})}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const res = await CatalogRepository.search(query, opts);
    await cache.setJSON(key, res, 60); // shorter TTL for search
    return res;
}

async function update(productId, patch) {
    const updated = await CatalogRepository.update(productId, patch);
    // publish catalog.updated event
    try {
        const { publish, exchanges } = require('/app/shared/rabbitmq');
        await publish(exchanges.topic, 'ecommerce.catalog.updated', { productId, patch, timestamp: Date.now() });
    } catch (e) { }
    // invalidate cache
    const cacheKey = `catalog:product:${productId}`;
    await cache.del(cacheKey);
    return updated;
}

async function create(companyId, data) {
    data.companyId = companyId;
    const created = await CatalogRepository.create(data);
    try {
        const { publish, exchanges } = require('/app/shared/rabbitmq');
        await publish(exchanges.topic, 'ecommerce.catalog.created', { productId: created.productId, companyId, timestamp: Date.now() });
    } catch (e) { }
    // invalidate company search caches — simple strategy: delete keys with prefix
    // Note: Redis doesn't support server-side prefix deletion via client without SCAN; keep simple for now
    return created;
}

module.exports = { findByProductId, search, update };
