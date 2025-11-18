function getRedis() {
    if (global && global.redisClient) return global.redisClient;
    try { return require('/app/shared/redis.js'); } catch (e) { try { return require('../shared/redis'); } catch (e2) { return null; } }
}

async function get(key) { const redis = getRedis(); if (!redis || !redis.get) return null; return redis.get(key); }
async function set(key, value, ttlSeconds) { const redis = getRedis(); if (!redis || !redis.set) return null; if (ttlSeconds) return redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); return redis.set(key, JSON.stringify(value)); }
async function del(key) { const redis = getRedis(); if (!redis || !redis.del) return null; return redis.del(key); }

module.exports = { get, set, del };
