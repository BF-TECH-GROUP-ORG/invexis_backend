// shared/middlewares/index.js
// Unified production middleware exports for Invexis microservices

const productionAuth = require('/app/shared/middlewares/auth/production-auth');
const productionSubscription = require('/app/shared/middlewares/subscription/production-subscription');

// Legacy middleware for compatibility
const legacyAuth = require('/app/shared/middlewares/auth/auth');
const legacySubscription = require('/app/shared/middlewares/subscription');

module.exports = {
  // Production middlewares (recommended for new implementations)
  auth: productionAuth,
  subscription: productionSubscription,

  // Legacy middlewares (for backward compatibility)
  legacyAuth,
  legacySubscription,

  // Convenience exports
  authenticateToken: productionAuth.authenticateToken,
  requireRole: productionAuth.requireRole,
  requireCompanyAccess: productionAuth.requireCompanyAccess,
  requireAdmin: productionAuth.requireAdmin,

  checkSubscriptionStatus: productionSubscription.checkSubscriptionStatus,
  requireTier: productionSubscription.requireTier,
  requireFeatureAccess: productionSubscription.requireFeatureAccess,
  parseTierHeaders: productionSubscription.parseTierHeaders,

  // Common middleware chains
  requireAuth: productionAuth.authenticateToken,
  requireAuthAndCompany: [productionAuth.authenticateToken, productionAuth.requireCompanyAccess],
  requireActiveSubscription: productionSubscription.requireActiveSubscription,
  requireProSubscription: productionSubscription.requireProTier,
  requireMidSubscription: productionSubscription.requireMidTier
};