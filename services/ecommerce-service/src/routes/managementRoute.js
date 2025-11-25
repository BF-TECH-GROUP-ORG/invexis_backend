const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authMiddleware');

// Management Controllers
const analyticsController = require('../controllers/analyticsController');
const graphController = require('../controllers/graphController');
const productManagementController = require('../controllers/productManagementController');
const orderManagementController = require('../controllers/orderManagementController');
const userManagementController = require('../controllers/userManagementController');
const promotionManagementController = require('../controllers/promotionManagementController');
const exceptionalFeaturesController = require('../controllers/exceptionalFeaturesController');
const notificationController = require('../controllers/notificationController');

// ==========================================
// ANALYTICS ENDPOINTS
// ==========================================
router.get('/analytics/dashboard', authenticate, analyticsController.getSalesDashboard);
router.get('/analytics/top-products', authenticate, analyticsController.getTopSellingProducts);
router.get('/analytics/product', authenticate, analyticsController.getProductAnalytics);
router.get('/analytics/category-sales', authenticate, analyticsController.getCategorySales);
router.get('/analytics/order-status', authenticate, analyticsController.getOrderStatusDistribution);
router.get('/analytics/revenue-trends', authenticate, analyticsController.getRevenueTrends);

// ==========================================
// GRAPH & RELATIONSHIP DATA
// ==========================================
router.get('/graph/related-products', authenticate, graphController.getRelatedProducts);
router.get('/graph/frequently-bought', authenticate, graphController.getFrequentlyBoughtTogether);
router.get('/graph/product-graph', authenticate, graphController.getProductGraph);
router.get('/graph/category-graph', authenticate, graphController.getCategoryGraph);
router.get('/graph/customer-patterns', authenticate, graphController.getCustomerBuyingPatterns);

// ==========================================
// PRODUCT MANAGEMENT
// ==========================================
router.post('/products/bulk-update', authenticate, productManagementController.bulkUpdateProducts);
router.post('/products/bulk-delete', authenticate, productManagementController.bulkDeleteProducts);
router.get('/products/by-category', authenticate, productManagementController.getProductsByCategory);
router.put('/products/:productId/inventory', authenticate, productManagementController.updateInventory);
router.get('/products/low-stock', authenticate, productManagementController.getLowStockProducts);
router.get('/products/out-of-stock', authenticate, productManagementController.getOutOfStockProducts);
router.get('/products/price-analytics', authenticate, productManagementController.getPriceRangeAnalytics);

// ==========================================
// ORDER MANAGEMENT
// ==========================================
router.get('/orders/filter', authenticate, orderManagementController.filterOrders);
router.post('/orders/bulk-status', authenticate, orderManagementController.bulkUpdateOrderStatus);
router.post('/orders/:orderId/refund', authenticate, orderManagementController.processRefund);
router.post('/orders/:orderId/return-request', authenticate, orderManagementController.requestReturn);
router.post('/orders/:orderId/return-approve', authenticate, orderManagementController.approveReturn);
router.get('/orders/:orderId/tracking', authenticate, orderManagementController.getOrderTracking);
router.get('/orders/refunds/analytics', authenticate, orderManagementController.getRefundAnalytics);

// ==========================================
// USER MANAGEMENT & INSIGHTS
// ==========================================
router.get('/users/:userId/purchase-history', authenticate, userManagementController.getUserPurchaseHistory);
router.get('/users/:userId/preferences', authenticate, userManagementController.getUserPreferences);
router.get('/users/segmentation', authenticate, userManagementController.getCustomerSegmentation);
router.get('/users/:userId/lifetime-value', authenticate, userManagementController.getCustomerLifetimeValue);
router.get('/users/high-value', authenticate, userManagementController.getHighValueCustomers);
router.get('/users/inactive', authenticate, userManagementController.getInactiveCustomers);

// ==========================================
// PROMOTION & CAMPAIGN MANAGEMENT
// ==========================================
router.post('/promotions/seasonal-campaigns', authenticate, promotionManagementController.createSeasonalCampaign);
router.get('/promotions/active-campaigns', authenticate, promotionManagementController.getActiveCampaigns);
router.get('/promotions/dynamic-pricing', authenticate, promotionManagementController.applyDynamicPricing);
router.post('/promotions/flash-sales', authenticate, promotionManagementController.createFlashSale);
router.get('/promotions/flash-sale-status', authenticate, promotionManagementController.getFlashSaleStatus);
router.post('/promotions/buyXgetY', authenticate, promotionManagementController.createBuyXGetYPromotion);
router.post('/promotions/validate-apply', authenticate, promotionManagementController.validateAndApplyPromotion);
router.get('/promotions/recommendations', authenticate, promotionManagementController.getPromotionRecommendations);

// ==========================================
// EXCEPTIONAL FEATURES (Magic Features)
// ==========================================
router.get('/features/personalized-homepage', exceptionalFeaturesController.getPersonalizedHomepage);
router.get('/features/ai-recommendations', exceptionalFeaturesController.getAIBasedRecommendations);
router.get('/features/seasonal-products', exceptionalFeaturesController.getSeasonalProducts);
router.get('/features/viewed-together', exceptionalFeaturesController.getFrequentlyViewedTogether);
router.get('/features/magic-deals', exceptionalFeaturesController.getMagicDeals);
router.get('/features/smart-search', exceptionalFeaturesController.smartSearch);

// ==========================================
// NOTIFICATIONS & ENGAGEMENT
// ==========================================
router.post('/notifications/preferences', authenticate, notificationController.setNotificationPreferences);
router.get('/notifications/preferences', authenticate, notificationController.getNotificationPreferences);
router.post('/notifications/trigger', authenticate, notificationController.triggerPersonalNotification);
router.get('/notifications', authenticate, notificationController.getNotifications);
router.post('/notifications/read', authenticate, notificationController.markNotificationAsRead);
router.post('/notifications/abandoned-cart', notificationController.sendAbandonedCartReminder);
router.post('/notifications/price-drop', authenticate, notificationController.sendPriceDropAlert);
router.post('/notifications/back-in-stock', authenticate, notificationController.sendBackInStockAlert);
router.post('/notifications/order-status', authenticate, notificationController.sendOrderStatusNotification);
router.post('/notifications/special-occasion', authenticate, notificationController.sendSpecialOccasionOffer);
router.post('/notifications/batch', authenticate, notificationController.sendBatchNotification);

module.exports = router;
