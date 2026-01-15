"use strict";

/**
 * Unified Tier-Based Access Middleware for API Gateway
 * 
 * Enforces subscription tier hierarchy:
 *  - basic (0) < mid (1) < pro (2)
 * 
 * Requires checkSubscriptionStatus to run first
 * Provides clear upgrade guidance
 */

const asyncHandler = require("express-async-handler");

// Tier hierarchy
const TIER_HIERARCHY = { Basic: 0, Mid: 1, Pro: 2 };

/**
 * Check if company tier meets requirement
 * @param {string|string[]} allowedTiers - Single tier or array of tiers
 * @param {Object} options - Configuration (reserved for future use)
 * @returns {Function} Express middleware
 */
const checkSubscriptionTier = (allowedTiers, options = {}) => {
  // Normalize to array
  const tiers = Array.isArray(allowedTiers) ? allowedTiers : [allowedTiers];

  // Validate tier values
  for (const tier of tiers) {
    if (!TIER_HIERARCHY.hasOwnProperty(tier)) {
      throw new Error(`Invalid tier '${tier}'. Must be one of: ${Object.keys(TIER_HIERARCHY).join(", ")}`);
    }
  }

  return asyncHandler(async (req, res, next) => {
    try {
      // ✅ BYPASS: Super Admin always passes tier checks
      if (req.user && req.user.role === "super_admin") {
        return next();
      }

      // Require subscription to be checked first
      if (!req.subscription || !req.subscription.tier) {
        return res.status(403).json({
          success: false,
          error: "SUBSCRIPTION_REQUIRED",
          code: "SUBSCRIPTION_REQUIRED",
          message: "Subscription validation required before tier check",
        });
      }

      const currentTier = req.subscription.tier;

      // Check if current tier is in allowed list
      if (!tiers.includes(currentTier)) {
        // Find minimum required tier
        const minAllowedTiers = tiers.map((t) => TIER_HIERARCHY[t]);
        const minRequired = Math.min(...minAllowedTiers);
        const minimumTierName = Object.keys(TIER_HIERARCHY).find(
          (k) => TIER_HIERARCHY[k] === minRequired
        );

        return res.status(403).json({
          success: false,
          error: "INSUFFICIENT_TIER",
          code: "INSUFFICIENT_TIER",
          message: `This feature requires ${tiers.length > 1 ? "one of: " + tiers.join(", ") : tiers[0]
            } tier or higher`,
          currentTier,
          requiredTiers: tiers,
          minimumTierRequired: minimumTierName,
        });
      }

      // Tier check passed
      req.tierCheck = {
        passed: true,
        currentTier,
        allowedTiers: tiers,
      };

      next();
    } catch (error) {
      console.error("Error in checkSubscriptionTier:", error.message);
      return res.status(500).json({
        success: false,
        error: "TIER_CHECK_ERROR",
        code: "INTERNAL_ERROR",
        message: "Error checking subscription tier",
      });
    }
  });
};

module.exports = checkSubscriptionTier;
