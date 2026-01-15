const asyncHandler = require("express-async-handler");
const {
  isFeatureEnabled,
} = require("/app/shared/config/tierFeatures.config");
// const { ForbiddenError } = require("../../utils/error.utils");

/**
 * Middleware to check if a company's subscription plan has access to a specific feature.
 *
 * @param {string} featureCategory - The category of the feature (e.g., 'inventory').
 * @param {string} featureName - The name of the feature (e.g., 'aiForecasting').
 * @returns {function} - Express middleware function.
 */
const subscriptionMiddleware = (featureCategory, featureName) => {
  return asyncHandler(async (req, res, next) => {
    const company = req.company;

    // if (!company) {
    //   // If there's no company context, access is denied.
    //   throw new ForbiddenError(
    //     "No company context available. Access to this feature is restricted."
    //   );
    // }

    const tier = company.tier;

    // if (!tier) {
    //   // If the company has no subscription tier, access is denied.
    //   throw new ForbiddenError(
    //     "Your company does not have a subscription plan. Please subscribe to access this feature."
    //   );
    // }

    // Check if the feature is enabled for the company's tier.
    const hasAccess = isFeatureEnabled(tier, featureCategory, featureName);

    // if (!hasAccess) {
    //   // If the feature is not enabled for the tier, return a forbidden error.
    //   throw new ForbiddenError(
    //     `Your current subscription plan (${tier}) does not grant access to this feature. Please upgrade your plan.`
    //   );
    // }

    // If access is granted, proceed to the next middleware.
    next();
  });
};

module.exports = subscriptionMiddleware;
