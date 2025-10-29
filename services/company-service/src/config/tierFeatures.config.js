"use strict";

/**
 * Tier-based feature configuration
 * Defines what features are available for each subscription tier
 */

const TIER_FEATURES = {
  basic: {
    name: "Basic Tier",
    description: "Essential features for small businesses",
    price: 0, // Base price (in RWF)
    billingCycle: "monthly",
    features: {
      // Company Management
      companyManagement: {
        enabled: true,
        basicProfile: true,
        activation: true,
        deactivation: true,
        shopAssignment: false,
        staffLinking: false,
        aiUpgradePrediction: false,
        multiBranchCoordination: false,
      },

      // Shops
      shops: {
        enabled: true,
        crudShops: true,
        voiceAssisted: false,
        aiStaffingSuggestions: false,
        advancedScheduling: false,
      },

      // Inventory
      inventory: {
        enabled: true,
        manualStockInput: true,
        linkedWithSales: false,
        aiForecasting: false,
        predictiveReordering: false,
      },

      // Sales
      sales: {
        enabled: true,
        internalStaffSales: true,
        onlineCatalog: false,
        delivery: false,
        pickup: false,
        googleMaps: false,
        invoicing: false,
        taxes: false,
      },

      // Ecommerce
      ecommerce: {
        enabled: false,
        productBrowsing: false,
        search: false,
        checkout: false,
        deliveryTracking: false,
      },

      // Customer Service
      customerService: {
        enabled: false,
        customerAccounts: false,
        profiles: false,
        purchaseHistory: false,
      },

      // Payment
      payment: {
        enabled: true,
        manualRecording: true,
        ecommerceSync: false,
        invoicing: false,
        receiptExport: false,
        stripeIntegration: false,
        paypalIntegration: false,
      },

      // Notifications
      notifications: {
        enabled: true,
        inAppNotifications: true,
        realTimeUpdates: false,
        emailAlerts: false,
        smsAlerts: false,
      },

      // Analytics
      analytics: {
        enabled: true,
        limitedSummary: true,
        basicMetrics: false,
        advancedDashboards: false,
        aiTrends: false,
        kpis: false,
      },

      // AI Service
      ai: {
        enabled: false,
        productRecommendations: false,
        predictiveAnalytics: false,
        voiceRecognition: false,
        upselling: false,
      },

      // Voice Commands
      voiceCommands: {
        enabled: false,
        shopManagement: false,
        inventoryManagement: false,
        salesManagement: false,
        analyticsAccess: false,
      },

      // WebSocket
      websocket: {
        enabled: true,
        companyEvents: true,
        staffCollaboration: false,
        liveAnalytics: false,
        aiRecommendations: false,
      },

      // Audit
      audit: {
        enabled: true,
        internalActions: true,
        perCompanyEvents: false,
        aiVoiceInteractionLogs: false,
      },
    },
  },

  mid: {
    name: "Mid Tier",
    description: "Advanced features for growing businesses",
    price: 50000, // In RWF
    billingCycle: "monthly",
    features: {
      // Company Management
      companyManagement: {
        enabled: true,
        basicProfile: true,
        activation: true,
        deactivation: true,
        shopAssignment: true,
        staffLinking: true,
        aiUpgradePrediction: false,
        multiBranchCoordination: false,
      },

      // Shops
      shops: {
        enabled: true,
        crudShops: true,
        voiceAssisted: true,
        aiStaffingSuggestions: false,
        advancedScheduling: false,
      },

      // Inventory
      inventory: {
        enabled: true,
        manualStockInput: true,
        linkedWithSales: true,
        aiForecasting: false,
        predictiveReordering: false,
      },

      // Sales
      sales: {
        enabled: true,
        internalStaffSales: true,
        onlineCatalog: true,
        delivery: false,
        pickup: false,
        googleMaps: false,
        invoicing: false,
        taxes: false,
      },

      // Ecommerce
      ecommerce: {
        enabled: true,
        productBrowsing: true,
        search: true,
        checkout: false,
        deliveryTracking: false,
      },

      // Customer Service
      customerService: {
        enabled: false,
        customerAccounts: false,
        profiles: false,
        purchaseHistory: false,
      },

      // Payment
      payment: {
        enabled: true,
        manualRecording: true,
        ecommerceSync: true,
        invoicing: false,
        receiptExport: false,
        stripeIntegration: false,
        paypalIntegration: false,
      },

      // Notifications
      notifications: {
        enabled: true,
        inAppNotifications: true,
        realTimeUpdates: true,
        emailAlerts: false,
        smsAlerts: false,
      },

      // Analytics
      analytics: {
        enabled: true,
        limitedSummary: false,
        basicMetrics: true,
        advancedDashboards: false,
        aiTrends: false,
        kpis: false,
      },

      // AI Service
      ai: {
        enabled: true,
        productRecommendations: true,
        predictiveAnalytics: false,
        voiceRecognition: false,
        upselling: false,
      },

      // Voice Commands
      voiceCommands: {
        enabled: true,
        shopManagement: true,
        inventoryManagement: true,
        salesManagement: false,
        analyticsAccess: false,
      },

      // WebSocket
      websocket: {
        enabled: true,
        companyEvents: true,
        staffCollaboration: true,
        liveAnalytics: false,
        aiRecommendations: false,
      },

      // Audit
      audit: {
        enabled: true,
        internalActions: true,
        perCompanyEvents: true,
        aiVoiceInteractionLogs: false,
      },
    },
  },

  pro: {
    name: "Pro Tier",
    description: "Premium features for enterprise businesses",
    price: 150000, // In RWF
    billingCycle: "monthly",
    features: {
      // Company Management
      companyManagement: {
        enabled: true,
        basicProfile: true,
        activation: true,
        deactivation: true,
        shopAssignment: true,
        staffLinking: true,
        aiUpgradePrediction: true,
        multiBranchCoordination: true,
      },

      // Shops
      shops: {
        enabled: true,
        crudShops: true,
        voiceAssisted: true,
        aiStaffingSuggestions: true,
        advancedScheduling: true,
      },

      // Inventory
      inventory: {
        enabled: true,
        manualStockInput: true,
        linkedWithSales: true,
        aiForecasting: true,
        predictiveReordering: true,
      },

      // Sales
      sales: {
        enabled: true,
        internalStaffSales: true,
        onlineCatalog: true,
        delivery: true,
        pickup: true,
        googleMaps: true,
        invoicing: true,
        taxes: true,
      },

      // Ecommerce
      ecommerce: {
        enabled: true,
        productBrowsing: true,
        search: true,
        checkout: true,
        deliveryTracking: true,
      },

      // Customer Service
      customerService: {
        enabled: true,
        customerAccounts: true,
        profiles: true,
        purchaseHistory: true,
      },

      // Payment
      payment: {
        enabled: true,
        manualRecording: true,
        ecommerceSync: true,
        invoicing: true,
        receiptExport: true,
        stripeIntegration: true,
        paypalIntegration: true,
      },

      // Notifications
      notifications: {
        enabled: true,
        inAppNotifications: true,
        realTimeUpdates: true,
        emailAlerts: true,
        smsAlerts: true,
      },

      // Analytics
      analytics: {
        enabled: true,
        limitedSummary: false,
        basicMetrics: true,
        advancedDashboards: true,
        aiTrends: true,
        kpis: true,
      },

      // AI Service
      ai: {
        enabled: true,
        productRecommendations: true,
        predictiveAnalytics: true,
        voiceRecognition: true,
        upselling: true,
      },

      // Voice Commands
      voiceCommands: {
        enabled: true,
        shopManagement: true,
        inventoryManagement: true,
        salesManagement: true,
        analyticsAccess: true,
      },

      // WebSocket
      websocket: {
        enabled: true,
        companyEvents: true,
        staffCollaboration: true,
        liveAnalytics: true,
        aiRecommendations: true,
      },

      // Audit
      audit: {
        enabled: true,
        internalActions: true,
        perCompanyEvents: true,
        aiVoiceInteractionLogs: true,
      },
    },
  },
};

/**
 * Get tier configuration
 * @param {string} tier - Tier name (basic, mid, pro)
 * @returns {object} Tier configuration
 */
function getTierConfig(tier) {
  return TIER_FEATURES[tier] || TIER_FEATURES.basic;
}

/**
 * Check if feature is enabled for tier
 * @param {string} tier - Tier name
 * @param {string} featureCategory - Feature category (e.g., "shops")
 * @param {string} featureName - Feature name (e.g., "crudShops")
 * @returns {boolean} Feature enabled status
 */
function isFeatureEnabled(tier, featureCategory, featureName) {
  const tierConfig = getTierConfig(tier);
  const category = tierConfig.features[featureCategory];
  if (!category) return false;
  return category[featureName] === true;
}

/**
 * Get all enabled features for tier
 * @param {string} tier - Tier name
 * @returns {object} All features for tier
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

