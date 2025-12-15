const express = require('express');
const router = express.Router();
const {
  getShopProducts,
  getShopProductInventory,
  allocateInventoryToShop,
  getShopInventorySummary,
  getShopTopSellers,
  getShopAdvancedAnalytics,
  getProductComparison,
  getShopPerformanceMetrics
} = require('../controllers/shopInventoryController');

// Shop inventory routes
router.get('/shops/:shopId/products', getShopProducts);
router.get('/shops/:shopId/products/:productId', getShopProductInventory);
router.post('/shops/:shopId/allocate', allocateInventoryToShop);
router.get('/shops/:shopId/summary', getShopInventorySummary);

// Advanced analytics routes
router.get('/shops/:shopId/top-sellers', getShopTopSellers);
router.get('/shops/:shopId/analytics', getShopAdvancedAnalytics);
router.get('/shops/:shopId/product-comparison', getProductComparison);
router.get('/shops/:shopId/performance', getShopPerformanceMetrics);

module.exports = router;
