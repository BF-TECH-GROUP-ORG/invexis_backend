// shared/middlewares/subscription/production-subscription.js
// Production-ready subscription and feature access middleware

const { getLogger } = require('/app/shared/logger');
const redis = require('/app/shared/redis');
const tiers = require('/app/shared/config/tierFeatures.config');

const logger = getLogger('subscription-middleware');

class SubscriptionError extends Error {
  constructor(message, code = 'SUBSCRIPTION_ERROR') {
    super(message);
    this.name = 'SubscriptionError';
    this.code = code;
    this.statusCode = 403;
  }
}

// Subscription state is pushed to Redis via events from company-service.
// The Gateway maintains a real-time cache to avoid axios calls.

/**
 * Check if subscription is active
 */
const checkSubscriptionStatus = () => {
  return async (req, res, next) => {
    try {
      // Bypass for super_admin
      if (req.user && req.user.role === 'super_admin') {
        req.subscription = { tier: 'pro', is_active: true, source: 'super-admin-bypass' };
        return next();
      }

      // 1. Try to extract companyId from JWT (populated by authenticateToken)
      let companyId = req.companyId;

      if (!companyId && req.user) {
        // Match production-auth.js logic: extract from user object or token claims
        companyId = (req.user.companies && req.user.companies[0]) ||
          (req.decodedToken && (req.decodedToken.companyId || (req.decodedToken.companies && req.decodedToken.companies[0])));
      }

      // Fallback to headers or params
      if (!companyId) {
        companyId = req.params.companyId || req.body.companyId || req.query.companyId || req.header('X-Company-Id');
      }

      if (!companyId) {
        throw new SubscriptionError('Company identification required for subscription verification', 'MISSING_COMPANY_ID');
      }

      // 2. Pure Redis Verification (Real-time cache populated by events)
      const cacheKey = `company:subscription:${companyId}`;
      const cached = await redis.get(cacheKey);

      if (!cached) {
        // Log warning for missing cache
        logger.warn('Subscription cache miss - fetching from company-service', { companyId });

        // Super admins can bypass if cache is missing (fallback safety)
        if (req.user && req.user.role === 'super_admin') {
          req.subscription = { tier: 'pro', is_active: true, source: 'super-admin-bypass' };
          return next();
        }

        // Fallback: Fetch from company-service and populate cache
        try {
          const axios = require('axios');
          const COMPANY_SERVICE_URL = process.env.COMPANY_SERVICE_URL || 'http://company-service:8004';

          const response = await axios.get(`${COMPANY_SERVICE_URL}/company/companies/${companyId}`, {
            timeout: 5000,
            headers: {
              'X-Internal-Request': 'true' // Mark as internal to bypass some middlewares
            }
          });

          const company = response.data.data;
          if (!company) {
            throw new SubscriptionError('Company not found', 'COMPANY_NOT_FOUND');
          }

          const subscription = company.subscription;
          if (!subscription) {
            throw new SubscriptionError('No subscription found for company', 'SUBSCRIPTION_NOT_FOUND');
          }

          // Populate cache for future requests (7 days TTL)
          const cacheData = {
            is_active: subscription.is_active,
            tier: subscription.tier || company.tier,
            end_date: subscription.end_date,
            company_status: company.status,
            last_updated: new Date().toISOString()
          };

          await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', 604800);
          logger.info('Populated subscription cache from database', { companyId });

          // Continue with the fetched data
          const { is_active, tier, end_date, company_status } = cacheData;

          // Check Company Status
          if (company_status === 'suspended' || company_status === 'inactive') {
            throw new SubscriptionError(`Company access is ${company_status}. Please contact support.`, 'COMPANY_SUSPENDED');
          }

          // Check Subscription Activity
          if (is_active === false) {
            throw new SubscriptionError('Active subscription required', 'SUBSCRIPTION_INACTIVE');
          }

          // Check Expiry
          if (end_date && new Date(end_date) < new Date()) {
            throw new SubscriptionError('Subscription has expired', 'SUBSCRIPTION_EXPIRED');
          }

          req.subscription = { tier, is_active, end_date, company_status };
          req.companyId = companyId;
          return next();

        } catch (fetchError) {
          if (fetchError instanceof SubscriptionError) {
            throw fetchError;
          }

          logger.error('Failed to fetch company data for cache population', {
            companyId,
            error: fetchError.message
          });

          throw new SubscriptionError(
            'Subscription status unverified. Please log in again or contact support.',
            'SUBSCRIPTION_UNVERIFIED'
          );
        }
      }

      const subscriptionData = JSON.parse(cached);
      const { is_active, company_status, tier, end_date } = subscriptionData;

      // Check Company Status (Suspension/Inactivity)
      if (company_status === 'suspended' || company_status === 'inactive') {
        throw new SubscriptionError(`Company access is ${company_status}. Please contact support.`, 'COMPANY_SUSPENDED');
      }

      // Check Subscription Activity
      if (is_active === false) {
        throw new SubscriptionError('Active subscription required', 'SUBSCRIPTION_INACTIVE');
      }

      // Check Expiry (if end_date exists)
      if (end_date && new Date(end_date) < new Date()) {
        throw new SubscriptionError('Subscription has expired', 'SUBSCRIPTION_EXPIRED');
      }

      // Attach verified info to request for downstream handlers
      req.subscription = { tier, is_active, end_date, company_status };
      req.companyId = companyId;

      next();
    } catch (error) {
      if (error instanceof SubscriptionError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      }

      logger.error('Subscription verification error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Subscription verification failed',
        code: 'SUBSCRIPTION_ERROR'
      });
    }
  };
};

/**
 * Middleware for backend services to parse tier headers forwarded by API Gateway
 */
const parseTierHeaders = (req, res, next) => {
  const tier = req.header('X-Subscription-Tier');
  const isActive = req.header('X-Subscription-Active') === 'true';
  const companyId = req.header('X-Company-Id');

  if (tier) {
    req.subscription = {
      tier,
      is_active: isActive,
      source: 'gateway-headers'
    };
    if (companyId) req.companyId = companyId;
    logger.debug('Tier headers parsed', { tier, isActive, companyId });
  }

  next();
};

/**
 * Check subscription tier requirement
 */
const requireTier = (minTier) => {
  return (req, res, next) => {
    // Bypass for super_admin
    if (req.user && req.user.role === 'super_admin') {
      return next();
    }

    // 1. Check if we have subscription info (from checkSubscriptionStatus OR parseTierHeaders)
    if (!req.subscription) {
      // If we are in a service and headers are missing, it might be an internal request
      // without tier info, or direct access (which should be blocked anyway)
      return res.status(403).json({
        success: false,
        error: 'Subscription information missing',
        code: 'SUBSCRIPTION_INFO_MISSING'
      });
    }

    const userTier = req.subscription.tier;
    const tierHierarchy = { 'Basic': 0, 'Mid': 1, 'Pro': 2 };

    const userLevel = tierHierarchy[userTier] || 0;
    const requiredLevel = tierHierarchy[minTier] || 0;

    if (userLevel < requiredLevel) {
      logger.warn('Insufficient subscription tier', {
        companyId: req.companyId,
        userTier,
        requiredTier: minTier,
        source: req.subscription.source || 'cache'
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
    // Bypass for super_admin
    if (req.user && req.user.role === 'super_admin') {
      return next();
    }

    if (!req.subscription) {
      return res.status(403).json({
        success: false,
        error: 'Subscription information missing',
        code: 'SUBSCRIPTION_INFO_MISSING'
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
      // Handle nested feature checks (e.g. 'inventory.stockInOut')
      const parts = feature.split('.');
      let current = tierConfig.features;
      let access = true;

      for (const part of parts) {
        if (current && current[part] !== undefined) {
          if (typeof current[part] === 'boolean') {
            access = current[part];
            break;
          }
          current = current[part];
        } else {
          access = false;
          break;
        }
      }

      if (access === false || (current && current.enabled === false)) {
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
          currentTier: userTier
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
      // Bypass for super_admin
      if (req.user && req.user.role === 'super_admin') {
        return next();
      }

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

async function invalidateSubscriptionCache(companyId) {
  const cacheKey = `company:subscription:${companyId}`;
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
  parseTierHeaders,
  invalidateSubscriptionCache,
  requireActiveSubscription,
  requireProTier,
  requireMidTier,
  SubscriptionError
};