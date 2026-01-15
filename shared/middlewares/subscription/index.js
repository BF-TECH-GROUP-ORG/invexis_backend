"use strict";

const checkSubscriptionStatus = require("/app/shared/middlewares/subscription/checkSubscriptionStatus");
const checkSubscriptionTier = require("/app/shared/middlewares/subscription/checkSubscriptionTier");
const { checkFeatureAccess } = require("/app/shared/middlewares/subscription/checkFeatureAccess");
const checkRateLimits = require("/app/shared/middlewares/subscription/checkRateLimits");

module.exports = {
  checkSubscriptionStatus: checkSubscriptionStatus.checkSubscriptionStatus || checkSubscriptionStatus,
  invalidateSubscriptionCache: checkSubscriptionStatus.invalidateSubscriptionCache,
  checkSubscriptionTier,
  checkFeatureAccess,
  invalidateFeatureCache: require("./checkFeatureAccess").invalidateFeatureCache,
  checkRateLimits,
};
