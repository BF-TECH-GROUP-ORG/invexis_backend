"use strict";

/**
 * Unified Rate Limiting Middleware for API Gateway
 * 
 * Features:
 *  - Per-tier rate limits: basic 100, mid 500, pro 2000 requests/min
 *  - Redis-backed for distributed systems
 *  - Automatic fallback to in-memory if Redis unavailable
 *  - Response headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 */

const asyncHandler = require("express-async-handler");
const { getRedisClient } = require("../utils/redis");

// Default rate limits per tier (requests per minute)
const DEFAULT_LIMITS = {
  basic: 100,
  mid: 500,
  pro: 2000,
};

const WINDOW_MS = 60000; // 1 minute

// In-memory fallback (when Redis unavailable)
const inMemoryCounters = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of inMemoryCounters.entries()) {
    if (now - data.createdAt > WINDOW_MS * 5) {
      inMemoryCounters.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limit middleware
 * @param {Object} options - Configuration
 * @param {Object} options.limits - Custom rate limits by tier
 * @returns {Function} Express middleware
 */
function checkRateLimits(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };

  return asyncHandler(async (req, res, next) => {
    try {
      // Get subscription (set by checkSubscriptionStatus)
      if (!req.subscription) {
        return next(); // Skip rate limiting if no subscription
      }

      const tier = req.subscription.tier || "basic";
      const limit = limits[tier] || limits.basic;
      const companyId = req.company?.id || "unknown";

      const now = Date.now();
      const windowStart = Math.floor(now / WINDOW_MS);
      const counterKey = `ratelimit:${companyId}:${windowStart}`;

      let count = 0;
      let resetTime = new Date(now + WINDOW_MS);
      let fromCache = false;

      try {
        // Try Redis first
        const redis = getRedisClient();
        const cached = await redis.incr(counterKey);
        
        if (cached === 1) {
          // First request in this window
          await redis.expire(counterKey, Math.ceil(WINDOW_MS / 1000));
        }
        
        count = cached;
        fromCache = true;
      } catch (err) {
        // Fallback to in-memory
        console.warn("Redis rate limit check failed, using in-memory:", err.message);
        
        const counter = inMemoryCounters.get(counterKey) || {
          count: 0,
          createdAt: now,
        };
        
        counter.count++;
        inMemoryCounters.set(counterKey, counter);
        count = counter.count;
      }

      // Calculate remaining requests
      const remaining = Math.max(0, limit - count);

      // Add rate limit headers
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetTime.toISOString());

      // Attach rate limit info to request
      req.rateLimit = {
        tier,
        limit,
        current: count,
        remaining,
        resetAt: resetTime,
        fromRedis: fromCache,
      };

      // Check if limit exceeded
      if (count > limit) {
        const retryAfter = Math.ceil((resetTime - now) / 1000);
        return res.status(429).json({
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded for ${tier} tier (${limit} requests per minute)`,
          tier,
          limit,
          current: count,
          resetAt: resetTime.toISOString(),
          retryAfter,
        });
      }

      next();
    } catch (error) {
      console.error("Error in checkRateLimits:", error.message);
      // Don't block request on middleware error - log and continue
      next();
    }
  });
}

module.exports = checkRateLimits;
