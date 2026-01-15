"use strict";

/**
 * Tier-based feature configuration (AI-free realistic version)
 * Reflects the new Invexis tier structure:
 * - Basic: operational essentials
 * - Mid: scaling operations
 * - Pro: digital expansion & advanced logistics
 */

const TIER_FEATURES = {
  Basic: {
    name: "Basic Tier",
    description: "Essential operational tools for small shops",
    price: 30000,
    billingCycle: "monthly",
    features: {
      // Company & Shops
      shops: {
        enabled: true,
        singleShop: true,
        multiShop: false,
        limit: 1, // Basic tier: 1 shop
      },

      // Staff
      staffManagement: {
        enabled: true,
        addStaff: true,
        manageRoles: true,
      },

      // Inventory
      inventory: {
        enabled: true,
        stockInOut: true,
        reporting: true,
      },

      // Sales
      sales: {
        enabled: true,
        internalSales: true,
        receipts: true,
      },

      // Payments
      payment: {
        enabled: true,
        internalTierUpgrade: true, // payments via internal system to upgrade
        ecommercePayments: false,
      },

      // Notifications
      notifications: {
        enabled: true,
        inApp: true,
        realTime: true,
        email: true,
        sms: true,
      },

      // Customer Management
      customer: {
        enabled: false,
      },

      // Ecommerce
      ecommerce: {
        enabled: false,
        browse: false,
        search: false,
        checkout: false,
      },

      // Logistics
      delivery: {
        enabled: false,
        maps: false,
        tracking: false,
      },

      // AR
      augmentedReality: {
        enabled: false,
      },

      // Debt Management
      debt: {
        enabled: false,
      },

      // Analytics
      analytics: {
        enabled: true,
        basicSummary: true,
        fullDashboards: true,
      },
    },
  },

  Mid: {
    name: "Mid Tier",
    description: "Scaling features for growing businesses",
    price: 40000,
    billingCycle: "monthly",
    features: {
      // Company & Shops
      shops: {
        enabled: true,
        singleShop: false,
        multiShop: true, // mid-tier unlock
        limit: 5, // Mid tier: 5 shops
      },

      // Staff
      staffManagement: {
        enabled: true,
        addStaff: true,
        manageRoles: true,
      },

      // Inventory
      inventory: {
        enabled: true,
        stockInOut: true,
        reporting: true,
      },

      // Sales
      sales: {
        enabled: true,
        internalSales: true,
        receipts: true,
      },

      // Payments
      payment: {
        enabled: true,
        internalTierUpgrade: true,
        ecommercePayments: false,
      },

      // Notifications
      notifications: {
        enabled: true,
        inApp: true,
        realTime: true,
        email: true,
        sms: true,
      },

      // Customer Management
      customer: {
        enabled: false,
      },

      // Ecommerce
      ecommerce: {
        enabled: false,
        browse: false,
        search: false,
        checkout: false,
      },

      // Logistics
      delivery: {
        enabled: false,
      },

      // AR
      augmentedReality: {
        enabled: false,
      },

      // Debt management (Pro tier only)
      debt: {
        enabled: true, // Restricted to mid & Pro tier
      },

      // Analytics
      analytics: {
        enabled: true,
        basicSummary: true,
        fullDashboards: true,
      },
    },
  },

  Pro: {
    name: "Pro Tier",
    description: "Enterprise-grade digital commerce & logistics",
    price: 50000,
    billingCycle: "monthly",
    features: {
      // Company & Shops
      shops: {
        enabled: true,
        singleShop: false,
        multiShop: true,
        limit: -1, // Pro tier: Unlimited
      },

      // Staff
      staffManagement: {
        enabled: true,
        addStaff: true,
        manageRoles: true,
      },

      // Inventory
      inventory: {
        enabled: true,
        stockInOut: true,
        reporting: true,
      },

      // Sales
      sales: {
        enabled: true,
        internalSales: true,
        receipts: true,
      },

      // Payments
      payment: {
        enabled: true,
        internalTierUpgrade: true,
        ecommercePayments: true, // unlocks full ecommerce lifecycle
      },

      // Notifications
      notifications: {
        enabled: true,
        inApp: true,
        realTime: true,
        email: true,
        sms: true,
      },

      // Customer Management
      customer: {
        enabled: true,
        profiles: true,
        purchaseHistory: true,
      },

      // Ecommerce
      ecommerce: {
        enabled: true, // pro unlocks ecommerce
        browse: true,
        search: true,
        checkout: true,
      },

      // Logistics
      delivery: {
        enabled: true,
        maps: true, // google maps routing
        tracking: true,
      },

      // AR
      augmentedReality: {
        enabled: true, // AR optional future feature
      },

      // Debt management
      debt: {
        enabled: true,
        record: true,
        track: true,
        reports: true,
      },

      // Analytics
      analytics: {
        enabled: true,
        basicSummary: true,
        fullDashboards: true,
      },
    },
  },
};

/**
 * Get tier configuration
 * @param {string} tier
 * @returns {object}
 */
function getTierConfig(tier) {
  // Normalize tier to Title Case (Basic, Mid, Pro)
  const normalizedTier = tier ? tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase() : 'Basic';
  return TIER_FEATURES[normalizedTier] || TIER_FEATURES.Basic;
}

/**
 * Check if a feature is enabled
 */
function isFeatureEnabled(tier, category, key) {
  const t = getTierConfig(tier);
  return t.features?.[category]?.[key] === true;
}

/**
 * Get all enabled features
 */
function getEnabledFeatures(tier) {
  return getTierConfig(tier).features;
}

module.exports = {
  TIER_FEATURES,
  getTierConfig,
  isFeatureEnabled,
  getEnabledFeatures,
};
