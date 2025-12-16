/*
  Abandoned Cart Cleaner
  - Finds carts that have been inactive for a configured threshold and marks them abandoned.
  - Invalidates Redis cache for affected carts.
  - Safe to run periodically (idempotent).
*/

const { CartRepository } = require('../repositories');
const redis = require('/app/shared/redis');

const DEFAULT_THRESHOLD_HOURS = parseInt(process.env.ABANDONED_CART_HOURS || '72', 10);
const DEFAULT_INTERVAL_MS = parseInt(process.env.ABANDONED_CART_CLEAN_INTERVAL_MS || String(1000 * 60 * 60), 10); // hourly

async function cleanAbandoned(thresholdHours = DEFAULT_THRESHOLD_HOURS) {
    const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const staleCarts = await CartRepository.listAbandonedBefore(cutoff);
    if (!staleCarts || !staleCarts.length) return { processed: 0 };

    const results = [];
    for (const cart of staleCarts) {
        try {
            await CartRepository.markAbandoned(cart._id, 'inactivity_timeout');
            // invalidate cache keys that might refer to this cart
            // support both user-based and company-only keys
            if (cart.userId) {
                const cacheKey = `cart:${cart.companyId}:${cart.userId}`;
                await redis.del(cacheKey);
            }
            // company fallback key
            const companyKey = `cart:${cart.companyId}:guest:${cart._id}`;
            await redis.del(companyKey).catch(() => { });
            // publish an event so other services can react to abandoned carts
            try {
                const { publish, exchanges } = require('/app/shared/rabbitmq');
                await publish(exchanges.topic, 'ecommerce.cart.abandoned', {
                    cartId: cart._id,
                    companyId: cart.companyId,
                    userId: cart.userId || null,
                    reason: 'inactivity_timeout',
                    timestamp: Date.now()
                });
            } catch (e) {
                // ignore publish failure
            }

            results.push({ id: cart._id, status: 'abandoned' });
        } catch (err) {
            console.error('AbandonedCartCleaner: failed to mark cart', cart._id, err.message);
        }
    }

    return { processed: results.length, results };
}

function startCleaner(opts = {}) {
    const interval = opts.intervalMs || DEFAULT_INTERVAL_MS;
    // run once immediately
    cleanAbandoned(opts.thresholdHours).catch(err => console.error('AbandonedCartCleaner error', err.message));
    const timer = setInterval(() => {
        cleanAbandoned(opts.thresholdHours).catch(err => console.error('AbandonedCartCleaner error', err.message));
    }, interval);

    process.on('SIGINT', () => clearInterval(timer));
    process.on('SIGTERM', () => clearInterval(timer));

    return {
        stop: () => clearInterval(timer)
    };
}

module.exports = { cleanAbandoned, startCleaner };
