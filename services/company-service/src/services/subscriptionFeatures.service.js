"use strict";

const Subscription = require("../models/subscription.model");
const Company = require("../models/company.model");
const { getTierConfig, isFeatureEnabled } = require("/app/shared/config/tierFeatures.config");

/**
 * Subscription Features Service
 * Provides methods to check feature access based on subscription tier
 */
class SubscriptionFeaturesService {
  /**
   * Get subscription features for a company
   * @param {string} companyId - Company ID
   * @returns {object} Subscription with features
   */
  static async getCompanyFeatures(companyId) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription) {
      throw new Error("Subscription not found for company");
    }

    return {
      companyId,
      tier: subscription.tier,
      tierName: getTierConfig(subscription.tier).name,
      tierDescription: getTierConfig(subscription.tier).description,
      features: subscription.getFeatures(),
      isActive: subscription.is_active,
      isExpired: subscription.isExpired(),
      isExpiringSoon: subscription.isExpiringSoon(),
      daysRemaining: subscription.getDaysRemaining(),
    };
  }

  /**
   * Check if company has access to a feature
   * @param {string} companyId - Company ID
   * @param {string} featureCategory - Feature category
   * @param {string} featureName - Feature name
   * @returns {boolean} Feature access status
   */
  static async hasFeatureAccess(companyId, featureCategory, featureName) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription || !subscription.is_active) {
      return false;
    }

    return subscription.isFeatureEnabled(featureCategory, featureName);
  }

  /**
   * Check if company has access to multiple features
   * @param {string} companyId - Company ID
   * @param {array} features - Array of {category, name} objects
   * @returns {object} Feature access status for each feature
   */
  static async hasMultipleFeatureAccess(companyId, features) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription || !subscription.is_active) {
      return features.reduce((acc, f) => {
        acc[`${f.category}.${f.name}`] = false;
        return acc;
      }, {});
    }

    return features.reduce((acc, f) => {
      acc[`${f.category}.${f.name}`] = subscription.isFeatureEnabled(
        f.category,
        f.name
      );
      return acc;
    }, {});
  }

  /**
   * Get all enabled features for a company
   * @param {string} companyId - Company ID
   * @returns {object} All enabled features
   */
  static async getEnabledFeatures(companyId) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription) {
      throw new Error("Subscription not found for company");
    }

    const allFeatures = subscription.getFeatures();
    const enabledFeatures = {};

    for (const [category, features] of Object.entries(allFeatures)) {
      enabledFeatures[category] = {};
      for (const [featureName, isEnabled] of Object.entries(features)) {
        if (isEnabled === true) {
          enabledFeatures[category][featureName] = true;
        }
      }
    }

    return enabledFeatures;
  }

  /**
   * Get all disabled features for a company
   * @param {string} companyId - Company ID
   * @returns {object} All disabled features
   */
  static async getDisabledFeatures(companyId) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription) {
      throw new Error("Subscription not found for company");
    }

    const allFeatures = subscription.getFeatures();
    const disabledFeatures = {};

    for (const [category, features] of Object.entries(allFeatures)) {
      disabledFeatures[category] = {};
      for (const [featureName, isEnabled] of Object.entries(features)) {
        if (isEnabled !== true) {
          disabledFeatures[category][featureName] = true;
        }
      }
    }

    return disabledFeatures;
  }

  /**
   * Get upgrade suggestions based on current tier
   * @param {string} companyId - Company ID
   * @returns {object} Upgrade suggestions
   */
  static async getUpgradeSuggestions(companyId) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription) {
      throw new Error("Subscription not found for company");
    }

    const currentTier = subscription.tier;
    const suggestions = {
      currentTier,
      currentTierName: getTierConfig(currentTier).name,
      availableUpgrades: [],
    };

    // Suggest upgrades based on current tier
    if (currentTier === "basic") {
      suggestions.availableUpgrades.push({
        tier: "mid",
        tierName: getTierConfig("mid").name,
        description: getTierConfig("mid").description,
        newFeatures: this._getNewFeatures("basic", "mid"),
      });
      suggestions.availableUpgrades.push({
        tier: "pro",
        tierName: getTierConfig("pro").name,
        description: getTierConfig("pro").description,
        newFeatures: this._getNewFeatures("basic", "pro"),
      });
    } else if (currentTier === "mid") {
      suggestions.availableUpgrades.push({
        tier: "pro",
        tierName: getTierConfig("pro").name,
        description: getTierConfig("pro").description,
        newFeatures: this._getNewFeatures("mid", "pro"),
      });
    }

    return suggestions;
  }

  /**
   * Get new features when upgrading from one tier to another
   * @private
   * @param {string} fromTier - Current tier
   * @param {string} toTier - Target tier
   * @returns {array} New features
   */
  static _getNewFeatures(fromTier, toTier) {
    const fromFeatures = getTierConfig(fromTier).features;
    const toFeatures = getTierConfig(toTier).features;
    const newFeatures = [];

    for (const [category, features] of Object.entries(toFeatures)) {
      for (const [featureName, isEnabled] of Object.entries(features)) {
        if (
          isEnabled === true &&
          fromFeatures[category]?.[featureName] !== true
        ) {
          newFeatures.push({
            category,
            name: featureName,
          });
        }
      }
    }

    return newFeatures;
  }

  /**
   * Check if company can access a service
   * @param {string} companyId - Company ID
   * @param {string} serviceName - Service name (e.g., "ecommerce", "ai", "analytics")
   * @returns {boolean} Service access status
   */
  static async canAccessService(companyId, serviceName) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription || !subscription.is_active) {
      return false;
    }

    const features = subscription.getFeatures();
    const serviceFeature = features[serviceName];

    if (!serviceFeature) {
      return false;
    }

    return serviceFeature.enabled === true;
  }

  /**
   * Get subscription summary for a company
   * @param {string} companyId - Company ID
   * @returns {object} Subscription summary
   */
  static async getSubscriptionSummary(companyId) {
    const subscription = await Subscription.findByCompany(companyId);
    if (!subscription) {
      throw new Error("Subscription not found for company");
    }

    const tierConfig = getTierConfig(subscription.tier);
    const enabledFeatures = await this.getEnabledFeatures(companyId);
    const disabledFeatures = await this.getDisabledFeatures(companyId);

    // Count enabled features
    let enabledCount = 0;
    for (const category of Object.values(enabledFeatures)) {
      enabledCount += Object.keys(category).length;
    }

    // Count disabled features
    let disabledCount = 0;
    for (const category of Object.values(disabledFeatures)) {
      disabledCount += Object.keys(category).length;
    }

    return {
      companyId,
      tier: subscription.tier,
      tierName: tierConfig.name,
      tierDescription: tierConfig.description,
      tierPrice: tierConfig.price,
      billingCycle: tierConfig.billingCycle,
      isActive: subscription.is_active,
      isExpired: subscription.isExpired(),
      isExpiringSoon: subscription.isExpiringSoon(),
      daysRemaining: subscription.getDaysRemaining(),
      startDate: subscription.start_date,
      endDate: subscription.end_date,
      amount: subscription.amount,
      currency: subscription.currency,
      enabledFeaturesCount: enabledCount,
      disabledFeaturesCount: disabledCount,
      totalFeaturesCount: enabledCount + disabledCount,
    };
  }
}

module.exports = SubscriptionFeaturesService;

