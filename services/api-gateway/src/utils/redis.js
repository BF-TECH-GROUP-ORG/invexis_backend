"use strict";

/**
 * Redis Client Manager for API Gateway
 * Wraps the shared Redis module to provide compatible interface and extra utilities.
 */

const sharedRedis = require("/app/shared/redis");

/**
 * Initialize Redis connection
 * (Shared module connects automatically, this is for compatibility/logging)
 */
function initRedis() {
  if (!sharedRedis.client) {
    sharedRedis.connect();
  }
  return sharedRedis.client;
}

/**
 * Get Redis client (ioredis instance)
 */
function getRedisClient() {
  return sharedRedis.client;
}

/**
 * Check Redis connection status
 */
function isRedisConnected() {
  return sharedRedis.isConnected;
}

/**
 * Invalidate all subscription-related caches for a company
 */
async function invalidateCompanyCaches(companyId) {
  const client = getRedisClient();
  if (!client) {
    console.warn("Redis client not available for cache invalidation");
    return false;
  }

  try {
    const keys = [
      `company:subscription:${companyId}`,
      `company:features:${companyId}`,
      `company:ratelimit:${companyId}:*`,
    ];

    let deleted = 0;
    for (const pattern of keys) {
      if (pattern.includes("*")) {
        // Use SCAN for patterns
        const keysToDelete = [];
        let cursor = "0";
        do {
          const [newCursor, foundKeys] = await client.scan(
            cursor,
            "MATCH",
            pattern,
            "COUNT",
            100
          );
          cursor = newCursor;
          keysToDelete.push(...foundKeys);
        } while (cursor !== "0");

        if (keysToDelete.length > 0) {
          deleted += await client.del(...keysToDelete);
        }
      } else {
        deleted += await client.del(pattern);
      }
    }

    console.log(`✅ Invalidated ${deleted} cache entries for company ${companyId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error invalidating company caches:`, error.message);
    return false;
  }
}

/**
 * Clear all gateway caches (for deployment/testing)
 */
async function clearAllCaches() {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.flushdb();
    console.log("✅ All Redis caches cleared");
    return true;
  } catch (error) {
    console.error("❌ Error clearing Redis caches:", error.message);
    return false;
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const info = await client.info("stats");
    const dbSize = await client.dbsize();
    return {
      connected: sharedRedis.isConnected,
      dbSize,
      info,
    };
  } catch (error) {
    console.error("❌ Error getting cache stats:", error.message);
    return null;
  }
}

/**
 * Health check for Redis
 */
async function healthCheck() {
  const client = getRedisClient();
  if (!client || !sharedRedis.isConnected) {
    return { status: "disconnected", message: "Redis client not connected" };
  }

  try {
    await client.ping();
    const dbSize = await client.dbsize();
    return {
      status: "healthy",
      connected: true,
      dbSize,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      connected: false,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  await sharedRedis.close();
}

module.exports = {
  initRedis,
  getRedisClient,
  isRedisConnected,
  invalidateCompanyCaches,
  clearAllCaches,
  getCacheStats,
  healthCheck,
  shutdown,
};

