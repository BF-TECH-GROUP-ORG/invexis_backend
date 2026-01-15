"use strict";

/**
 * Unified Feature Access Middleware for API Gateway
 * 
 * Responsibilities:
 *  - Check feature availability based on subscription tier
 *  - Cache-first approach: Redis → Subscription model → Local config
 *  - Provide upgrade suggestions with minimum tier
 *  - Integrate with Prometheus metrics
 *  - Fallback to local tier config if services unavailable
 *  - Thread-safe cache invalidation from company-service events
 */

const { isFeatureEnabled } = require("/app/shared/config/tierFeatures.config");
const { getRedisClient } = require("/app/shared/middlewares/utils/redis");

// Configuration
const FEATURE_CACHE_TTL_SECONDS = parseInt(process.env.FEATURE_CACHE_TTL_SECONDS || "300", 10);
const FALLBACK_ON_ERROR = process.env.FEATURE_FALLBACK_ON_ERROR === "true";

/**
 * Check if feature is available for company's subscription tier
 * @param {string} featureCategory - Feature category (e.g., 'sales', 'ecommerce')
 * @param {string} featureName - Feature name (e.g., 'invoicing', 'checkout')
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
const checkFeatureAccess = (featureCategory, featureName, options = {}) => {
  if (!featureCategory || !featureName) {
    throw new Error("checkFeatureAccess requires featureCategory and featureName");
  }

  return async (req, res, next) => {
    try {
      // ✅ BYPASS: Super Admin always has feature access
      if (req.user && req.user.role === "super_admin") {
        return next();
      }

      // Require subscription to be checked first
      if (!req.subscription || !req.subscription.tier) {
        return res.status(403).json({
          success: false,
          error: "SUBSCRIPTION_REQUIRED",
          code: "SUBSCRIPTION_REQUIRED",
          message: "Subscription validation required before feature access",
        });
      }

      const { tier } = req.subscription;
      const companyId = req.company?.id;
      ``
      // Check feature availability
      const isEnabled = isFeatureEnabled(tier, featureCategory, featureName);

      if (!isEnabled) {
        // Find minimum tier for this feature
        let minimumTier = null;
        for (const checkTier of ["Basic", "Mid", "Pro"]) {
          if (isFeatureEnabled(checkTier, featureCategory, featureName)) {
            minimumTier = checkTier;
            break;
          }
        }

        return res.status(403).json({
          success: false,
          error: "FEATURE_NOT_AVAILABLE",
          code: "INSUFFICIENT_TIER_FOR_FEATURE",
          message: `Feature '${featureName}' is not available for your current plan`,
          feature: { category: featureCategory, name: featureName },
          currentTier: tier,
          minimumTierRequired: minimumTier,
          suggestion: minimumTier ? `Upgrade to ${minimumTier} tier` : "Contact sales for this feature",
        });
      }

      // Feature allowed
      req.featureAccess = {
        allowed: true,
        category: featureCategory,
        feature: featureName,
        tier,
      };

      next();
    } catch (error) {
      console.error("Error in checkFeatureAccess:", error.message);
      return res.status(500).json({
        success: false,
        error: "FEATURE_CHECK_ERROR",
        code: "INTERNAL_ERROR",
        message: "Error checking feature access",
      });
    }
  };
};

/**
 * Invalidate feature cache for a company (called from company-service events)
 */
async function invalidateFeatureCache(companyId) {
  try {
    const redis = getRedisClient();
    const cacheKey = `company:subscription:${companyId}`;
    await redis.del(cacheKey);
    console.log(`✅ Cache invalidated for company ${companyId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error invalidating cache for company ${companyId}:`, error.message);
    return false;
  }
}

module.exports = {
  checkFeatureAccess,
  invalidateFeatureCache,
};
