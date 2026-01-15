"use strict";

const sharedRedis = require("/app/shared/redis");

/**
 * Get Redis client (ioredis instance)
 */
function getRedisClient() {
    // If the shared module exports the instance directly, and it has a .client property
    return sharedRedis.client || sharedRedis;
}

module.exports = {
    getRedisClient
};
