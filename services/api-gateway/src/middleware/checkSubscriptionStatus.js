"use strict";

/**
 * Unified Subscription Status Check Middleware for API Gateway
 * 
 * Validates:
 *  - Company exists and is active
 *  - Company has active subscription
 *  - Subscription has not expired
 *  - Optional: minimum tier requirement
 * 
 * Uses Redis caching with TTL for performance
 * Attaches subscription info to request for downstream middleware
 */

const asyncHandler = require("express-async-handler");
const { getRedisClient } = require("../utils/redis");

const SUBSCRIPTION_CACHE_TTL = parseInt(process.env.SUBSCRIPTION_CACHE_TTL || "300", 10); // 5 minutes

/**
 * Check subscription status and attach to request
 * @param {Object} options - Configuration
 * @param {string} options.tier - Optional minimum tier requirement
 * @returns {Function} Express middleware
 */
const checkSubscriptionStatus = (options = {}) => {
  return asyncHandler(async (req, res, next) => {
    try {
      // Get company from request (set by auth middleware)
      const company = req.company;
      if (!company || !company.id) {
        return res.status(400).json({
          success: false,
          error: "COMPANY_NOT_FOUND",
          code: "MISSING_COMPANY",
          message: "Company information not found in request",
        });
      }

      const companyId = company.id;
      let subscription;

      // Try to get subscription from cache first
      try {
        const redis = getRedisClient();
        const cacheKey = `company:subscription:${companyId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          subscription = JSON.parse(cached);
        }
      } catch (err) {
        console.warn("Redis cache read failed, proceeding with DB query:", err.message);
      }

      // Fetch from database if not cached
      if (!subscription) {
        const db = require("../../../services/company-service/src/config");
        
        // Verify company exists and is active
        const companyRecord = await db("companies")
          .where({ id: companyId })
          .first();

        if (!companyRecord) {
          return res.status(404).json({
            success: false,
            error: "COMPANY_NOT_FOUND",
            code: "COMPANY_INACTIVE",
            message: "Company not found",
          });
        }

        if (companyRecord.status !== "active") {
          return res.status(403).json({
            success: false,
            error: "COMPANY_INACTIVE",
            code: "COMPANY_INACTIVE",
            message: `Company is ${companyRecord.status}`,
          });
        }

        // Get subscription
        const subscriptionRecord = await db("subscriptions")
          .where({ company_id: companyId })
          .first();

        if (!subscriptionRecord) {
          return res.status(402).json({
            success: false,
            error: "NO_SUBSCRIPTION",
            code: "NO_SUBSCRIPTION",
            message: "No active subscription found. Please subscribe to use this service.",
          });
        }

        if (!subscriptionRecord.is_active) {
          return res.status(403).json({
            success: false,
            error: "SUBSCRIPTION_INACTIVE",
            code: "SUBSCRIPTION_INACTIVE",
            message: "Subscription is not active",
          });
        }

        // Check expiration
        const now = new Date();
        const endDate = new Date(subscriptionRecord.end_date);
        const isExpired = now > endDate;

        if (isExpired && !options.allowExpired) {
          return res.status(402).json({
            success: false,
            error: "SUBSCRIPTION_EXPIRED",
            code: "SUBSCRIPTION_EXPIRED",
            message: "Your subscription has expired. Please renew to continue.",
            expiryDate: subscriptionRecord.end_date,
          });
        }

        // Build subscription object
        subscription = {
          id: subscriptionRecord.id,
          tier: subscriptionRecord.tier,
          isActive: subscriptionRecord.is_active,
          isExpired,
          startDate: subscriptionRecord.start_date,
          endDate: subscriptionRecord.end_date,
          daysRemaining: Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))),
        };

        // Cache subscription
        try {
          const redis = getRedisClient();
          const cacheKey = `company:subscription:${companyId}`;
          await redis.setex(cacheKey, SUBSCRIPTION_CACHE_TTL, JSON.stringify(subscription));
        } catch (err) {
          console.warn("Redis cache write failed:", err.message);
        }
      }

      // Check tier requirement if specified
      if (options.tier) {
        const tierHierarchy = { basic: 0, mid: 1, pro: 2 };
        const currentLevel = tierHierarchy[subscription.tier] || 0;
        const requiredLevel = tierHierarchy[options.tier] || 0;

        if (currentLevel < requiredLevel) {
          return res.status(403).json({
            success: false,
            error: "INSUFFICIENT_TIER",
            code: "INSUFFICIENT_TIER",
            message: `This feature requires ${options.tier} tier or higher`,
            currentTier: subscription.tier,
            requiredTier: options.tier,
          });
        }
      }

      // Attach to request for downstream middleware
      req.subscription = subscription;

      next();
    } catch (error) {
      console.error("Error in checkSubscriptionStatus:", error.message);
      return res.status(500).json({
        success: false,
        error: "SUBSCRIPTION_CHECK_ERROR",
        code: "INTERNAL_ERROR",
        message: "Error checking subscription status",
      });
    }
  });
};

/**
 * Invalidate subscription cache (called from company-service events)
 */
async function invalidateSubscriptionCache(companyId) {
  try {
    const redis = getRedisClient();
    const cacheKey = `company:subscription:${companyId}`;
    await redis.del(cacheKey);
    console.log(`✅ Subscription cache invalidated for company ${companyId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error invalidating subscription cache:`, error.message);
    return false;
  }
}

module.exports = {
  checkSubscriptionStatus,
  invalidateSubscriptionCache,
};
