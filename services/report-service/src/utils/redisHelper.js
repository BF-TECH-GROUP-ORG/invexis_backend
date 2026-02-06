
// Adjust path to point to the shared/redis.js file from services/report-service/src/utils
// properties/invexis/invexis_backend/shared/redis.js
// properties/invexis/invexis_backend/services/report-service/src/utils
const redisWrapper = require('/app/shared/redis');

/**
 * Helper to get the underlying ioredis client
 */
const getClient = () => redisWrapper.client;

/**
 * Delete keys matching pattern (async, non-blocking)
 * Returns immediately; deletion happens in background
 * @param {string} pattern 
 */
const scanDel = async (pattern) => {
    try {
        const redis = getClient();
        if (!redis) {
            console.warn(`Redis client not available, skipping scanDel for pattern: ${pattern}`);
            return;
        }

        const stream = redis.scanStream({
            match: pattern,
            count: 100
        });

        stream.on('data', (keys) => {
            if (keys && keys.length > 0) {
                const pipeline = redis.pipeline();
                keys.forEach((key) => {
                    pipeline.del(key);
                });
                pipeline.exec().catch((err) => {
                    console.error(`Redis pipeline exec error:`, err);
                });
            }
        });

        stream.on('error', (err) => {
            console.error(`Redis scan stream error for pattern ${pattern}:`, err);
        });
    } catch (error) {
        console.error(`Redis scanDel error for pattern ${pattern}:`, error);
    }
};

/**
 * Set a cache key with optional TTL
 * @param {string} key 
 * @param {*} value 
 * @param {number} ttl seconds
 */
const setCache = async (key, value, ttl = 300) => { // Default 5 mins
    try {
        const redis = getClient();
        if (!redis) return;
        const json = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttl > 0) {
            await redis.setex(key, ttl, json);
        } else {
            await redis.set(key, json);
        }
    } catch (error) {
        console.error(`Redis setCache error for key ${key}:`, error);
    }
};

/**
 * Get a cache key
 * @param {string} key 
 */
const getCache = async (key) => {
    try {
        const redis = getClient();
        if (!redis) return null;
        const value = await redis.get(key);
        if (!value) return null;
        try {
            return JSON.parse(value);
        } catch {
            return value; // Return raw string if not JSON
        }
    } catch (error) {
        console.error(`Redis getCache error for key ${key}:`, error);
        return null;
    }
};

/**
 * Dedup helper for events
 * Returns true if the event should be processed, false if it's a duplicate
 * @param {string} eventId (traceId)
 * @param {string} serviceName 
 * @param {number} ttl seconds (default 24h)
 */
const processEventOnce = async (eventId, serviceName = 'report-service', ttl = 86400) => {
    try {
        const redis = getClient();
        if (!redis || !eventId) return true; // Fail open if no redis/id

        const key = `processed:${serviceName}:${eventId}`;
        const result = await redis.set(key, '1', 'EX', ttl, 'NX');
        return result === 'OK';
    } catch (error) {
        console.error(`Redis processEventOnce error:`, error);
        return true; // Fail open
    }
};

module.exports = { scanDel, setCache, getCache, processEventOnce };
