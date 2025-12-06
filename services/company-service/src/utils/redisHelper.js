const redisWrapper = require('/app/shared/redis');
const { logger } = require('./logger');

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
            logger.warn(`Redis client not available, skipping scanDel for pattern: ${pattern}`);
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
                    logger.error(`Redis pipeline exec error:`, err);
                });
            }
        });

        stream.on('error', (err) => {
            logger.error(`Redis scan stream error for pattern ${pattern}:`, err);
        });

        stream.on('end', () => {
            logger.debug(`Redis scanDel completed for pattern: ${pattern}`);
        });
    } catch (error) {
        logger.error(`Redis scanDel error for pattern ${pattern}:`, error);
    }
};

/**
 * Set a cache key with optional TTL
 * @param {string} key 
 * @param {*} value 
 * @param {number} ttl seconds
 */
const setCache = async (key, value, ttl = 3600) => {
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
        logger.error(`Redis setCache error for key ${key}:`, error);
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
        logger.error(`Redis getCache error for key ${key}:`, error);
        return null;
    }
};

/**
 * Delete a cache key
 * @param {string} key 
 */
const delCache = async (key) => {
    try {
        const redis = getClient();
        if (!redis) return;
        await redis.del(key);
    } catch (error) {
        logger.error(`Redis delCache error for key ${key}:`, error);
    }
};

module.exports = { scanDel, setCache, getCache, delCache };
