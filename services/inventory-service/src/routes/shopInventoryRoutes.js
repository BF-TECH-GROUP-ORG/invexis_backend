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
} = require('../controllers/organizationController');

// Shop inventory routes - All require both companyId and shopId
router.get('/shops/:shopId/products', getShopProducts);
router.get('/shops/:shopId/products/:productId', getShopProductInventory);
router.post('/shops/:shopId/allocate', allocateInventoryToShop);
router.get('/shops/:shopId/summary', getShopInventorySummary);

// Advanced analytics routes - All require both companyId and shopId
router.get('/shops/:shopId/top-sellers', getShopTopSellers);
router.get('/shops/:shopId/analytics', getShopAdvancedAnalytics);
router.get('/shops/:shopId/product-comparison', getProductComparison);
router.get('/shops/:shopId/performance', getShopPerformanceMetrics);

module.exports = router;
