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

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');


// Shop inventory routes - All require both companyId and shopId
router.get('/shops/:shopId/products', authenticateToken, requireRole(['super_admin','company_admin']), getShopProducts);
router.get('/shops/:shopId/products/:productId', authenticateToken, requireRole(['super_admin','company_admin']), getShopProductInventory);
router.post('/shops/:shopId/allocate', authenticateToken, requireRole(['super_admin','company_admin']), allocateInventoryToShop);
router.get('/shops/:shopId/summary', authenticateToken, requireRole(['super_admin','company_admin']), getShopInventorySummary);

// Advanced analytics routes - All require both companyId and shopId
router.get('/shops/:shopId/top-sellers', authenticateToken, requireRole(['super_admin','company_admin']), getShopTopSellers);
router.get('/shops/:shopId/analytics', authenticateToken, requireRole(['super_admin','company_admin']), getShopAdvancedAnalytics);
router.get('/shops/:shopId/product-comparison', authenticateToken, requireRole(['super_admin','company_admin']), getProductComparison);
router.get('/shops/:shopId/performance', authenticateToken, requireRole(['super_admin','company_admin']), getShopPerformanceMetrics);

module.exports = router;