const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const graphController = require('../controllers/graphController');
const productManagementController = require('../controllers/productManagementController');
const orderManagementController = require('../controllers/orderManagementController');
const userManagementController = require('../controllers/userManagementController');
const { authenticate } = require('../middleware/auth');

// Analytics Routes
router.get('/dashboard', authenticate, analyticsController.getSalesDashboard);
router.get('/top-selling-products', authenticate, analyticsController.getTopSellingProducts);
router.get('/product-analytics', authenticate, analyticsController.getProductAnalytics);
router.get('/category-sales', authenticate, analyticsController.getCategorySales);
router.get('/order-status-distribution', authenticate, analyticsController.getOrderStatusDistribution);
router.get('/revenue-trends', authenticate, analyticsController.getRevenueTrends);

// Graph-Based Data Routes
router.get('/related-products', authenticate, graphController.getRelatedProducts);
router.get('/frequently-bought', authenticate, graphController.getFrequentlyBoughtTogether);
router.get('/product-graph', authenticate, graphController.getProductGraph);
router.get('/category-graph', authenticate, graphController.getCategoryGraph);
router.get('/customer-patterns', authenticate, graphController.getCustomerBuyingPatterns);

// Product Management Routes
router.post('/bulk-update-products', authenticate, productManagementController.bulkUpdateProducts);
router.post('/bulk-delete-products', authenticate, productManagementController.bulkDeleteProducts);
router.get('/products-by-category', authenticate, productManagementController.getProductsByCategory);
router.put('/inventory', authenticate, productManagementController.updateInventory);
router.get('/low-stock', authenticate, productManagementController.getLowStockProducts);
router.get('/out-of-stock', authenticate, productManagementController.getOutOfStockProducts);
router.get('/price-range-analytics', authenticate, productManagementController.getPriceRangeAnalytics);

// Order Management Routes
router.get('/orders/filter', authenticate, orderManagementController.filterOrders);
router.post('/orders/bulk-status-update', authenticate, orderManagementController.bulkUpdateOrderStatus);
router.post('/orders/refund', authenticate, orderManagementController.processRefund);
router.post('/orders/return-request', authenticate, orderManagementController.requestReturn);
router.post('/orders/return-approve', authenticate, orderManagementController.approveReturn);
router.get('/orders/tracking', authenticate, orderManagementController.getOrderTracking);
router.get('/orders/refund-analytics', authenticate, orderManagementController.getRefundAnalytics);

// User Management & Insights Routes
router.get('/users/purchase-history', authenticate, userManagementController.getUserPurchaseHistory);
router.get('/users/preferences', authenticate, userManagementController.getUserPreferences);
router.get('/users/segmentation', authenticate, userManagementController.getCustomerSegmentation);
router.get('/users/lifetime-value', authenticate, userManagementController.getCustomerLifetimeValue);
router.get('/users/high-value', authenticate, userManagementController.getHighValueCustomers);
router.get('/users/inactive', authenticate, userManagementController.getInactiveCustomers);

module.exports = router;
