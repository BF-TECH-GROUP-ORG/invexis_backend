const { WishlistRepository } = require('../repositories');
const redis = require('/app/shared/redis');
const { publish, exchanges } = require('/app/shared/rabbitmq');

const CACHE_TTL = 300;

function cacheKey(companyId, userId) {
    return `wishlist:${companyId}:${userId}`;
}

async function getWishlist(companyId, userId) {
    const key = cacheKey(companyId, userId);
    try {
        const cached = await redis.get(key);
        if (cached) return JSON.parse(cached);
    } catch (e) { }

    let w = await WishlistRepository.findByUser(companyId, userId);
    if (!w) return null;
    try { await redis.set(key, JSON.stringify(w), 'EX', CACHE_TTL); } catch (e) { }
    return w;
}

async function addItem(companyId, userId, productId) {
    let w = await WishlistRepository.findByUser(companyId, userId);
    if (!w) {
        w = await WishlistRepository.create({ companyId, userId, items: [{ productId, addedAt: new Date() }] });
    } else {
        w = await WishlistRepository.addItem(w._id, productId);
    }
    const key = cacheKey(companyId, userId);
    try { await redis.del(key); await redis.set(key, JSON.stringify(w), 'EX', CACHE_TTL); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.wishlist.updated', { companyId, userId, productId }); } catch (e) { }
    return w;
}

async function removeItem(companyId, userId, productId) {
    const w = await WishlistRepository.findByUser(companyId, userId);
    if (!w) return null;
    const updated = await WishlistRepository.removeItem(w._id, productId);
    const key = cacheKey(companyId, userId);
    try { await redis.del(key); await redis.set(key, JSON.stringify(updated), 'EX', CACHE_TTL); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.wishlist.updated', { companyId, userId, productId, removed: true }); } catch (e) { }
    return updated;
}

async function addOrUpdateWishlist(companyId, userId, value) {
    // if items present, add them
    if (value.items && Array.isArray(value.items) && value.items.length) {
        let w = await WishlistRepository.findByUser(companyId, userId);
        if (!w) {
            w = await WishlistRepository.create({ companyId, userId, items: value.items });
        } else {
            for (const it of value.items) {
                await WishlistRepository.addItem(w._id, it.productId);
            }
            w = await WishlistRepository.findByUser(companyId, userId);
        }
        const key = cacheKey(companyId, userId);
        try { await redis.del(key); await redis.set(key, JSON.stringify(w), 'EX', CACHE_TTL); } catch (e) { }
        try { await publish(exchanges.topic, 'ecommerce.wishlist.updated', { companyId, userId }); } catch (e) { }
        try { await publish(exchanges.topic, 'ecommerce.wishlist.created', { companyId, userId, wishlistId: w._id }); } catch (e) { }
        return w;
    }

    // otherwise treat as create
    let w = await WishlistRepository.findByUser(companyId, userId);
    if (!w) w = await WishlistRepository.create(Object.assign({ companyId, userId }, value));
    else w = await WishlistRepository.addItem(w._id, value.productId);
    const key = cacheKey(companyId, userId);
    try { await redis.del(key); await redis.set(key, JSON.stringify(w), 'EX', CACHE_TTL); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.wishlist.updated', { companyId, userId }); } catch (e) { }
    return w;
}

async function removeFromWishlist(companyId, userId, productId) {
    const w = await WishlistRepository.findByUser(companyId, userId);
    if (!w) throw new Error('Wishlist not found');
    const updated = await WishlistRepository.removeItem(w._id, productId);
    const key = cacheKey(companyId, userId);
    try { await redis.del(key); await redis.set(key, JSON.stringify(updated), 'EX', CACHE_TTL); } catch (e) { }
    try { await publish(exchanges.topic, 'ecommerce.wishlist.updated', { companyId, userId, productId, removed: true }); } catch (e) { }
    return updated;
}

module.exports = { getWishlist, addItem, removeItem, addOrUpdateWishlist, removeFromWishlist };
