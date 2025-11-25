const express = require('express');
const router = express.Router();

// Import all controllers
const cartController = require('../controllers/cartController');
const catalogController = require('../controllers/catalogController');
const orderController = require('../controllers/orderController');
const promotionController = require('../controllers/promotionController');
const reviewController = require('../controllers/reviewController');
const wishlistController = require('../controllers/wishlistController');
const featuredBannerController = require('../controllers/featureBannerController');
const recommendationController = require('../controllers/recommendationController');
const searchController = require('../controllers/searchController');
const orderTrackingController = require('../controllers/orderTrackingController');
const analyticsController = require('../controllers/analyticsController');
const graphController = require('../controllers/graphController');
const productManagementController = require('../controllers/productManagementController');
const orderManagementController = require('../controllers/orderManagementController');
const userManagementController = require('../controllers/userManagementController');
const promotionManagementController = require('../controllers/promotionManagementController');
const exceptionalFeaturesController = require('../controllers/exceptionalFeaturesController');
const notificationController = require('../controllers/notificationController');

// Middleware
const { authenticate, optionalAuth } = require('../middleware/auth');

// ============================================
// ROOT ENDPOINT
// ============================================
router.get('/', (req, res) => {
  res.json({
    message: 'E-commerce Service API',
    version: '2.0.0',
    status: 'running',
    features: [
      'Cart Management',
      'Wishlist Management',
      'Product Catalog',
      'Order Management',
      'Promotions & Black Friday',
      'Reviews & Ratings',
      'Recommendations',
      'Search & Filters',
      'Advanced Analytics',
      'Graph-Based Data',
      'Customer Insights',
      'Personalization',
      'Notifications'
    ]
  });
});

// Cart routes
router.get('/cart', cartController.getCart);
router.post('/cart', cartController.addOrUpdateCart); // strict: full cart create/update
router.post('/cart/remove', cartController.removeFromCart);
router.post('/cart/checkout', cartController.checkoutCart);

// Catalog routes
router.get('/products', catalogController.listProducts);
router.get('/products/:id', catalogController.getProduct);
router.post('/products', catalogController.createProduct);
router.put('/products/:id', catalogController.updateProduct);
router.delete('/products/:id', catalogController.deleteProduct);

// Order routes
router.get('/orders', orderController.listOrders);
router.get('/orders/:id', orderController.getOrder);
router.post('/orders', orderController.createOrder);
router.put('/orders/:id', orderController.updateOrder); // strict: full order update

// Promotion routes
router.get('/promotions', promotionController.listPromotions);
router.get('/promotions/:id', promotionController.getPromotion);
router.post('/promotions', promotionController.createPromotion);
router.put('/promotions/:id', promotionController.updatePromotion);
router.delete('/promotions/:id', promotionController.deletePromotion);

// Review routes
router.get('/reviews', reviewController.listReviews);
router.get('/reviews/:id', reviewController.getReview);
router.post('/reviews', reviewController.createReview);
router.patch('/reviews/:id/approve', reviewController.approveReview);
router.delete('/reviews/:id', reviewController.deleteReview);

// Wishlist routes
router.get('/wishlist', wishlistController.getWishlist);
router.post('/wishlist', wishlistController.addOrUpdateWishlist); // strict: full wishlist create/update
router.post('/wishlist/remove', wishlistController.removeFromWishlist);

// Featured Banner routes
router.get('/banners', featuredBannerController.getBanners); // List banners with filters
router.get('/banners/:companyId/:bannerId', featuredBannerController.getBannerById); // Get single banner
router.post('/banners', featuredBannerController.createBanner); // Create new banner
router.put('/banners/:companyId/:bannerId', featuredBannerController.updateBanner); // Update banner
router.delete('/banners/:companyId/:bannerId', featuredBannerController.deleteBanner); // Soft delete banner
router.patch('/banners/:companyId/:bannerId/active', featuredBannerController.toggleActive); // Toggle active status

// Recommendation routes (merged)
router.get('/recommendations', recommendationController.getRecommendations);
router.get('/recommendations/recently-viewed', recommendationController.getRecentlyViewed);

// Search routes (merged)
router.get('/search', searchController.searchProducts);
router.get('/search/filters', searchController.getFilterOptions);
router.get('/search/autocomplete', searchController.autocomplete);

// Order Tracking routes
router.get('/order-tracking/:orderId', orderTrackingController.getTracking);
router.put('/order-tracking/:orderId', orderTrackingController.updateTracking);

// ============================================
// ANALYTICS & BUSINESS INTELLIGENCE
// ============================================

// Dashboard Analytics
router.get('/analytics/dashboard', analyticsController.getDashboard);

// Product Analytics
router.get('/analytics/products', analyticsController.getProductAnalytics);
router.get('/analytics/products/:productId', analyticsController.getProductDetail);
router.get('/analytics/products/category/:category', analyticsController.getCategoryAnalytics);

// Order Analytics
router.get('/analytics/orders/status-distribution', analyticsController.getOrderStatusDistribution);
router.get('/analytics/revenue/trends', analyticsController.getRevenueTrends);

// ============================================
// GRAPH-BASED DATA & RELATIONSHIPS
// ============================================

// Related Products & Product Graphs
router.get('/graph/related-products/:productId', graphController.getRelatedProducts);
router.get('/graph/frequently-bought-together/:productId', graphController.getFrequentlyBoughtTogether);
router.get('/graph/product-relationships', graphController.getProductRelationshipGraph);
router.get('/graph/category-graph', graphController.getCategoryGraph);

// Customer Behavior Patterns
router.get('/graph/customer-patterns/:userId', graphController.getCustomerBehaviorPatterns);
router.get('/graph/customer-journey/:userId', graphController.getCustomerJourney);

// ============================================
// PRODUCT MANAGEMENT (Admin)
// ============================================

// Bulk Operations
router.post('/management/products/bulk-update', productManagementController.bulkUpdateProducts);
router.post('/management/products/bulk-delete', productManagementController.bulkDeleteProducts);
router.post('/management/products/bulk-price-update', productManagementController.bulkUpdatePrices);

// Inventory Management
router.get('/management/inventory/low-stock', productManagementController.getLowStockProducts);
router.get('/management/inventory/out-of-stock', productManagementController.getOutOfStockProducts);
router.patch('/management/inventory/:productId', productManagementController.updateInventory);

// Price Analytics
router.get('/management/products/price-analytics', productManagementController.getPriceAnalytics);
router.get('/management/products/price-optimization/:productId', productManagementController.getPriceOptimization);

// ============================================
// ORDER MANAGEMENT (Admin)
// ============================================

// Advanced Order Filtering & Management
router.get('/management/orders/advanced-filter', orderManagementController.getOrdersAdvancedFilter);
router.post('/management/orders/bulk-update-status', orderManagementController.bulkUpdateOrderStatus);
router.post('/management/orders/:orderId/refund', orderManagementController.initiateRefund);
router.post('/management/orders/:orderId/return', orderManagementController.initiateReturn);
router.get('/management/orders/:orderId/tracking-full', orderManagementController.getFullTracking);

// Refund Analytics
router.get('/management/refunds/analytics', orderManagementController.getRefundAnalytics);
router.get('/management/returns/analytics', orderManagementController.getReturnAnalytics);

// ============================================
// CUSTOMER INSIGHTS & USER MANAGEMENT (Admin)
// ============================================

// Customer Profiles & History
router.get('/management/customers/:userId/purchase-history', userManagementController.getPurchaseHistory);
router.get('/management/customers/:userId/preferences', userManagementController.getCustomerPreferences);
router.put('/management/customers/:userId/preferences', userManagementController.updateCustomerPreferences);

// Customer Lifetime Value & Segmentation
router.get('/management/customers/metrics/clv', userManagementController.getCustomerLifetimeValue);
router.get('/management/customers/segmentation', userManagementController.getCustomerSegmentation);
router.get('/management/customers/churn-analysis', userManagementController.getChurnAnalysis);

// ============================================
// PROMOTION MANAGEMENT (Admin)
// ============================================

// Campaign Management
router.post('/management/promotions/campaigns', promotionManagementController.createCampaign);
router.get('/management/promotions/campaigns', promotionManagementController.listCampaigns);
router.get('/management/promotions/campaigns/:campaignId', promotionManagementController.getCampaignDetail);
router.put('/management/promotions/campaigns/:campaignId', promotionManagementController.updateCampaign);
router.delete('/management/promotions/campaigns/:campaignId', promotionManagementController.deleteCampaign);

// Flash Sales
router.post('/management/promotions/flash-sales', promotionManagementController.createFlashSale);
router.get('/management/promotions/flash-sales', promotionManagementController.listFlashSales);
router.get('/management/promotions/flash-sales/:flashSaleId', promotionManagementController.getFlashSaleDetail);
router.put('/management/promotions/flash-sales/:flashSaleId', promotionManagementController.updateFlashSale);

// Seasonal Promotions (Black Friday, Eid, etc.)
router.post('/management/promotions/seasonal', promotionManagementController.createSeasonalPromotion);
router.get('/management/promotions/seasonal', promotionManagementController.listSeasonalPromotions);
router.put('/management/promotions/seasonal/:seasonalId', promotionManagementController.updateSeasonalPromotion);

// Bulk Promotion Application
router.post('/management/promotions/apply-bulk', promotionManagementController.applyPromotionBulk);

// Campaign Performance Analytics
router.get('/management/promotions/analytics/:campaignId', promotionManagementController.getCampaignAnalytics);

// ============================================
// EXCEPTIONAL FEATURES & ADVANCED FEATURES
// ============================================

// Personalization & AI Recommendations
router.get('/features/personalized-feed/:userId', exceptionalFeaturesController.getPersonalizedFeed);
router.post('/features/personalized-feed/:userId/refresh', exceptionalFeaturesController.refreshPersonalizedFeed);
router.get('/features/ai-recommendations/:userId', exceptionalFeaturesController.getAIRecommendations);

// Dynamic Pricing
router.get('/features/dynamic-price/:productId', exceptionalFeaturesController.getDynamicPrice);
router.post('/features/dynamic-pricing/predict', exceptionalFeaturesController.predictOptimalPrice);

// AR/VR Features
router.get('/features/ar-view/:productId', exceptionalFeaturesController.getARViewData);
router.get('/features/vr-showroom/:companyId', exceptionalFeaturesController.getVRShowroomData);

// Gamification
router.post('/features/gamification/points', exceptionalFeaturesController.addUserPoints);
router.get('/features/gamification/leaderboard', exceptionalFeaturesController.getLeaderboard);
router.get('/features/gamification/badges/:userId', exceptionalFeaturesController.getUserBadges);
router.post('/features/gamification/challenges', exceptionalFeaturesController.createChallenge);

// Social Commerce
router.post('/features/social/share/:productId', exceptionalFeaturesController.shareProduct);
router.get('/features/social/trending', exceptionalFeaturesController.getTrendingProducts);
router.post('/features/social/user-feed', exceptionalFeaturesController.createUserPost);

// ============================================
// NOTIFICATIONS & ALERTS
// ============================================

// Real-time Notifications
router.get('/notifications', notificationController.getUserNotifications);
router.post('/notifications/mark-as-read/:notificationId', notificationController.markAsRead);
router.post('/notifications/mark-all-read', notificationController.markAllAsRead);
router.delete('/notifications/:notificationId', notificationController.deleteNotification);

// Price & Stock Alerts
router.post('/notifications/price-alert', notificationController.createPriceAlert);
router.get('/notifications/price-alerts/:userId', notificationController.getUserPriceAlerts);
router.delete('/notifications/price-alert/:alertId', notificationController.deletePriceAlert);

router.post('/notifications/stock-alert', notificationController.createStockAlert);
router.get('/notifications/stock-alerts/:userId', notificationController.getUserStockAlerts);
router.delete('/notifications/stock-alert/:alertId', notificationController.deleteStockAlert);

// Notification Preferences
router.get('/notifications/preferences/:userId', notificationController.getPreferences);
router.put('/notifications/preferences/:userId', notificationController.updatePreferences);

// Broadcast Notifications (Admin)
router.post('/notifications/broadcast', notificationController.broadcastNotification);
router.post('/notifications/broadcast-segment', notificationController.broadcastToSegment);

module.exports = router;
