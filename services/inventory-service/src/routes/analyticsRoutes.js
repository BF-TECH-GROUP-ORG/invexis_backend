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

/**
 * Company-level analytics
 */
router.get('/company-metrics', getCompanyMetrics);

/**
 * Shop-level analytics
 */
router.get('/shop-metrics/:shopId', getShopMetrics);

/**
 * Product-level analytics
 */
router.get('/product/:productId', getProductAnalytics);

/**
 * Top products by profit
 */
router.get('/top-products', getTopProductsByProfit);

/**
 * Low stock alerts
 */
router.get('/low-stock', getLowStockProducts);

/**
 * Stockout risk predictions
 */
router.get('/stockout-risk', getStockoutRiskProducts);

/**
 * Graph data endpoints
 */

/**
 * Inventory trends graph (time-series stock movements, velocity, revenue, cost)
 */
router.get('/graphs/inventory-trends', getInventoryTrendsGraph);

/**
 * Profit comparison graph (today vs yesterday, week, month, year)
 */
router.get('/graphs/profit-comparison', getProfitComparisonGraph);

/**
 * Product profit trends (daily breakdown, top 10 products or specific product)
 */
router.get('/graphs/product-profit-trends', getProductProfitTrendsGraph);

module.exports = router;
