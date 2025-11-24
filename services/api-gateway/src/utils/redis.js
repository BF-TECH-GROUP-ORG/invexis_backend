"use strict";

/**
 * Redis Client Manager for API Gateway
 * 
 * Handles:
 *  - Redis connection with automatic reconnection
 *  - Health monitoring and logging
 *  - Cache invalidation methods
 *  - Graceful fallback when Redis unavailable
 */

const Redis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const REDIS_MAX_RETRIES = 5;
const REDIS_RETRY_DELAY = 1000; // milliseconds

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
function initRedis() {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: REDIS_MAX_RETRIES,
      retryStrategy: (times) => {
        const delay = Math.min(times * REDIS_RETRY_DELAY, 30000);
        console.log(`🔄 Redis reconnection attempt ${times}, waiting ${delay}ms...`);
        return delay;
      },
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 5000,
    });

    // Connection events
    redisClient.on("connect", () => {
      isConnected = true;
      console.log("✅ Redis connected");
    });

    redisClient.on("ready", () => {
      console.log("✅ Redis ready");
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis error:", err.message);
    });

    redisClient.on("close", () => {
      isConnected = false;
      console.warn("⚠️ Redis connection closed");
    });

    redisClient.on("reconnecting", () => {
      console.log("🔄 Redis reconnecting...");
    });

    return redisClient;
  } catch (error) {
    console.error("❌ Failed to initialize Redis:", error.message);
    return null;
  }
}

/**
 * Get Redis client, initializing if needed
 */
function getRedisClient() {
  if (!redisClient) {
    initRedis();
  }
  return redisClient;
}

/**
 * Check Redis connection status
 */
function isRedisConnected() {
  return isConnected && redisClient !== null;
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
      connected: isConnected,
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
  if (!client) {
    return { status: "disconnected", message: "Redis client not initialized" };
  }

  try {
    await client.ping();
    const dbSize = await client.dbsize();
    return {
      status: "healthy",
      connected: isConnected,
      dbSize,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      connected: isConnected,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log("✅ Redis connection closed gracefully");
    } catch (error) {
      console.error("❌ Error closing Redis:", error.message);
    }
  }
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
