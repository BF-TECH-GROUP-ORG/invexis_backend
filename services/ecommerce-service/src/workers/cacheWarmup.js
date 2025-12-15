/*
  Cache warmup worker
  - Optionally pre-warms Redis cache for active carts to improve read latency.
  - Intended to be run on startup or periodically for busy companies.
*/

const { CartRepository } = require('../repositories');
const redis = require('/app/shared/redis');

async function warmupActiveCarts(companyId, limit = 100) {
    const carts = await CartRepository.findActiveByCompany(companyId);
    const toWarm = carts.slice(0, limit);
    let count = 0;
    for (const cart of toWarm) {
        try {
            const key = cart.userId ? `cart:${cart.companyId}:${cart.userId}` : `cart:${cart.companyId}:guest:${cart._id}`;
            await redis.set(key, JSON.stringify(cart), 'EX', 60 * 5); // 5 minutes
            count++;
        } catch (err) {
            console.warn('CacheWarmup: failed to warm for cart', cart._id, err.message);
        }
    }
    return { warmed: count };
}

module.exports = { warmupActiveCarts };
