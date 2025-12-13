// shared/middlewares/subscription/production-subscription.js
// Production-ready subscription and feature access middleware

const axios = require('axios');
const { getLogger } = require('../../logger');
const redis = require('/app/shared/redis');
const tiers = require('./tiers');

const logger = getLogger('subscription-middleware');
const COMPANY_SERVICE_URL = process.env.COMPANY_SERVICE_URL || 'http://company-service:8003';
const SUBSCRIPTION_CACHE_TTL = 300; // 5 minutes

class SubscriptionError extends Error {
  constructor(message, code = 'SUBSCRIPTION_ERROR') {
    super(message);
    this.name = 'SubscriptionError';
    this.code = code;
    this.statusCode = 403;
  }
}

/**
 * Fetch company subscription from company service
 */
async function fetchSubscriptionData(companyId) {
  const cacheKey = `subscription:${companyId}`;
  
  try {
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Subscription data retrieved from cache', { companyId });
      return JSON.parse(cached);
    }

    // Fetch from company service
    const response = await axios.get(`${COMPANY_SERVICE_URL}/company/${companyId}/subscription`, {
      headers: { 'X-Gateway-Request': 'true' },
      timeout: 5000
    });

    const subscriptionData = response.data;
    
    // Cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(subscriptionData), 'EX', SUBSCRIPTION_CACHE_TTL);
    
    logger.debug('Subscription data fetched from company service', { companyId });
    return subscriptionData;
    
  } catch (error) {
    logger.error('Failed to fetch subscription data', { 
      companyId, 
      error: error.message,
      status: error.response?.status
    });
    return null;
  }
}

/**
 * Check if subscription is active
 */
const checkSubscriptionStatus = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const companyId = req.companyId || req.params.companyId || req.user.companyId;
      
      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: 'Company ID required for subscription check',
          code: 'MISSING_COMPANY_ID'
        });
      }

      const subscriptionData = await fetchSubscriptionData(companyId);
      
      if (!subscriptionData) {
        throw new SubscriptionError('Unable to verify subscription status', 'SUBSCRIPTION_CHECK_FAILED');
      }

      const { subscription } = subscriptionData;
      
      if (!subscription || !subscription.isActive) {
        throw new SubscriptionError('Active subscription required', 'SUBSCRIPTION_INACTIVE');
      }

      // Check if subscription is expired
      if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
        throw new SubscriptionError('Subscription has expired', 'SUBSCRIPTION_EXPIRED');
      }

      // Attach subscription info to request
      req.subscription = subscription;
      req.companyId = companyId;
      
      logger.debug('Subscription verified', { 
        companyId, 
        tier: subscription.tier,
        status: subscription.status
      });
      
      next();
      
    } catch (error) {
      if (error instanceof SubscriptionError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      }
      
      logger.error('Subscription check error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Subscription service error',
        code: 'SUBSCRIPTION_SERVICE_ERROR'
      });
    }
  };
};

/**
 * Check subscription tier requirement
 */
const requireTier = (minTier) => {
  return (req, res, next) => {
    if (!req.subscription) {
      return res.status(403).json({
        success: false,
        error: 'Subscription check required before tier validation',
        code: 'SUBSCRIPTION_CHECK_MISSING'
      });
    }

    const userTier = req.subscription.tier;
    const tierHierarchy = { 'basic': 0, 'mid': 1, 'pro': 2 };
    
    const userLevel = tierHierarchy[userTier] || 0;
    const requiredLevel = tierHierarchy[minTier] || 0;

    if (userLevel < requiredLevel) {
      logger.warn('Insufficient subscription tier', {
        companyId: req.companyId,
        userTier,
        requiredTier: minTier
      });
      
      return res.status(403).json({
        success: false,
        error: `${minTier} subscription tier or higher required. Current tier: ${userTier}`,
        code: 'INSUFFICIENT_TIER',
        meta: {
          currentTier: userTier,
          requiredTier: minTier
        }
      });
    }

    next();
  };
};

/**
 * Check specific feature access
 */
const requireFeatureAccess = (...features) => {
  return (req, res, next) => {
    if (!req.subscription) {
      return res.status(403).json({
        success: false,
        error: 'Subscription check required before feature validation',
        code: 'SUBSCRIPTION_CHECK_MISSING'
      });
    }

    const userTier = req.subscription.tier;
    const tierConfig = tiers.getTierConfig(userTier);
    
    if (!tierConfig) {
      return res.status(500).json({
        success: false,
        error: 'Invalid subscription tier configuration',
        code: 'INVALID_TIER_CONFIG'
      });
    }

    // Check each required feature
    const missingFeatures = [];
    for (const feature of features) {
      if (!tierConfig.features || !tierConfig.features[feature]) {
        missingFeatures.push(feature);
      }
    }

    if (missingFeatures.length > 0) {
      logger.warn('Feature access denied', {
        companyId: req.companyId,
        userTier,
        missingFeatures,
        requestedFeatures: features
      });
      
      return res.status(403).json({
        success: false,
        error: `Features not available in ${userTier} tier: ${missingFeatures.join(', ')}`,
        code: 'FEATURE_ACCESS_DENIED',
        meta: {
          missingFeatures,
          currentTier: userTier,
          availableFeatures: Object.keys(tierConfig.features || {})
        }
      });
    }

    next();
  };
};

/**
 * Usage-based rate limiting by tier
 */
const checkUsageLimits = (resource) => {
  return async (req, res, next) => {
    try {
      if (!req.subscription) {
        return res.status(403).json({
          success: false,
          error: 'Subscription check required before usage validation',
          code: 'SUBSCRIPTION_CHECK_MISSING'
        });
      }

      const userTier = req.subscription.tier;
      const tierConfig = tiers.getTierConfig(userTier);
      const limits = tierConfig.limits || {};
      const resourceLimit = limits[resource];

      if (resourceLimit === undefined) {
        // No limit defined for this resource
        return next();
      }

      if (resourceLimit === -1) {
        // Unlimited
        return next();
      }

      // Check current usage
      const usageKey = `usage:${req.companyId}:${resource}:${new Date().getMonth()}`;
      const currentUsage = parseInt(await redis.get(usageKey) || '0');

      if (currentUsage >= resourceLimit) {
        logger.warn('Usage limit exceeded', {
          companyId: req.companyId,
          resource,
          currentUsage,
          limit: resourceLimit,
          tier: userTier
        });
        
        return res.status(429).json({
          success: false,
          error: `Monthly ${resource} limit exceeded (${resourceLimit})`,
          code: 'USAGE_LIMIT_EXCEEDED',
          meta: {
            resource,
            currentUsage,
            limit: resourceLimit,
            tier: userTier
          }
        });
      }

      // Increment usage
      await redis.incr(usageKey);
      await redis.expire(usageKey, 2592000); // 30 days

      next();
      
    } catch (error) {
      logger.error('Usage check error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Usage tracking service error',
        code: 'USAGE_SERVICE_ERROR'
      });
    }
  };
};

/**
 * Invalidate subscription cache
 */
async function invalidateSubscriptionCache(companyId) {
  const cacheKey = `subscription:${companyId}`;
  await redis.del(cacheKey);
  logger.info('Subscription cache invalidated', { companyId });
}

/**
 * Middleware combinations for common use cases
 */
const requireActiveSubscription = () => [checkSubscriptionStatus()];
const requireProTier = () => [checkSubscriptionStatus(), requireTier('pro')];
const requireMidTier = () => [checkSubscriptionStatus(), requireTier('mid')];

module.exports = {
  checkSubscriptionStatus,
  requireTier,
  requireFeatureAccess,
  checkUsageLimits,
  invalidateSubscriptionCache,
  requireActiveSubscription,
  requireProTier,
  requireMidTier,
  SubscriptionError
};