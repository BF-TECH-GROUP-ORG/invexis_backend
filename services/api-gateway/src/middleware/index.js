"use strict";

/**
 * API Gateway Subscription & Access Control Middleware
 * 
 * Unified middleware stack for enterprise-grade access control:
 * 1. checkSubscriptionStatus() - Validates active subscription with Redis caching
 * 2. checkSubscriptionTier() - Enforces tier hierarchy (basic 0 → mid 1 → pro 2)
 * 3. checkFeatureAccess() - Feature-based access control via tier config
 * 4. checkRateLimits() - Per-tier rate limiting with Redis support
 * 
 * All middleware integrates with Redis for caching and performance
 * Receives cache invalidation events from company-service
 * 
 * Usage:
 * ```javascript
 * const { 
 *   checkSubscriptionStatus,
 *   checkSubscriptionTier,
 *   checkFeatureAccess,
 *   checkRateLimits
 * } = require('./middleware');
 * 
 * // Protect sales route with subscription check + feature access
 * app.post('/api/sales', 
 *   checkSubscriptionStatus(),
 *   checkFeatureAccess('sales', 'invoicing'),
 *   controller
 * );
 * 
 * // Protect analytics for pro tier only
 * app.get('/api/analytics/dashboard',
 *   checkSubscriptionStatus(),
 *   checkSubscriptionTier('pro'),
 *   controller
 * );
 * ```
 */

const checkSubscriptionStatus = require("./checkSubscriptionStatus");
const checkSubscriptionTier = require("./checkSubscriptionTier");
const { checkFeatureAccess } = require("./checkFeatureAccess");
const checkRateLimits = require("./checkRateLimits");

module.exports = {
  checkSubscriptionStatus: checkSubscriptionStatus.checkSubscriptionStatus || checkSubscriptionStatus,
  invalidateSubscriptionCache: checkSubscriptionStatus.invalidateSubscriptionCache,
  checkSubscriptionTier,
  checkFeatureAccess,
  invalidateFeatureCache: require("./checkFeatureAccess").invalidateFeatureCache,
  checkRateLimits,
};
