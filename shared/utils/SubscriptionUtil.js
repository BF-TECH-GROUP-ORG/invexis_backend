"use strict";

const { getRedisClient } = require("../middlewares/utils/redis");

const SUBSCRIPTION_CACHE_TTL = parseInt(process.env.SUBSCRIPTION_CACHE_TTL || "300", 10); // 5 minutes

class SubscriptionUtil {
  /**
   * Get subscription status for a company
   * @param {string} companyId - Company ID
   * @returns {Promise<Object|null>} Subscription object or null if not found
   */
  static async getSubscriptionStatus(companyId) {
    if (!companyId) return null;

    let subscription = null;

    // 1. Try Redis
    try {
      const redis = getRedisClient();
      const cacheKey = `company:subscription:${companyId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        subscription = JSON.parse(cached);
        return subscription;
      }
    } catch (err) {
      console.warn("Redis cache read failed, proceeding with DB query:", err.message);
    }

    // 2. Try DB (Fallback)
    // Note: We dynamically require config to avoid circular deps or init issues
    let db;
    try {
      // Path assumes we are running in a service that has access to company-service config or similar
      // In monorepo, path might vary. 
      // Auth service might not have direct DB access to company tables if isolated.
      // However, checkSubscriptionStatus.js was using this path:
      db = require("../../../services/company-service/src/config");
    } catch (e) {
      // Silent fail if DB config not found (e.g. inside a service that doesn't have it)
    }

    if (db) {
      try {
        const companyRecord = await db("companies").where({ id: companyId }).first();

        if (!companyRecord) return null; // Company not found

        const subscriptionRecord = await db("subscriptions").where({ company_id: companyId }).first();

        if (!subscriptionRecord) {
          // Return virtual "none" subscription
          return {
            tier: 'none',
            isActive: false,
            isExpired: true
          };
        }

        const now = new Date();
        const endDate = new Date(subscriptionRecord.end_date);
        const isExpired = now > endDate;

        subscription = {
          id: subscriptionRecord.id,
          tier: subscriptionRecord.tier,
          isActive: subscriptionRecord.is_active,
          isExpired,
          startDate: subscriptionRecord.start_date,
          endDate: subscriptionRecord.end_date,
          daysRemaining: Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))),
        };

        // Cache it
        try {
          const redis = getRedisClient();
          const cacheKey = `company:subscription:${companyId}`;
          await redis.setex(cacheKey, SUBSCRIPTION_CACHE_TTL, JSON.stringify(subscription));
        } catch (err) {
          // ignore cache write error
        }

        return subscription;

      } catch (dbError) {
        console.error("DB Fetch Error in SubscriptionUtil:", dbError.message);
        return null;
      }
    }

    return null;
  }
}

module.exports = SubscriptionUtil;
