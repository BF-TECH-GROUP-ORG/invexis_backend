/**
 * Analytics Routes
 * Profit, margin, forecast, and stockout risk reporting endpoints
 */

const express = require('express');
const router = express.Router();
const {
  getCompanyMetrics,
  getShopMetrics,
  getProductAnalytics,
  getTopProductsByProfit,
  getLowStockProducts,
  getStockoutRiskProducts,
  getInventoryTrendsGraph,
  getProfitComparisonGraph,
  getProductProfitTrendsGraph
} = require('../controllers/analyticsController');

const { authenticateToken, requireRole } = require('/app/shared/middlewares/auth/production-auth');

/**
 * Company-level analytics
 */
router.get('/company-metrics', authenticateToken, requireRole(['super_admin','company_admin']), getCompanyMetrics);

/**
 * Shop-level analytics
 */
router.get('/shop-metrics/:shopId', authenticateToken, requireRole(['super_admin','company_admin']), getShopMetrics);

/**
 * Product-level analytics
 */
router.get('/product/:productId', authenticateToken, requireRole(['super_admin','company_admin']), getProductAnalytics);

/**
 * Top products by profit
 */
router.get('/top-products', authenticateToken, requireRole(['super_admin','company_admin']), getTopProductsByProfit);

/**
 * Low stock alerts
 */
router.get('/low-stock', authenticateToken, requireRole(['super_admin','company_admin']), getLowStockProducts);

/**
 * Stockout risk predictions
 */
router.get('/stockout-risk', authenticateToken, requireRole(['super_admin','company_admin']), getStockoutRiskProducts);

/**
 * Graph data endpoints
 */

/**
 * Inventory trends graph (time-series stock movements, velocity, revenue, cost)
 */
router.get('/graphs/inventory-trends', authenticateToken, requireRole(['super_admin','company_admin']), getInventoryTrendsGraph);

/**
 * Profit comparison graph (today vs yesterday, week, month, year)
 */
router.get('/graphs/profit-comparison', authenticateToken, requireRole(['super_admin','company_admin']), getProfitComparisonGraph);

/**
 * Product profit trends (daily breakdown, top 10 products or specific product)
 */
router.get('/graphs/product-profit-trends', authenticateToken, requireRole(['super_admin','company_admin']), getProductProfitTrendsGraph);

module.exports = router;
