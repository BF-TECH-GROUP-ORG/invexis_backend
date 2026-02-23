/**
 * Analytics Routes
 * Profit, margin, forecast, and stockout risk reporting endpoints
 */

const express = require('express');
const router = express.Router();
const {
  getOverview,
  getCompanyMetrics,
  getShopMetrics,
  getProductAnalytics,
  getTopProductsByProfit,
  getLowStockProducts,
  getStockoutRiskProducts,
  getInventoryTrendsGraph,
  getProfitComparisonGraph,
  getProductProfitTrendsGraph,
  getStockChangeHistory,
  getShrinkageReport
} = require('../controllers/analyticsController');

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');
const { requireTier } = require('/app/shared/middlewares/subscription/production-subscription');

// All analytics now available for all tiers
// router.use(requireTier('pro'));
router.get('/overview', authenticateToken, requireRole(['super_admin', 'company_admin']), getOverview);

/**
 * Stock Change History (with multi-level filtering and stats)
 */
router.get('/stock-change-history', authenticateToken, requireRole(['super_admin', 'company_admin']), getStockChangeHistory);

/**
 * Company-level analytics
 */
router.get('/company-metrics', authenticateToken, requireRole(['super_admin', 'company_admin']), getCompanyMetrics);

/**
 * Shop-level analytics
 */
router.get('/shop-metrics/:shopId', authenticateToken, requireRole(['super_admin', 'company_admin']), getShopMetrics);

/**
 * Product-level analytics
 */
router.get('/product/:productId', authenticateToken, requireRole(['super_admin', 'company_admin']), getProductAnalytics);

/**
 * Top products by profit
 */
router.get('/top-products', authenticateToken, requireRole(['super_admin', 'company_admin']), getTopProductsByProfit);

/**
 * Low stock alerts
 */
router.get('/low-stock', authenticateToken, requireRole(['super_admin', 'company_admin']), getLowStockProducts);

/**
 * Stockout risk predictions
 */
router.get('/stockout-risk', authenticateToken, requireRole(['super_admin', 'company_admin']), getStockoutRiskProducts);

/**
 * Audit & Shrinkage Reports
 */
router.get('/shrinkage', authenticateToken, requireRole(['super_admin', 'company_admin']), getShrinkageReport);

/**
 * Graph data endpoints
 */

/**
 * Inventory trends graph (time-series stock movements, velocity, revenue, cost)
 */
router.get('/graphs/inventory-trends', authenticateToken, requireRole(['super_admin', 'company_admin']), getInventoryTrendsGraph);

/**
 * Profit comparison graph (today vs yesterday, week, month, year)
 */
router.get('/graphs/profit-comparison', authenticateToken, requireRole(['super_admin', 'company_admin']), getProfitComparisonGraph);

/**
 * Product profit trends (daily breakdown, top 10 products or specific product)
 */
router.get('/graphs/product-profit-trends', authenticateToken, requireRole(['super_admin', 'company_admin']), getProductProfitTrendsGraph);

module.exports = router;
