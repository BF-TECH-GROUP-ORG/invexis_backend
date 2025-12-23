// Manual async wrapper instead of express-async-handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
const Product = require('../models/Product');
const Category = require('../models/Category');
const StockChange = require('../models/StockChange');
const Alert = require('../models/Alert');
const Discount = require('../models/Discount');
// Warehouse model removed
const InventoryAdjustment = require('../models/InventoryAdjustment');
const { validateMongoId } = require('../utils/validateMongoId');
const { logger } = require('../utils/logger');
const { getCache, setCache } = require('../utils/redisHelper');
const AnalyticsService = require('../services/analyticsService');
const mongoose = require('mongoose');

const getDailyReport = asyncHandler(async (req, res) => {
  const { companyId } = req.query;
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { date, shopId } = req.query;
  const reportDate = date ? new Date(date) : new Date();

  // Check cache first
  const cacheKey = `report:daily:${companyId}:${date || 'today'}:${shopId || 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return res.status(200).json({ success: true, data: cached, fromCache: true });
  }

  const shopFilter = shopId ? { shopId } : {};
  reportDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(reportDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const yesterday = new Date(reportDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayNext = new Date(yesterday);
  yesterdayNext.setDate(yesterdayNext.getDate() + 1);

  // Stock changes today (StockChange schema uses `type`, `qty`, `createdAt`)
  const stockChanges = await StockChange.aggregate([
    { $match: { companyId, ...shopFilter, createdAt: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$type', count: { $sum: 1 }, totalQuantity: { $sum: '$qty' } } }
  ]);

  // Yesterday's for % change
  const yesterdayStockChanges = await StockChange.aggregate([
    { $match: { companyId, ...shopFilter, createdAt: { $gte: yesterday, $lt: yesterdayNext } } },
    { $group: { _id: '$type', count: { $sum: 1 }, totalQuantity: { $sum: '$qty' } } }
  ]);

  // Alerts generated today
  const alerts = await Alert.aggregate([
    { $match: { companyId, ...shopFilter, createdAt: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  // Yesterday's alerts for % change
  const yesterdayAlerts = await Alert.aggregate([
    { $match: { companyId, ...shopFilter, createdAt: { $gte: yesterday, $lt: yesterdayNext } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  // Sales today (absolute quantity from 'sale' changes, approximate revenue using avg price)
  const sales = await StockChange.aggregate([
    { $match: { companyId, ...shopFilter, type: 'sale', createdAt: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: null, totalUnitsSold: { $sum: { $abs: '$qty' } } } }
  ]);
  const avgPrice = await Product.aggregate([
    { $match: { companyId, ...shopFilter } },
    { $lookup: { from: 'productpricings', localField: 'pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, avgPrice: { $avg: '$pricing.basePrice' } } }
  ]);
  const todayRevenue = (sales[0]?.totalUnitsSold || 0) * (avgPrice[0]?.avgPrice || 0);

  // Yesterday's sales for % change
  const yesterdaySales = await StockChange.aggregate([
    { $match: { companyId, ...shopFilter, type: 'sale', createdAt: { $gte: yesterday, $lt: yesterdayNext } } },
    { $group: { _id: null, totalUnitsSold: { $sum: { $abs: '$qty' } } } }
  ]);
  const yesterdayRevenue = (yesterdaySales[0]?.totalUnitsSold || 0) * (avgPrice[0]?.avgPrice || 0);
  const revenueChangePct = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100) : 0;

  // Low stock count (use aggregation to avoid cast error)
  // Low stock: approximate by aggregating ProductVariation totals and comparing to ProductStock.lowStockThreshold
  const lowStockAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(shopFilter.shopId ? { 'product.shopId': shopFilter.shopId } : {}) } },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $lookup: { from: 'productstocks', localField: '_id', foreignField: 'productId', as: 'stockSettings' } },
    { $unwind: { path: '$stockSettings', preserveNullAndEmptyArrays: true } },
    { $project: { totalQty: 1, lowStockThreshold: { $ifNull: ['$stockSettings.lowStockThreshold', 10] } } },
    { $match: { $expr: { $lte: ['$totalQty', '$lowStockThreshold'] } } },
    { $count: 'lowStockCount' }
  ]);
  const lowStock = lowStockAgg[0]?.lowStockCount || 0;
  // const lowStock = lowStockResult[0]?.lowStockCount || 0;

  const totalProducts = await Product.countDocuments({ companyId, ...shopFilter });
  const lowStockPct = totalProducts > 0 ? (lowStock / totalProducts * 100) : 0;

  // Top category sales (approx via product category count in sales, with value)
  // Top category: approximate by joining product -> pricing and sales
  const topCategory = await Product.aggregate([
    { $match: { companyId, ...shopFilter } },
    { $lookup: { from: 'productpricings', localField: 'pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'stockchanges', localField: '_id', foreignField: 'productId', as: 'changes' } },
    { $unwind: { path: '$changes', preserveNullAndEmptyArrays: true } },
    { $match: { 'changes.type': 'sale', 'changes.createdAt': { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$category', productCount: { $sum: 1 }, totalValue: { $sum: { $multiply: [{ $abs: '$changes.qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } } } },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: '$category' },
    { $sort: { totalValue: -1 } },
    { $limit: 5 },
    { $project: { name: '$category.name', productCount: 1, totalValue: 1 } }
  ]);

  // Top products today
  const topProducts = await StockChange.aggregate([
    { $match: { companyId, ...shopFilter, type: 'sale', createdAt: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$productId', unitsSold: { $sum: { $abs: '$qty' } }, revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$meta.unitPrice', 0] }] } } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
    { $project: { productName: '$product.name', unitsSold: 1, revenue: 1 } }
  ]);

  // Overall efficiency metrics
  const soldAgg = await StockChange.aggregate([
    { $match: { companyId, ...shopFilter, type: 'sale' } },
    { $group: { _id: '$productId', sold: { $sum: { $abs: '$qty' } } } },
    { $group: { _id: null, avgSold: { $avg: '$sold' } } }
  ]);
  const avgSold = soldAgg[0]?.avgSold || 0;

  const variationAvgAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(shopFilter.shopId ? { 'product.shopId': shopFilter.shopId } : {}) } },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $group: { _id: null, avgQuantity: { $avg: '$totalQty' } } }
  ]);
  const avgQuantity = variationAvgAgg[0]?.avgQuantity || 0;
  const avgTurnoverRatio = avgQuantity > 0 ? avgSold / avgQuantity : 0;

  const report = {
    date: reportDate.toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    summary: {
      totalStockChanges: stockChanges.reduce((sum, change) => sum + change.count, 0),
      stockChangeGrowthPct: yesterdayStockChanges.reduce((sum, y) => sum + y.count, 0) > 0 ? ((stockChanges.reduce((sum, c) => sum + c.count, 0) - yesterdayStockChanges.reduce((sum, y) => sum + y.count, 0)) / yesterdayStockChanges.reduce((sum, y) => sum + y.count, 0) * 100) : 0,
      totalSalesUnits: sales[0]?.totalUnitsSold || 0,
      todayRevenue: parseFloat(todayRevenue.toFixed(2)),
      revenueChangePct: parseFloat((Math.round(revenueChangePct * 100) / 100).toFixed(2)),
      revenueChangeDirection: revenueChangePct > 0 ? 'UP' : (revenueChangePct < 0 ? 'DOWN' : 'STABLE'),
      lowStockCount: lowStock,
      lowStockPct: parseFloat((Math.round(lowStockPct * 100) / 100).toFixed(2)),
      totalProducts: totalProducts,
      avgTurnoverRatio: parseFloat((Math.round(avgTurnoverRatio * 100) / 100).toFixed(2))
    },
    breakdowns: {
      stockChanges: stockChanges.map(change => ({
        type: change._id,
        count: change.count,
        totalQuantity: change.totalQuantity,
        pctOfTotalChanges: stockChanges.reduce((sum, c) => sum + c.count, 0) > 0 ? parseFloat((Math.round((change.count / stockChanges.reduce((sum, c) => sum + c.count, 0) * 100) * 100) / 100).toFixed(2)) : 0
      })),
      alerts: alerts.map(alert => ({ type: alert._id, count: alert.count })),
      topCategories: topCategory.map(cat => ({
        name: cat.name,
        productCount: cat.productCount,
        estimatedRevenue: parseFloat((Math.round(cat.totalValue * 100) / 100).toFixed(2))
      })),
      topProducts: topProducts.map(p => ({
        name: p.productName,
        unitsSold: p.unitsSold,
        revenue: parseFloat(p.revenue.toFixed(2))
      }))
    },
    trends: {
      yesterdayRevenue: parseFloat(yesterdayRevenue.toFixed(2)),
      revenueGrowthPct: parseFloat(revenueChangePct.toFixed(2)),
      revenueGrowthDirection: revenueChangePct > 0 ? '📈 UP' : (revenueChangePct < 0 ? '📉 DOWN' : '→ STABLE'),
      alertCount: {
        today: alerts.reduce((sum, a) => sum + a.count, 0),
        yesterday: yesterdayAlerts.reduce((sum, y) => sum + y.count, 0),
        growthPct: yesterdayAlerts.reduce((sum, y) => sum + y.count, 0) > 0 ? parseFloat((((alerts.reduce((sum, a) => sum + a.count, 0) - yesterdayAlerts.reduce((sum, y) => sum + y.count, 0)) / yesterdayAlerts.reduce((sum, y) => sum + y.count, 0)) * 100).toFixed(2)) : 0
      }
    },
    kpis: {
      inventoryHealth: {
        status: lowStockPct < 15 ? 'Excellent' : (lowStockPct < 30 ? 'Good' : 'Needs Attention'),
        lowStockPercentage: parseFloat(lowStockPct.toFixed(2)),
        recommendation: lowStockPct < 15 ? '✅ Inventory levels are healthy' : (lowStockPct < 30 ? '🟡 Monitor reorder points' : '🔴 Review stock urgently')
      },
      revenueForecast: {
        monthlyProjection: parseFloat((todayRevenue * 30).toFixed(2)),
        yearlyProjection: parseFloat((todayRevenue * 365).toFixed(2)),
        basis: 'Extrapolated from today\'s sales'
      },
      benchmarks: {
        idealLowStockPct: 10,
        idealTurnover: '4x/year',
        currentStatus: 'On Track'
      }
    }
  };

  // Cache for 1 hour
  setCache(cacheKey, report, 3600).catch(() => { });

  res.json({ success: true, data: report });
});

/**
 * Get user activity report
 * GET /v1/report/user-activity
 * Query: userId (required), companyId (required), shopId (optional), startDate, endDate, page, limit
 */
const getUserActivityReport = asyncHandler(async (req, res) => {
  const { userId, companyId, shopId, startDate, endDate, page = 1, limit = 50 } = req.query;
  if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const safeLimit = Math.min(parseInt(limit) || 50, 200);

  // Build base filters
  const stockFilter = { companyId, userId, createdAt: { $gte: fromDate, $lte: toDate } };
  if (shopId) stockFilter.shopId = shopId;

  const adjFilter = { companyId, createdAt: { $gte: fromDate, $lte: toDate }, createdBy: userId };
  if (shopId) adjFilter.shopId = shopId;

  const auditFilter = { 'changedBy': userId, 'companyId': companyId, timestamp: { $gte: fromDate, $lte: toDate } };

  try {
    // Parallel queries: recent stock changes, adjustments, audits
    const [changes, adjustments, audits, countsAgg, topProducts, shopsAgg] = await Promise.all([
      StockChange.find(stockFilter).populate('productId', 'name sku').sort({ createdAt: -1 }).limit(safeLimit).lean(),
      InventoryAdjustment.find(adjFilter).sort({ createdAt: -1 }).limit(100).lean(),
      require('../models/ProductAudit').find(auditFilter).sort({ timestamp: -1 }).limit(100).lean(),
      // Counts by type and qty sums
      StockChange.aggregate([
        { $match: stockFilter },
        { $group: { _id: '$type', count: { $sum: 1 }, totalQty: { $sum: '$qty' } } },
        { $sort: { count: -1 } }
      ]),
      // Top products affected by this user
      StockChange.aggregate([
        { $match: stockFilter },
        { $group: { _id: '$productId', actions: { $sum: 1 }, qtyChanged: { $sum: '$qty' } } },
        { $sort: { actions: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $project: { productId: '$_id', productName: '$product.name', sku: '$product.sku', actions: 1, qtyChanged: 1 } }
      ]),
      // Shops activity
      StockChange.aggregate([
        { $match: stockFilter },
        { $group: { _id: '$shopId', actions: { $sum: 1 }, qtyChanged: { $sum: '$qty' } } },
        { $sort: { actions: -1 } }
      ])
    ]);

    // Merge timeline items (normalize and sort)
    const normalized = [];
    (changes || []).forEach(c => normalized.push({ kind: 'stock_change', createdAt: c.createdAt, data: c }));
    (adjustments || []).forEach(a => normalized.push({ kind: 'adjustment', createdAt: a.createdAt || a.createdAt, data: a }));
    (audits || []).forEach(audit => normalized.push({ kind: 'audit', createdAt: audit.timestamp || audit.createdAt || new Date(), data: audit }));

    normalized.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalItems = normalized.length;
    const paged = normalized.slice(skip, skip + safeLimit);

    // Build summary
    const totalActions = (countsAgg || []).reduce((sum, r) => sum + (r.count || 0), 0);
    const totalInbound = (countsAgg || []).reduce((sum, r) => sum + ((r.totalQty > 0) ? r.totalQty : 0), 0);
    const totalOutbound = (countsAgg || []).reduce((sum, r) => sum + ((r.totalQty < 0) ? Math.abs(r.totalQty) : 0), 0);

    const summary = {
      userId,
      companyId,
      period: `${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
      totalActions,
      totalInbound,
      totalOutbound,
      byType: countsAgg,
      topProducts: topProducts,
      shops: shopsAgg
    };

    // Simple insights
    const insights = {
      mostActiveShop: shopsAgg && shopsAgg.length ? shopsAgg[0]._id : null,
      mostCommonAction: countsAgg && countsAgg.length ? countsAgg[0]._id : null,
      recommendation: (totalActions > 100 ? 'High activity — consider training/monitoring' : 'Normal activity')
    };

    res.json({
      success: true,
      data: {
        summary,
        recentTimeline: paged,
        pagination: { page: parseInt(page), limit: safeLimit, total: totalItems, pages: Math.ceil(totalItems / safeLimit) },
        insights
      }
    });
  } catch (err) {
    logger.error('getUserActivityReport error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate user activity report', error: err.message });
  }
});


const getProductReport = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  validateMongoId(productId);
  // companyId must be provided (query or from authenticated user)
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  // Check cache first (15 min TTL)
  const cacheKey = `report:product:${productId}:${companyId}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, fromCache: true });

  const product = await Product.findOne({ _id: productId, companyId }).populate('categoryId').populate('pricingId');
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  // Get current stock from ProductStock
  const stockRecord = await require('../models/ProductStock').findOne({ productId });
  const currentStock = stockRecord?.stockQty || 0;

  // Stock history (last 30 days) — adapt to StockChange schema
  const stockHistory = await StockChange.find({ productId }).sort({ createdAt: -1 }).limit(30);

  // Sales and revenue (30-day velocity)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSales = await StockChange.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), type: 'sale', createdAt: { $gte: thirtyDaysAgo } } },
    { $lookup: { from: 'productpricings', localField: 'productId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalUnitsSold: { $sum: { $abs: '$qty' } }, totalRevenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } }, totalCost: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.cost', 0] }] } } } }
  ]);
  const dailySalesAvg = (recentSales[0]?.totalUnitsSold || 0) / 30;
  const projectedMonthlySales = dailySalesAvg * 30;
  const lastMonthRevenue = recentSales[0]?.totalRevenue || 0;

  // Compare with previous 30 days for growth
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const previousPeriodSales = await StockChange.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), type: 'sale', createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
    { $lookup: { from: 'productpricings', localField: 'productId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalRevenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } } } }
  ]);
  const prevMonthRevenue = previousPeriodSales[0]?.totalRevenue || 0;
  const revenueGrowth = prevMonthRevenue > 0 ? ((lastMonthRevenue - prevMonthRevenue) / prevMonthRevenue * 100) : 0;

  // Calculate revenue and margin using linked pricing
  const pricing = product.pricingId || {};
  const totalRevenue = product.sales?.revenue || 0;
  const margin = pricing && pricing.basePrice ? ((pricing.basePrice - (pricing.cost || 0)) / pricing.basePrice * 100) : 0;
  const grossProfit = lastMonthRevenue - (recentSales[0]?.totalCost || 0);

  // Discounts applied
  const discounts = await Discount.find({ productId, isActive: true });

  // Compute stock velocity using product sales data
  const stockVelocity = product.sales.totalSold / (product.createdAt ? ((Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 1);

  const report = {
    productName: product.name,
    sku: product.sku,
    category: product.category?.name || 'Uncategorized',
    generatedAt: new Date().toISOString(),
    pricing: {
      basePrice: parseFloat((pricing.basePrice || 0).toFixed(2)),
      cost: parseFloat((pricing.cost || 0).toFixed(2)),
      marginPct: parseFloat(margin.toFixed(2))
    },
    currentStock: currentStock,
    sales: {
      totalUnitsSold: recentSales[0]?.totalUnitsSold || 0,
      totalRevenue: parseFloat(lastMonthRevenue.toFixed(2)),
      dailyAvg: parseFloat(dailySalesAvg.toFixed(2)),
      projectedMonthly: parseFloat(projectedMonthlySales.toFixed(2)),
      previousMonthRevenue: parseFloat(prevMonthRevenue.toFixed(2)),
      revenueGrowthPct: parseFloat(revenueGrowth.toFixed(2)),
      revenueGrowthDirection: revenueGrowth > 0 ? 'UP' : (revenueGrowth < 0 ? 'DOWN' : 'STABLE')
    },
    profitability: {
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      marginPct: parseFloat(margin.toFixed(2)),
      profitTrend: margin > 40 ? 'High' : (margin > 20 ? 'Medium' : 'Low')
    },
    stock: {
      currentQuantity: currentStock,
      velocity: parseFloat(stockVelocity.toFixed(2)),
      daysToSellOut: currentStock > 0 ? Math.round(currentStock / stockVelocity) : 'N/A',
      reorderPoint: Math.ceil(dailySalesAvg * 7)
    },
    activeDiscounts: discounts.length > 0 ? discounts.map(d => ({ name: d.name, value: d.value, type: d.type })) : [],
    insights: {
      profitability: margin > 40 ? 'High—excellent margin' : (margin > 20 ? 'Medium—monitor costs' : 'Low—review pricing'),
      sales: revenueGrowth > 10 ? 'Strong growth—increase stock' : (revenueGrowth < -10 ? 'Declining—reduce orders' : 'Stable'),
      recommendation: stockVelocity > 5 ? '🔴 High demand—reorder urgently' : (stockVelocity < 1 ? '🟡 Slow movement—consider promotion' : '🟢 Normal velocity—maintain stock')
    }
  };

  // Cache for 15 minutes
  setCache(cacheKey, report, 900).catch(() => { });

  res.json({ success: true, data: report });
});

const getInventorySummary = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const { shopId } = req.query;
  const filter = { companyId };
  if (shopId) filter.shopId = shopId;

  // Check cache first (30 min TTL)
  const cacheKey = `report:inventory:summary:${companyId}:${shopId || 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ success: true, data: cached, fromCache: true });

  // Total products
  const totalProducts = await Product.countDocuments(filter);

  // Total inventory value (sum of cost * quantity) using ProductVariation and pricingId
  const inventoryValueAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(filter.shopId ? { 'product.shopId': filter.shopId } : {}) } },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$pricing.cost', 0] }] } } } }
  ]);

  // Low stock count (aggregation to avoid cast error)
  // Low stock based on ProductVariation totals
  const lowStockAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(filter.shopId ? { 'product.shopId': filter.shopId } : {}) } },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $lookup: { from: 'productstocks', localField: '_id', foreignField: 'productId', as: 'stockSettings' } },
    { $unwind: { path: '$stockSettings', preserveNullAndEmptyArrays: true } },
    { $project: { totalQty: 1, lowStockThreshold: { $ifNull: ['$stockSettings.lowStockThreshold', 10] } } },
    { $match: { $expr: { $lte: ['$totalQty', '$lowStockThreshold'] } } },
    { $count: 'lowStockCount' }
  ]);
  const lowStock = lowStockAgg[0]?.lowStockCount || 0;

  // Out of stock: products whose summed variation stock is 0
  const outOfStockAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(filter.shopId ? { 'product.shopId': filter.shopId } : {}) } },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $match: { totalQty: 0 } },
    { $count: 'outOfStockCount' }
  ]);
  const outOfStock = outOfStockAgg[0]?.outOfStockCount || 0;

  // Average stock level across products using ProductVariation totals
  const avgStockAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(filter.shopId ? { 'product.shopId': filter.shopId } : {}) } },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $group: { _id: null, avgQuantity: { $avg: '$totalQty' } } }
  ]);
  const avgStock = avgStockAgg[0]?.avgQuantity || 0;

  // Total revenue potential (inventory value * avg turnover 4x/year)
  const turnoverBenchmark = 4;
  const totalValue = inventoryValueAgg[0]?.totalValue || 0;
  const revenuePotential = totalValue * turnoverBenchmark;

  // % calculations
  const lowStockPct = totalProducts > 0 ? (lowStock / totalProducts * 100) : 0;
  const outOfStockPct = totalProducts > 0 ? (outOfStock / totalProducts * 100) : 0;

  // Additional stats: Total categories
  const totalCategories = await Category.countDocuments({ companyId });

  // Overall inventory health score
  const healthyStock = totalProducts - lowStock - outOfStock;
  const healthScore = totalProducts > 0 ? ((healthyStock / totalProducts) * 100) : 100;
  const healthStatus = healthScore >= 85 ? 'Excellent' : (healthScore >= 70 ? 'Good' : (healthScore >= 50 ? 'Fair' : 'Poor'));

  const summary = {
    generatedAt: new Date().toISOString(),
    overview: {
      totalProducts,
      totalCategories: totalCategories || 0,
      totalInventoryValue: parseFloat(totalValue.toFixed(2))
    },
    stockHealth: {
      healthyStock,
      lowStockCount: lowStock,
      lowStockPct: parseFloat(lowStockPct.toFixed(2)),
      outOfStockCount: outOfStock,
      outOfStockPct: parseFloat(outOfStockPct.toFixed(2)),
      healthScore: parseFloat(healthScore.toFixed(2)),
      healthStatus: healthStatus,
      healthTrend: healthScore >= 80 ? '📈 Improving' : (healthScore >= 70 ? '→ Stable' : '📉 Declining')
    },
    statistics: {
      avgStockPerProduct: parseFloat(avgStock.toFixed(2)),
      revenuePotential: parseFloat(revenuePotential.toFixed(2)),
      stockCoverage: parseFloat(((totalValue / (totalProducts || 1)) / (avgStock || 1)).toFixed(2))
    },
    benchmarks: {
      idealTurnover: '4x/year',
      idealLowStockPct: '<10%',
      idealOutOfStockPct: '<5%',
      currentDaysOfInventory: totalProducts > 0 ? Math.round(365 / turnoverBenchmark) : 'N/A'
    },
    recommendations: [
      lowStockPct > 20 ? '⚠️ Review reorder points - many items below threshold' : '✅ Reorder points are healthy',
      outOfStockPct > 5 ? '⚠️ Several products out of stock - increase coverage' : '✅ Out of stock levels acceptable',
      healthScore < 70 ? '🔴 Urgent: Improve inventory practices' : '🟢 Inventory well managed'
    ]
  };

  // Cache for 30 minutes
  setCache(cacheKey, summary, 1800).catch(() => { });

  res.json({ success: true, data: summary });
});


const getABCAnalysis = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const { shopId } = req.query;
  const filter = { companyId };
  if (shopId) filter.shopId = shopId;

  // Aggregate by value (cost * quantity) using ProductVariation and pricingId
  const products = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(filter.shopId ? { 'product.shopId': filter.shopId } : {}) } },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$productId', name: { $first: '$product.name' }, value: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$pricing.cost', 0] }] } } } },
    { $sort: { value: -1 } }
  ]);

  const totalValue = products.reduce((sum, p) => sum + p.value, 0);
  let cumulative = 0;
  let aValue = 0, bValue = 0, cValue = 0;
  const abc = products.map(p => {
    cumulative += p.value;
    const percentage = totalValue > 0 ? (cumulative / totalValue * 100) : 0;
    let category;
    if (percentage <= 80) {
      category = 'A'; aValue += p.value;
    } else if (percentage <= 95) {
      category = 'B'; bValue += p.value;
    } else {
      category = 'C'; cValue += p.value;
    }
    return { ...p, category, percentage: Math.round(percentage * 100) / 100 };
  });

  const aPct = totalValue > 0 ? (aValue / totalValue * 100) : 0;
  const bPct = totalValue > 0 ? (bValue / totalValue * 100) : 0;
  const cPct = totalValue > 0 ? (cValue / totalValue * 100) : 0;

  const report = {
    totalValue: totalValue.toFixed(2),
    breakdown: {
      A: { value: aValue.toFixed(2), pct: Math.round(aPct * 100) / 100 + '%', count: abc.filter(p => p.category === 'A').length, description: 'High-value items (80% value, 20% inventory—focus on stock)' },
      B: { value: bValue.toFixed(2), pct: Math.round(bPct * 100) / 100 + '%', count: abc.filter(p => p.category === 'B').length, description: 'Medium-value (15% value, 30% inventory—moderate monitoring)' },
      C: { value: cValue.toFixed(2), pct: Math.round(cPct * 100) / 100 + '%', count: abc.filter(p => p.category === 'C').length, description: 'Low-value (5% value, 50% inventory—optimize or clear)' }
    },
    products: abc.slice(0, 20), // Top 20 for preview
    insights: {
      inventoryEfficiency: totalValue > 0 ? Math.round((aPct + bPct) / totalValue * 100) : 0 + '% high/medium value',
      recommendation: aPct < 70 ? 'Rebalance: Move C to promotions' : 'Optimized'
    }
  };

  res.json({ success: true, data: report });
});

const getInventoryTurnover = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { startDate, endDate, period = '30', shopId } = req.query; // Default 30 days
  const days = parseInt(period);
  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, createdAt: { $gte: fromDate, $lte: toDate } };
  if (shopId) filter.shopId = shopId;

  // COGS (cost of goods sold) computed from StockChange (sales) joined to product pricing
  const cogsAgg = await StockChange.aggregate([
    { $match: { companyId, ...(shopId ? { shopId } : {}), type: 'sale', createdAt: { $gte: fromDate, $lte: toDate } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalCogs: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.cost', 0] }] } } } }
  ]);

  // Average inventory value (avg over period; approximate as current * days / period)
  // Average inventory value based on current variation quantities and pricing
  const currentValueAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(shopId ? { 'product.shopId': shopId } : {}) } },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$productId', productValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$pricing.cost', 0] }] } } } },
    { $group: { _id: null, avgValue: { $avg: '$productValue' } } }
  ]);
  const avgInventoryValue = currentValueAgg[0]?.avgValue || 0;

  const totalCogs = cogsAgg[0]?.totalCogs || 0;
  const turnoverRatio = avgInventoryValue > 0 ? (totalCogs || 0) / avgInventoryValue : 0;
  const turnoverDays = turnoverRatio > 0 ? 365 / turnoverRatio : 'N/A';
  const benchmark = 4; // Ideal 4x/year
  const efficiency = turnoverRatio / benchmark * 100;

  res.json({
    success: true,
    data: {
      periodDays: days,
      turnoverRatio: Math.round(turnoverRatio * 100) / 100,
      turnoverDays: Math.round(turnoverDays * 100) / 100,
      cogs: (totalCogs || 0).toFixed(2),
      avgInventoryValue: avgInventoryValue.toFixed(2),
      efficiencyPct: Math.round(efficiency * 100) / 100 + '%',
      benchmark: `${benchmark}x/year`,
      insights: turnoverRatio > benchmark ? 'Excellent—fast-moving stock' : (turnoverRatio > 2 ? 'Good—monitor slow items' : 'Low—clear dead stock')
    }
  });
});

const getAgingInventory = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { daysOld = 90, shopId } = req.query;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const prodFilter = { companyId }; if (shopId) prodFilter.shopId = shopId;

  // Find products created before cutoff and compute their stock and value via variations
  const agedProductsAgg = await Product.aggregate([
    { $match: { companyId, createdAt: { $lt: cutoff }, ...(shopId ? { shopId } : {}) } },
    { $lookup: { from: 'productvariations', localField: '_id', foreignField: 'productId', as: 'variations' } },
    { $unwind: { path: '$variations', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'productpricings', localField: 'pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$_id', name: { $first: '$name' }, totalQty: { $sum: { $ifNull: ['$variations.stockQty', 0] } }, value: { $sum: { $multiply: [{ $ifNull: ['$variations.stockQty', 0] }, { $ifNull: ['$pricing.cost', 0] }] } }, createdAt: { $first: '$createdAt' } } },
    { $sort: { value: -1 } },
    { $group: { _id: null, totalAged: { $sum: 1 }, totalAgedValue: { $sum: '$value' }, products: { $push: { _id: '$_id', name: '$name', totalQty: '$totalQty', value: '$value', createdAt: '$createdAt' } } } },
    { $project: { totalAged: 1, totalAgedValue: 1, totalAgedPct: { $literal: 'N/A' }, products: { $slice: ['$products', 20] } } }
  ]);

  const totalProducts = await Product.countDocuments(prodFilter);
  const totalValueAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.companyId': companyId, ...(shopId ? { 'product.shopId': shopId } : {}) } },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$pricing.cost', 0] }] } } } }
  ]);
  const agedPct = totalProducts > 0 ? (agedProductsAgg[0]?.totalAged / totalProducts * 100) : 0;

  const report = {
    daysOld,
    totalAgedProducts: agedProductsAgg[0]?.totalAged || 0,
    totalAgedValue: (agedProductsAgg[0]?.totalAgedValue || 0).toFixed(2),
    agedPct: Math.round(agedPct * 100) / 100 + '%',
    totalInventoryValue: (totalValueAgg[0]?.totalValue || 0).toFixed(2),
    products: agedProductsAgg[0]?.products || [],
    insights: {
      risk: agedPct > 20 ? 'High—20%+ aged stock risks obsolescence' : 'Low',
      recommendation: 'Run promotions on top aged items to clear'
    }
  };

  res.json({ success: true, data: report });
});

const getStockMovementReport = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { startDate, endDate, productId, shopId } = req.query;

  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, createdAt: { $gte: fromDate, $lte: toDate } };
  if (shopId) filter.shopId = shopId;
  if (productId) {
    validateMongoId(productId);
    filter.productId = productId;
  }

  const movements = await StockChange.aggregate([
    { $match: filter },
    { $group: { _id: '$type', count: { $sum: 1 }, totalQuantity: { $sum: '$qty' }, netChange: { $sum: '$qty' } } },
    { $sort: { count: -1 } }
  ]);

  // Overall net movement
  const overallNet = movements.reduce((net, m) => net + m.netChange, 0);
  const velocity = overallNet / ((toDate - fromDate) / (24 * 60 * 60 * 1000)); // Daily avg

  const report = {
    period: `${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
    movements: movements.map(m => ({
      type: m._id,
      count: m.count,
      totalQuantity: m.totalQuantity,
      netChange: m.netChange,
      pctOfTotal: movements.length > 0 ? Math.round((m.count / movements.reduce((sum, mv) => sum + mv.count, 0) * 100) * 100) / 100 + '%' : 0
    })),
    overall: {
      netMovement: overallNet,
      dailyVelocity: Math.round(velocity * 100) / 100,
      insights: overallNet > 0 ? 'Net gain—healthy replenishment' : (overallNet < 0 ? 'Net loss—monitor sales vs restock' : 'Balanced')
    }
  };

  res.json({ success: true, data: report });
});

const getAdjustmentReport = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { status, startDate, endDate, shopId } = req.query;

  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, createdAt: { $gte: fromDate, $lte: toDate } };
  if (shopId) filter.shopId = shopId;
  if (status) filter.status = status;

  const adjustments = await InventoryAdjustment.aggregate([
    { $match: filter },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'productPricing' } },
    { $unwind: { path: '$productPricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$adjustmentType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' }, totalValue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$productPricing.cost', 0] }] } } } },
    { $sort: { count: -1 } }
  ]);

  const totalAdjustments = adjustments.reduce((sum, a) => sum + a.count, 0);
  const netLoss = adjustments.reduce((net, a) => net + (a._id === 'damage' || a._id === 'theft' ? a.totalQuantity : 0), 0);

  const report = {
    period: `${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
    adjustments: adjustments.map(a => ({
      type: a._id,
      count: a.count,
      totalQuantity: a.totalQuantity,
      totalValue: a.totalValue.toFixed(2),
      pctOfTotal: totalAdjustments > 0 ? Math.round((a.count / totalAdjustments * 100) * 100) / 100 + '%' : 0
    })),
    overall: {
      totalAdjustments,
      netLossQuantity: netLoss,
      lossPctOfInventory: 'N/A', // Calculate if needed via total stock
      insights: totalAdjustments > 10 ? 'High adjustments—review processes' : 'Low activity—stable operations'
    }
  };

  res.json({ success: true, data: report });
});

const getWarehouseReport = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { shopId } = req.query; // former warehouseId - now represent shop locations

  if (shopId) validateMongoId(shopId);

  // Aggregate inventory by shop (based on shopId field - now simple reference instead of array)
  const pipeline = [
    { $match: { companyId, shopId: { $exists: true } } },
    { $match: shopId ? { shopId: shopId } : {} },
    { $group: { _id: '$shopId', totalStock: { $sum: '$inventory.quantity' }, totalValue: { $sum: { $multiply: ['$inventory.quantity', '$pricing.cost'] } }, totalProducts: { $sum: 1 } } },
  ];

  const shopStock = await Product.aggregate(pipeline);

  const totalStockAll = shopStock.reduce((sum, s) => sum + s.totalStock, 0);

  const report = {
    totalLocations: shopStock.length,
    totalStock: totalStockAll,
    locations: shopStock.map(s => ({
      shopId: s._id,
      totalProducts: s.totalProducts,
      totalStock: s.totalStock,
      totalValue: s.totalValue.toFixed(2)
    }))
  };

  res.json({ success: true, data: report });
});

const getAlertSummary = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { startDate, endDate, shopId } = req.query;
  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, createdAt: { $gte: fromDate, $lte: toDate } };
  if (shopId) filter.shopId = shopId;

  const summary = await Alert.aggregate([
    { $match: filter },
    { $group: { _id: { type: '$type', isResolved: '$isResolved' }, count: { $sum: 1 } } },
    {
      $group: {
        _id: '$_id.type',
        total: { $sum: '$count' },
        resolved: { $sum: { $cond: [{ $eq: ['$isResolved', true] }, '$count', 0] } },
        unresolved: { $sum: { $cond: [{ $eq: ['$isResolved', false] }, '$count', 0] } }
      }
    },
    { $sort: { total: -1 } }
  ]);

  const totalAlerts = summary.reduce((sum, s) => sum + s.total, 0);
  const resolutionRate = totalAlerts > 0 ? (summary.reduce((sum, s) => sum + s.resolved, 0) / totalAlerts * 100) : 0;

  const report = {
    period: `${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
    summary: summary.map(s => ({
      type: s._id,
      total: s.total,
      resolved: s.resolved,
      unresolved: s.unresolved,
      resolutionRate: s.total > 0 ? Math.round((s.resolved / s.total * 100) * 100) / 100 + '%' : 0
    })),
    overall: {
      totalAlerts,
      resolutionRate: Math.round(resolutionRate * 100) / 100 + '%',
      avgUnresolvedPerType: summary.length > 0 ? Math.round(summary.reduce((sum, s) => sum + s.unresolved, 0) / summary.length) : 0,
      insights: resolutionRate > 80 ? 'Strong resolution—proactive team' : (resolutionRate > 50 ? 'Moderate—focus on high-priority' : 'Low—escalate unresolved')
    }
  };

  res.json({ success: true, data: report });
});

const getDiscountImpact = asyncHandler(async (req, res) => {
  const companyId = req.query.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }
  const { startDate, endDate, shopId } = req.query;
  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, startDate: { $gte: fromDate }, endDate: { $lte: toDate }, isActive: true };
  if (shopId) filter.shopId = shopId;

  const impact = await Discount.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: 'products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'productPricing' } },
    { $unwind: { path: '$productPricing', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        name: 1,
        type: 1,
        value: 1,
        discountAmount: { $multiply: ['$value', { $ifNull: ['$product.sales.totalSold', 0] }] },
        salesLift: { $ifNull: ['$product.sales.totalSold', 0] },
        revenue: { $multiply: [{ $ifNull: ['$productPricing.basePrice', 0] }, { $ifNull: ['$product.sales.totalSold', 0] }] },
        cost: { $ifNull: ['$productPricing.cost', 0] }
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalDiscount: { $sum: '$discountAmount' },
        totalSalesLift: { $sum: '$salesLift' },
        totalRevenue: { $sum: '$revenue' },
        totalCost: { $sum: '$cost' },
        avgMargin: { $avg: { $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] } }
      }
    },
    {
      $project: {
        type: '$_id',
        count: 1,
        totalDiscount: { $round: ['$totalDiscount', 2] },
        totalSalesLift: 1,
        totalRevenue: { $round: ['$totalRevenue', 2] },
        totalCost: { $round: ['$totalCost', 2] },
        roi: { $round: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalDiscount'] }, 2] },
        avgMarginPct: { $round: [{ $multiply: ['$avgMargin', 100] }, 2] }
      }
    }
  ]);

  const totalDiscount = impact.reduce((sum, i) => sum + i.totalDiscount, 0);
  const totalRevenue = impact.reduce((sum, i) => sum + i.totalRevenue, 0);
  const overallROI = totalDiscount > 0 ? ((totalRevenue - impact.reduce((sum, i) => sum + i.totalCost, 0)) / totalDiscount) : 0;

  const report = {
    period: `${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
    impact: impact.map(i => ({
      type: i.type,
      count: i.count,
      totalDiscount: i.totalDiscount,
      totalSalesLift: i.totalSalesLift,
      totalRevenue: i.totalRevenue,
      roi: i.roi + 'x',
      avgMargin: i.avgMarginPct + '%'
    })),
    overall: {
      totalDiscountsUsed: impact.reduce((sum, i) => sum + i.count, 0),
      totalDiscountAmount: totalDiscount.toFixed(2),
      totalRevenueGenerated: totalRevenue.toFixed(2),
      overallROI: overallROI.toFixed(2) + 'x',
      insights: overallROI > 3 ? 'Excellent ROI—discounts drive high returns' : (overallROI > 1.5 ? 'Good—optimize targeting' : 'Low—review discount strategy')
    }
  };

  res.json({ success: true, data: report });
});

// ==================== ADVANCED REPORTING FUNCTIONS ====================

/**
 * @desc    Executive Dashboard - High-level business overview
 * @route   GET /api/v1/reports/dashboard
 * @query   companyId (required), shopId (optional), period (7,30,90,365)
 * @access  Private
 */
const getExecutiveDashboard = asyncHandler(async (req, res) => {
  const { companyId, shopId, period } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

  // Check cache (Service handles cache for overview, but here we can cache the final result too if needed)
  // Actually AnalyticsService doesn't cache these specific advanced reports internally yet (only getOverview). 
  // Wait, I implemented the methods in AnalyticsService without caching inside them? 
  // Let's look at `AnalyticsService` code I added... 
  // I copied logic but DID I copy the cache checks? 
  // I removed cache checks from the service code I constructed in step 446!
  // So I should keep caching in Controller OR add it to Service. 
  // Keeping it in Controller is fine for now to avoid re-editing Service immediately.

  const cacheKey = `report:dashboard:executive:${companyId}:${shopId || 'all'}:${period || 30}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  const data = await AnalyticsService.getExecutiveDashboard(companyId, shopId, period);

  // Cache for 1 hour
  setCache(cacheKey, data, 3600).catch(() => { });

  res.json(data);
});

/**
 * @desc    Real-time Metrics - Live KPI updates
 * @route   GET /api/v1/reports/metrics/realtime
 * @query   companyId (required), shopId (optional)
 * @access  Private
 */
const getRealTimeMetrics = asyncHandler(async (req, res) => {
  const { companyId, shopId } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

  const cacheKey = `report:metrics:realtime:${companyId}:${shopId || 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  const data = await AnalyticsService.getRealTimeMetrics(companyId, shopId);

  // Cache for 5 minutes
  setCache(cacheKey, data, 300).catch(() => { });

  res.json(data);
});

/**
 * @desc    Sales Analytics - Deep dive into revenue patterns
 * @route   GET /api/v1/reports/analytics/sales
 * @query   companyId (required), shopId (optional), period (7,30,90,365)
 * @access  Private
 */
const getSalesAnalytics = asyncHandler(async (req, res) => {
  const { companyId, shopId, period } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

  const data = await AnalyticsService.getSalesAnalytics(companyId, shopId, period);
  res.json(data);
});

/**
 * @desc    Forecasting - AI-powered predictions
 * @route   GET /api/v1/reports/forecast
 * @query   companyId (required), shopId (optional), days (7,14,30)
 * @access  Private
 */
const getForecast = asyncHandler(async (req, res) => {
  const { companyId, shopId, days } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

  const data = await AnalyticsService.getForecast(companyId, shopId, days);
  res.json(data);
});

/**
 * @desc    Inventory Optimization - Recommendations
 * @route   GET /api/v1/reports/optimization
 * @query   companyId (required), shopId (optional)
 * @access  Private
 */
const getInventoryOptimization = asyncHandler(async (req, res) => {
  const { companyId, shopId } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

  const data = await AnalyticsService.getInventoryOptimization(companyId, shopId);
  res.json(data);
});

/**
 * @desc    Benchmarking - Compare against industry standards
 * @route   GET /api/v1/reports/benchmarks
 * @query   companyId (required), shopId (optional), period (30,90,365)
 * @access  Private
 */
const getBenchmarks = asyncHandler(async (req, res) => {
  const { companyId, shopId, period } = req.query;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

  const data = await AnalyticsService.getBenchmarks(companyId, shopId, period);
  res.json(data);
});
/**
 * @desc    Custom Report Builder
 * @route   POST /api/v1/reports/custom
 * @body    { companyId, shopId, metrics[], dateRange, groupBy, exportFormat }
 * @access  Private
 */
const buildCustomReport = asyncHandler(async (req, res) => {
  const { companyId, shopId, metrics = [], dateRange = 'month', groupBy = 'date' } = req.body;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const match = { companyId };
  if (shopId) match.shopId = shopId;

  // Calculate date range
  const fromDate = new Date();
  const rangeMap = { week: 7, month: 30, quarter: 90, year: 365 };
  fromDate.setDate(fromDate.getDate() - (rangeMap[dateRange] || 30));

  // Build report based on selected metrics
  const report = {};

  if (metrics.includes('revenue')) {
    const revenue = await StockChange.aggregate([
      { $match: { ...match, type: 'sale', createdAt: { $gte: fromDate } } },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
      { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: groupBy === 'category' ? '$product.category' : { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } }
        }
      }
    ]);
    report.revenue = revenue;
  }

  if (metrics.includes('inventory')) {
    const inv = await Product.aggregate([
      { $match },
      {
        $group: {
          _id: groupBy === 'category' ? '$category' : null,
          quantity: { $sum: '$inventory.quantity' },
          value: { $sum: { $multiply: ['$inventory.quantity', '$pricing.cost'] } }
        }
      }
    ]);
    report.inventory = inv;
  }

  res.json({
    success: true,
    dateRange,
    groupedBy: groupBy,
    data: report
  });
});



module.exports = {
  // Basic Reports
  getDailyReport,
  getProductReport,
  getInventorySummary,
  getABCAnalysis,
  getInventoryTurnover,
  getAgingInventory,
  getStockMovementReport,
  getAdjustmentReport,
  getWarehouseReport,
  getAlertSummary,
  getDiscountImpact,
  // User activity
  getUserActivityReport,
  // Advanced Reports
  getExecutiveDashboard,
  getRealTimeMetrics,
  getSalesAnalytics,
  getForecast,
  getInventoryOptimization,
  getBenchmarks,
  buildCustomReport
};