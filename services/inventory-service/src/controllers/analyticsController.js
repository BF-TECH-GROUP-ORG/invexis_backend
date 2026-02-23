/**
 * Analytics Controller
 * Exposes inventory analytics queries: profit, margins, forecasting, stockout risk
 */

// Manual async wrapper instead of express-async-handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
const AnalyticsService = require('../services/analyticsService');
const InventoryAnalyticsService = require('../services/inventoryAnalyticsService');
const { getCache, setCache } = require('../utils/redisHelper');
const logger = require('../utils/logger');

/**
 * GET /inventory/v1/analytics/overview
 * Get comprehensive inventory overview (20+ datasets)
 * Query params: companyId (required), shopId, startDate, endDate
 */
const getOverview = asyncHandler(async (req, res) => {
  const { companyId, shopId, startDate, endDate, timezone } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  // Ensure dates are present
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(end.getDate() - 30));

  const overview = await AnalyticsService.getOverview({
    companyId,
    shopId: shopId || null,
    startDate: start,
    endDate: end,
    timezone: timezone || 'UTC'
  });

  res.status(200).json({ success: true, data: overview });
});

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

  // Enriching company metrics using new service
  const snapshot = await AnalyticsService.getInventorySnapshot(companyId);
  const kpis = await AnalyticsService.getKPIs(companyId, null, startDate || new Date(Date.now() - 30 * 24 * 3600 * 1000), endDate || new Date());

  // Combine for legacy compatibility but richer
  const metrics = {
    companyId,
    period: { startDate, endDate },
    sales: {
      totalUnits: kpis.stockOutUnits, // Using stockOut as proxy for sales in KPI
      // kpis.grossProfit / kpis.grossMargin can derive revenue
      totalRevenue: kpis.grossMargin ? (kpis.grossProfit / (kpis.grossMargin / 100)) : 0
    },
    inventory: snapshot,
    profitability: {
      totalProfit: kpis.grossProfit,
      profitMarginPercent: kpis.grossMargin,
      costOfGoods: (kpis.grossMargin ? (kpis.grossProfit / (kpis.grossMargin / 100)) : 0) - kpis.grossProfit
    },
    metrics: {
      turnoverRatio: kpis.inventoryTurnoverRatio,
      holdingDays: kpis.inventoryHoldingDays
    }
  };

  setCache(cacheKey, metrics, 300).catch(() => { });
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

  const shopPerf = await AnalyticsService.getShopPerformance(companyId, startDate || new Date(Date.now() - 30 * 24 * 3600 * 1000), endDate || new Date());
  const myShop = shopPerf.find(s => s.shopId === shopId) || {};

  // Augment with snapshot specific to shop
  const snapshot = await AnalyticsService.getInventorySnapshot(companyId, shopId);

  const metrics = {
    shopId,
    performance: myShop,
    inventory: snapshot
  };

  setCache(cacheKey, metrics, 300).catch(() => { });
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

  const analytics = await AnalyticsService.getProductAnalytics(productId);
  setCache(cacheKey, analytics, 300).catch(() => { });
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

  const products = await AnalyticsService.getTopProducts(companyId, null); // uses 30 day lookback internally
  setCache(cacheKey, products, 300).catch(() => { });
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

  const products = await AnalyticsService.getLowStockProducts(companyId, shopId);
  setCache(cacheKey, products, 300).catch(() => { });
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

  const riskData = await AnalyticsService.getRisksAndHealth(companyId);
  setCache(cacheKey, riskData.stockoutRisks, 300).catch(() => { });
  res.status(200).json({ success: true, data: riskData.stockoutRisks, count: riskData.stockoutRisks.length });
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

  const trends = await AnalyticsService.getInventoryTrends(
    companyId,
    shopId || null,
    period,
    parseInt(rangeInDays)
  );

  setCache(cacheKey, trends, 300).catch(() => { });
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

  const comparison = await AnalyticsService.getProfitComparison(companyId, shopId || null);
  setCache(cacheKey, comparison, 300).catch(() => { });
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

  const trends = await AnalyticsService.getProductProfitTrends(
    companyId,
    productId || null,
    parseInt(rangeInDays)
  );
  setCache(cacheKey, trends, 300).catch(() => { });
  res.status(200).json({ success: true, ...trends });
});

/**
 * GET /inventory/v1/analytics/stock-change-history
 * Get comprehensive stock change history with statistics
 */
const getStockChangeHistory = asyncHandler(async (req, res) => {
  const {
    companyId,
    shopId,
    userId,
    productId,
    type,
    startDate,
    endDate,
    page,
    limit
  } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const result = await AnalyticsService.getStockChangeHistory({
    companyId,
    shopId,
    userId,
    productId,
    type,
    startDate,
    endDate,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50
  });

  res.status(200).json({ success: true, ...result });
});

/**
 * GET /inventory/v1/analytics/shrinkage
 * Get shrinkage report (financial loss from discrepancies)
 */
const getShrinkageReport = asyncHandler(async (req, res) => {
  const { companyId, shopId, startDate, endDate } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const report = await InventoryAnalyticsService.getShrinkageReport(companyId, shopId, {
    startDate,
    endDate
  });

  res.status(200).json({ success: true, data: report });
});

module.exports = {
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
};
