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
const { getRedisClient } = require("/app/shared/middlewares/utils/redis");

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
      const user = req.user;

      // ✅ BYPASS: Super Admin is exempt from all subscription checks
      if (user && user.role === "super_admin") {
        req.subscription = {
          id: "super-admin-virtual-sub",
          tier: "pro",
          isActive: true,
          isExpired: false,
          startDate: new Date(),
          endDate: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000), // 100 years
          daysRemaining: 36500,
          isVirtual: true
        };
        return next();
      }

      // Resolve Company ID from various sources
      let companyId = null;

      if (req.company && req.company.id) {
        companyId = req.company.id;
      } else if (req.companyId) {
        companyId = req.companyId;
      } else if (req.body && req.body.companyId) {
        companyId = req.body.companyId;
      } else if (req.query && req.query.companyId) {
        companyId = req.query.companyId;
      } else if (req.params && req.params.companyId) {
        companyId = req.params.companyId;
      } else if (user && user.companies && user.companies.length === 1) {
        // Default to the single company if user only has one
        companyId = user.companies[0];
      }

      if (!companyId) {
        // If we still can't find it, we can't purge/verify subscription
        return res.status(400).json({
          success: false,
          error: "COMPANY_ID_MISSING",
          code: "MISSING_COMPANY_ID",
          message: "Could not determine Company ID for subscription check",
        });
      }

      // Ensure req.company is set for downstream (normalization)
      if (!req.company) {
        req.company = { id: companyId };
      }
      let subscription;

      // Fetch Subscription Status
      const SubscriptionUtil = require('../../utils/SubscriptionUtil');
      subscription = await SubscriptionUtil.getSubscriptionStatus(companyId);

      if (!subscription) {
        // If null, it means company not found or DB error. 
        // However, SubscriptionUtil returns object even if expired, unless company strictly creates no record.
        // Let's assume strict fail if nothing returned.
        return res.status(404).json({
          success: false,
          code: "SUBSCRIPTION_CHECK_FAILED",
          message: "Could not verify subscription status"
        });
      }

      // Check Active/Expired Status (Logic preserved)
      if (!subscription.isActive && subscription.tier !== 'none') { // 'none' handled below
        return res.status(403).json({
          success: false,
          error: "SUBSCRIPTION_INACTIVE",
          code: "SUBSCRIPTION_INACTIVE",
          message: "Subscription is not active",
        });
      }

      if (subscription.tier === 'none') {
        return res.status(402).json({
          success: false,
          error: "NO_SUBSCRIPTION",
          code: "NO_SUBSCRIPTION",
          message: "No active subscription found.",
        });
      }

      if (subscription.isExpired && !options.allowExpired) {
        return res.status(402).json({
          success: false,
          error: "SUBSCRIPTION_EXPIRED",
          code: "SUBSCRIPTION_EXPIRED",
          message: "Your subscription has expired. Please renew to continue.",
          expiryDate: subscription.endDate,
        });
      }

      // Check tier requirement if specified
      if (options.tier) {
        const tierHierarchy = { Basic: 0, Mid: 1, Pro: 2 };
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
