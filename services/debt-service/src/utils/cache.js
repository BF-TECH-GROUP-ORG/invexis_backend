function getRedis() {
    if (global && global.redisClient) return global.redisClient;
    try { return require('/app/shared/redis.js'); } catch (e) { try { return require('/app/shared/redis'); } catch (e2) { return null; } }
}

async function get(key) {
    const redis = getRedis();
    if (!redis || !redis.get) return null;
    try {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    } catch (err) {
        console.warn(`Cache get error for key ${key}:`, err.message);
        return null;
    }
}

async function set(key, value, ttlSeconds) {
    const redis = getRedis();
    if (!redis || !redis.set) return null;
    try {
        if (ttlSeconds) {
            return await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        }
        return await redis.set(key, JSON.stringify(value));
    } catch (err) {
        console.warn(`Cache set error for key ${key}:`, err.message);
        return null;
    }
}

async function del(key) {
    const redis = getRedis();
    if (!redis || !redis.del) return null;
    try {
        return await redis.del(key);
    } catch (err) {
        console.warn(`Cache del error for key ${key}:`, err.message);
        return null;
    }
}

// Batch delete for cache invalidation
async function delMany(keys) {
    const redis = getRedis();
    if (!redis || !redis.del || !Array.isArray(keys) || keys.length === 0) return 0;
    try {
        return await redis.del(...keys);
    } catch (err) {
        console.warn(`Cache delMany error:`, err.message);
        return 0;
    }
}

module.exports = { get, set, del, delMany };
