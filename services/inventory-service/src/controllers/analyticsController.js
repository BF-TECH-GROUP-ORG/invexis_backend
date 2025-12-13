/**
 * Analytics Controller
 * Exposes inventory analytics queries: profit, margins, forecasting, stockout risk
 */

// Manual async wrapper instead of express-async-handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
const InventoryAnalyticsService = require('../services/inventoryAnalyticsService');
const AnalyticsGraphService = require('../services/analyticsGraphService');
const { getCache, setCache } = require('../utils/redisHelper');
const logger = require('../utils/logger');

/**
 * GET /inventory/v1/analytics/company-metrics
 * Get company-wide metrics (profit, margin, stock value, ROI)
 */
const getCompanyMetrics = asyncHandler(async (req, res) => {
  const { companyId, startDate, endDate } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  // Check cache (30 minute TTL for financial reports)
  const cacheKey = `analytics:company:${companyId}:${startDate || ''}:${endDate || ''}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const metrics = await InventoryAnalyticsService.getCompanyMetrics(companyId, { startDate, endDate });

  // Cache result
  setCache(cacheKey, metrics, 1800).catch(() => {}); // 30 min cache

  res.status(200).json({ success: true, data: metrics });
});

/**
 * GET /inventory/v1/analytics/shop-metrics/:shopId
 * Get shop-level metrics
 */
const getShopMetrics = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const { companyId, startDate, endDate } = req.query;

  if (!companyId || !shopId) {
    return res.status(400).json({ success: false, message: 'companyId and shopId are required' });
  }

  const cacheKey = `analytics:shop:${shopId}:${companyId}:${startDate || ''}:${endDate || ''}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const metrics = await InventoryAnalyticsService.getShopMetrics(companyId, shopId, { startDate, endDate });

  setCache(cacheKey, metrics, 1800).catch(() => {});

  res.status(200).json({ success: true, data: metrics });
});

/**
 * GET /inventory/v1/analytics/product/:productId
 * Get product-level profit, margin, velocity, and forecast
 */
const getProductAnalytics = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!productId) {
    return res.status(400).json({ success: false, message: 'productId is required' });
  }

  const cacheKey = `analytics:product:${productId}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const analytics = await InventoryAnalyticsService.getProductAnalytics(productId);

  setCache(cacheKey, analytics, 900).catch(() => {}); // 15 min cache

  res.status(200).json({ success: true, data: analytics });
});

/**
 * GET /inventory/v1/analytics/top-products
 * Get top 20 products by profit
 */
const getTopProductsByProfit = asyncHandler(async (req, res) => {
  const { companyId, limit = 20 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const cacheKey = `analytics:top-products:${companyId}:${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const products = await InventoryAnalyticsService.getTopProductsByProfit(companyId, parseInt(limit));

  setCache(cacheKey, products, 3600).catch(() => {}); // 1 hour cache

  res.status(200).json({ success: true, data: products, count: products.length });
});

/**
 * GET /inventory/v1/analytics/low-stock
 * Get products below stock threshold
 */
const getLowStockProducts = asyncHandler(async (req, res) => {
  const { companyId, shopId } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const cacheKey = `analytics:low-stock:${companyId}:${shopId || 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const products = await InventoryAnalyticsService.getLowStockProducts(companyId, shopId);

  setCache(cacheKey, products, 600).catch(() => {}); // 10 min cache

  res.status(200).json({ success: true, data: products, count: products.length });
});

/**
 * GET /inventory/v1/analytics/stockout-risk
 * Get products at risk of stockout
 */
const getStockoutRiskProducts = asyncHandler(async (req, res) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const cacheKey = `analytics:stockout-risk:${companyId}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const products = await InventoryAnalyticsService.getStockoutRiskProducts(companyId);

  setCache(cacheKey, products, 600).catch(() => {}); // 10 min cache

  res.status(200).json({ success: true, data: products, count: products.length });
});

/**
 * GET /inventory/v1/analytics/graphs/inventory-trends
 * Get inventory trends data (stock levels, movements, velocity) for graph visualization
 * Query params: companyId, shopId (optional), period (daily|weekly|monthly), rangeInDays (default 30)
 */
const getInventoryTrendsGraph = asyncHandler(async (req, res) => {
  const { companyId, shopId, period = 'daily', rangeInDays = 30 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const cacheKey = `analytics:graph:inventory-trends:${companyId}:${shopId || 'all'}:${period}:${rangeInDays}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const trends = await AnalyticsGraphService.getInventoryTrends(
    companyId,
    shopId || null,
    period,
    parseInt(rangeInDays)
  );

  setCache(cacheKey, trends, 900).catch(() => {}); // 15 min cache for trends

  res.status(200).json({ success: true, ...trends });
});

/**
 * GET /inventory/v1/analytics/graphs/profit-comparison
 * Get profit comparison across time periods (today vs yesterday, week, month, year)
 * Query params: companyId, shopId (optional)
 */
const getProfitComparisonGraph = asyncHandler(async (req, res) => {
  const { companyId, shopId } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const cacheKey = `analytics:graph:profit-comparison:${companyId}:${shopId || 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const comparison = await AnalyticsGraphService.getProfitComparison(companyId, shopId || null);

  setCache(cacheKey, comparison, 600).catch(() => {}); // 10 min cache for comparisons

  res.status(200).json({ success: true, ...comparison });
});

/**
 * GET /inventory/v1/analytics/graphs/product-profit-trends
 * Get product-specific profit trends (daily breakdown)
 * Query params: companyId, productId (optional), rangeInDays (default 30)
 */
const getProductProfitTrendsGraph = asyncHandler(async (req, res) => {
  const { companyId, productId, rangeInDays = 30 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const cacheKey = `analytics:graph:product-trends:${companyId}:${productId || 'top10'}:${rangeInDays}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const trends = await AnalyticsGraphService.getProductProfitTrends(
    companyId,
    productId || null,
    parseInt(rangeInDays)
  );

  setCache(cacheKey, trends, 1800).catch(() => {}); // 30 min cache for product trends

  res.status(200).json({ success: true, ...trends });
});

module.exports = {
  getCompanyMetrics,
  getShopMetrics,
  getProductAnalytics,
  getTopProductsByProfit,
  getLowStockProducts,
  getStockoutRiskProducts,
  getInventoryTrendsGraph,
  getProfitComparisonGraph,
  getProductProfitTrendsGraph
};
