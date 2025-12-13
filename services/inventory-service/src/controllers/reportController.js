const asyncHandler = require('express-async-handler');
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
  setCache(cacheKey, report, 3600).catch(() => {});

  res.json({ success: true, data: report });
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

  const product = await Product.findOne({ _id: productId, companyId }).populate('category').populate('pricingId');
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  // Get current stock from ProductVariation aggregate
  const pvAgg = await require('../models/ProductVariation').aggregate([
    { $match: { productId: mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, totalQty: { $sum: '$stockQty' } } }
  ]);
  const currentStock = (pvAgg[0] && pvAgg[0].totalQty) || 0;

  // Stock history (last 30 days) — adapt to StockChange schema
  const stockHistory = await StockChange.find({ productId }).sort({ createdAt: -1 }).limit(30);

  // Sales and revenue (30-day velocity)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSales = await StockChange.aggregate([
    { $match: { productId: mongoose.Types.ObjectId(productId), type: 'sale', createdAt: { $gte: thirtyDaysAgo } } },
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
    { $match: { productId: mongoose.Types.ObjectId(productId), type: 'sale', createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
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
  setCache(cacheKey, report, 900).catch(() => {});

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
  setCache(cacheKey, summary, 1800).catch(() => {});

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
    totalAgedProducts: agedProducts[0]?.totalAged || 0,
    totalAgedValue: (agedProducts[0]?.totalAgedValue || 0).toFixed(2),
    agedPct: Math.round(agedPct * 100) / 100 + '%',
    totalInventoryValue: (totalValue[0]?.totalValue || 0).toFixed(2),
    products: agedProducts[0]?.products || [],
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
  const { companyId, shopId, period = 30 } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'companyId is required'
    });
  }

  // Check cache first (1 hour TTL)
  const cacheKey = `report:dashboard:executive:${companyId}:${shopId || 'all'}:${period}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - parseInt(period));

  // Build match query
  const match = { companyId };
  if (shopId) match.shopId = shopId;

  // 1. Revenue Metrics (use StockChange fields and lookup pricing via product.pricingId)
  const revenueData = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: fromDate } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        totalUnitsSold: { $sum: { $abs: '$qty' } },
        totalRevenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } },
        avgOrderValue: { $avg: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } },
        totalCost: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.cost', 0] }] } }
      }
    }
  ]);

  const revenue = revenueData[0] || {
    totalUnitsSold: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    totalCost: 0
  };

  // 2. Inventory Metrics using ProductVariation and pricing
  const invAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: match },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' }, productValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$pricing.cost', 0] }] } } } },
    { $group: { _id: null, totalProducts: { $sum: 1 }, totalStock: { $sum: '$totalQty' }, inventoryValue: { $sum: '$productValue' }, avgStockPerProduct: { $avg: '$totalQty' } } }
  ]);
  const inventory = invAgg[0] || { totalProducts: 0, totalStock: 0, inventoryValue: 0, avgStockPerProduct: 0 };

  // 3. Stock Health
  // Low stock and out of stock counts based on ProductVariation totals and ProductStock
  const lowStockCountAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: match },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $lookup: { from: 'productstocks', localField: '_id', foreignField: 'productId', as: 'stockSettings' } },
    { $unwind: { path: '$stockSettings', preserveNullAndEmptyArrays: true } },
    { $project: { totalQty: 1, lowStockThreshold: { $ifNull: ['$stockSettings.lowStockThreshold', 10] } } },
    { $match: { $expr: { $lte: ['$totalQty', '$lowStockThreshold'] } } },
    { $count: 'lowStockCount' }
  ]);
  const lowStockCount = lowStockCountAgg[0]?.lowStockCount || 0;

  const outOfStockAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: match },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $match: { totalQty: 0 } },
    { $count: 'outOfStockCount' }
  ]);
  const outOfStockCount = outOfStockAgg[0]?.outOfStockCount || 0;

  // 4. Profit Analysis
  const grossProfit = revenue.totalRevenue - revenue.totalCost;
  const profitMargin = revenue.totalRevenue > 0 ? ((grossProfit / revenue.totalRevenue) * 100) : 0;

  // 5. Stock Movement (use StockChange.type/createdAt/qty)
  const stockMovement = await StockChange.aggregate([
    { $match: { ...match, createdAt: { $gte: fromDate } } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalQuantity: { $sum: { $abs: '$qty' } }
      }
    }
  ]);

  // 6. Top Products
  const topProducts = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: fromDate } } },
    {
      $group: {
        _id: '$productId',
        unitsSold: { $sum: { $abs: '$qty' } }
      }
    },
    { $sort: { unitsSold: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        productId: '$_id',
        name: '$product.name',
        sku: '$product.sku',
        unitsSold: 1,
        revenue: { $multiply: ['$unitsSold', { $ifNull: ['$pricing.basePrice', 0] }] }
      }
    }
  ]);

  // 7. Alerts Summary
  const activeAlerts = await Alert.countDocuments({
    ...match,
    isResolved: false
  });

  const dashboard = {
    success: true,
    period: `Last ${period} days`,
    timestamp: new Date(),
    kpis: {
      revenue: {
        total: parseFloat(revenue.totalRevenue.toFixed(2)),
        daily: parseFloat((revenue.totalRevenue / period).toFixed(2)),
        unitsSold: revenue.totalUnitsSold,
        avgOrderValue: parseFloat(revenue.avgOrderValue.toFixed(2))
      },
      profitability: {
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        costOfGoods: parseFloat(revenue.totalCost.toFixed(2))
      },
      inventory: {
        totalProducts: inventory.totalProducts,
        totalStock: inventory.totalStock,
        inventoryValue: parseFloat(inventory.inventoryValue.toFixed(2)),
        avgStockPerProduct: parseFloat(inventory.avgStockPerProduct.toFixed(2)),
        lowStockCount,
        outOfStockCount,
        healthScore: calculateInventoryHealth(lowStockCount, outOfStockCount, inventory.totalProducts)
      },
      operations: {
        activeAlerts,
        stockMovements: stockMovement.reduce((sum, s) => sum + s.count, 0),
        stockTurnovers: revenue.totalUnitsSold > 0 ? parseFloat((revenue.totalUnitsSold / inventory.totalStock).toFixed(2)) : 0
      }
    },
    topPerformers: {
      products: topProducts.map(p => ({
        id: p.productId,
        name: p.name,
        sku: p.sku,
        unitsSold: p.unitsSold,
        revenue: parseFloat(p.revenue.toFixed(2))
      }))
    },
    stockBreakdown: stockMovement.map(s => ({
      type: s._id,
      count: s.count,
      quantity: s.totalQuantity
    })),
    trends: {
      direction: grossProfit > 0 ? 'positive' : 'negative',
      message: generateDashboardInsight(grossProfit, profitMargin, lowStockCount)
    }
  };

  // Cache for 1 hour
  setCache(cacheKey, dashboard, 3600).catch(() => {});

  res.json(dashboard);
});

/**
 * @desc    Real-time Metrics - Live KPI updates
 * @route   GET /api/v1/reports/metrics/realtime
 * @query   companyId (required), shopId (optional)
 * @access  Private
 */
const getRealTimeMetrics = asyncHandler(async (req, res) => {
  const { companyId, shopId } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'companyId is required'
    });
  }

  // Check cache first (5 min TTL for real-time)
  const cacheKey = `report:metrics:realtime:${companyId}:${shopId || 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  const match = { companyId };
  if (shopId) match.shopId = shopId;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Today's sales (use StockChange.type/createdAt/qty and pricing via product.pricingId)
  const todaySales = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: today, $lt: tomorrow } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        units: { $sum: { $abs: '$qty' } },
        revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } }
      }
    }
  ]);

  // Today's stock changes
  const todayChanges = await StockChange.countDocuments({
    ...match,
    createdAt: { $gte: today, $lt: tomorrow }
  });

  // Current inventory health via ProductVariation totals
  const healthAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: match },
    { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
    { $lookup: { from: 'productstocks', localField: '_id', foreignField: 'productId', as: 'stockSettings' } },
    { $unwind: { path: '$stockSettings', preserveNullAndEmptyArrays: true } },
    { $project: { totalQty: 1, lowStockThreshold: { $ifNull: ['$stockSettings.lowStockThreshold', 10] } } },
    { $group: {
      _id: null,
      critical: { $sum: { $cond: [{ $eq: ['$totalQty', 0] }, 1, 0] } },
      lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$totalQty', 0] }, { $lte: ['$totalQty', '$lowStockThreshold'] }] }, 1, 0] } },
      healthy: { $sum: { $cond: [{ $gt: ['$totalQty', '$lowStockThreshold'] }, 1, 0] } }
    } }
  ]);

  const metrics = {
    success: true,
    timestamp: now,
    today: {
      sales: {
        units: todaySales[0]?.units || 0,
        revenue: parseFloat((todaySales[0]?.revenue || 0).toFixed(2))
      },
      stockChanges: todayChanges
    },
    inventory: {
      status: {
        critical: healthAgg[0]?.critical || 0,
        lowStock: healthAgg[0]?.lowStock || 0,
        healthy: healthAgg[0]?.healthy || 0
      }
    }
  };

  // Cache for 5 minutes
  setCache(cacheKey, metrics, 300).catch(() => {});

  res.json(metrics);
});

/**
 * @desc    Sales Analytics - Deep dive into revenue patterns
 * @route   GET /api/v1/reports/analytics/sales
 * @query   companyId (required), shopId (optional), period (7,30,90,365)
 * @access  Private
 */
const getSalesAnalytics = asyncHandler(async (req, res) => {
  const { companyId, shopId, period = 30 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const match = { companyId };
  if (shopId) match.shopId = shopId;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - parseInt(period));

  // Daily sales trend
  const dailySalesTrend = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: fromDate } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        units: { $sum: { $abs: '$qty' } },
        revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } },
        cost: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.cost', 0] }] } },
        margin: { $avg: { $subtract: [{ $ifNull: ['$pricing.basePrice', 0] }, { $ifNull: ['$pricing.cost', 0] }] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Sales by category
  const salesByCategory = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: fromDate } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'categories', localField: 'product.category', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$category.name',
        units: { $sum: { $abs: '$qty' } },
        revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } },
        products: { $sum: 1 }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  // Average transaction
  const transactions = await StockChange.countDocuments({
    ...match,
    type: 'sale',
    createdAt: { $gte: fromDate }
  });

  const totalSalesUnits = dailySalesTrend.reduce((sum, d) => sum + d.units, 0);
  const totalRevenue = dailySalesTrend.reduce((sum, d) => sum + d.revenue, 0);
  const totalCost = dailySalesTrend.reduce((sum, d) => sum + d.cost, 0);

  const analytics = {
    success: true,
    period: `Last ${period} days`,
    summary: {
      totalTransactions: transactions,
      totalUnits: totalSalesUnits,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      grossProfit: parseFloat((totalRevenue - totalCost).toFixed(2)),
      profitMargin: parseFloat(((totalRevenue - totalCost) / totalRevenue * 100).toFixed(2)),
      avgTransactionValue: transactions > 0 ? parseFloat((totalRevenue / transactions).toFixed(2)) : 0,
      avgUnitsPerTransaction: transactions > 0 ? parseFloat((totalSalesUnits / transactions).toFixed(2)) : 0
    },
    dailyTrend: dailySalesTrend.map(d => ({
      date: d._id,
      units: d.units,
      revenue: parseFloat(d.revenue.toFixed(2)),
      cost: parseFloat(d.cost.toFixed(2)),
      margin: parseFloat(d.margin.toFixed(2))
    })),
    byCategory: salesByCategory.map(c => ({
      category: c._id || 'Uncategorized',
      units: c.units,
      revenue: parseFloat(c.revenue.toFixed(2)),
      productsInvolved: c.products,
      revenueShare: parseFloat((c.revenue / totalRevenue * 100).toFixed(2))
    }))
  };

  res.json(analytics);
});

/**
 * @desc    Forecasting - AI-powered predictions
 * @route   GET /api/v1/reports/forecast
 * @query   companyId (required), shopId (optional), days (7,14,30)
 * @access  Private
 */
const getForecast = asyncHandler(async (req, res) => {
  const { companyId, shopId, days = 7 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const match = { companyId };
  if (shopId) match.shopId = shopId;

  // Get last 60 days of data for trend analysis
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 60);

  const historicalData = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: fromDate } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } },
        units: { $sum: { $abs: '$qty' } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Simple linear regression forecast
  const forecast = generateForecast(historicalData, parseInt(days));

  res.json({
    success: true,
    forecastPeriod: `Next ${days} days`,
    forecast,
    confidence: calculateForecastConfidence(historicalData),
    methodology: 'Linear regression with trend analysis'
  });
});

/**
 * @desc    Inventory Optimization - Recommendations
 * @route   GET /api/v1/reports/optimization
 * @query   companyId (required), shopId (optional)
 * @access  Private
 */
const getInventoryOptimization = asyncHandler(async (req, res) => {
  const { companyId, shopId } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const match = { companyId };
  if (shopId) match.shopId = shopId;

  // ABC Analysis
  // ABC Analysis using ProductVariation and pricing
  const abcAnalysis = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: match },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$productId', name: { $first: '$product.name' }, sku: { $first: '$product.sku' }, value: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$pricing.cost', 0] }] } }, quantity: { $sum: '$stockQty' } } },
    { $sort: { value: -1 } }
  ]);

  const totalValue = abcAnalysis.reduce((sum, p) => sum + p.value, 0);
  let cumulativeValue = 0;

  const categorized = abcAnalysis.map(p => {
    cumulativeValue += p.value;
    const percentage = totalValue > 0 ? (cumulativeValue / totalValue * 100) : 0;
    let category = 'C';
    if (percentage <= 80) category = 'A';
    else if (percentage <= 95) category = 'B';

    return {
      ...p,
      category,
      cumulative: percentage
    };
  });

  // Slow movers: products with fewer than 5 stock change movements in last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const slowMoversAgg = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: since } } },
    { $group: { _id: '$productId', movements: { $sum: 1 } } },
    { $match: { movements: { $lt: 5 } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $limit: 10 }
  ]);
  // attach current quantity via ProductVariation
  const slowMovers = await Promise.all(slowMoversAgg.map(async s => {
    const pv = await require('../models/ProductVariation').aggregate([
      { $match: { productId: s._id } },
      { $group: { _id: null, totalQty: { $sum: '$stockQty' } } }
    ]);
    return { productId: s._id, name: s.product?.name || '', quantity: pv[0]?.totalQty || 0, movements: s.movements };
  }));

  // Dead stock: products older than 180 days with no stockchanges
  const deadCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const deadAgg = await Product.aggregate([
    { $match: { ...match, createdAt: { $lt: deadCutoff } } },
    { $lookup: { from: 'stockchanges', localField: '_id', foreignField: 'productId', as: 'changes' } },
    { $match: { 'changes.0': { $exists: false } } },
    { $lookup: { from: 'productvariations', localField: '_id', foreignField: 'productId', as: 'variations' } },
    { $unwind: { path: '$variations', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'productpricings', localField: 'pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$_id', name: { $first: '$name' }, sku: { $first: '$sku' }, quantity: { $sum: { $ifNull: ['$variations.stockQty', 0] } }, value: { $sum: { $multiply: [{ $ifNull: ['$variations.stockQty', 0] }, { $ifNull: ['$pricing.cost', 0] }] } }, createdAt: { $first: '$createdAt' } } },
    { $project: { name: 1, sku: 1, quantity: 1, value: 1, createdAt: 1 } }
  ]);
  const deadStock = deadAgg;

  const optimization = {
    success: true,
    recommendations: {
      abcAnalysis: {
        a: {
          count: categorized.filter(p => p.category === 'A').length,
          message: 'High-value items - Focus on stock accuracy and frequent reordering'
        },
        b: {
          count: categorized.filter(p => p.category === 'B').length,
          message: 'Medium-value items - Monitor regularly'
        },
        c: {
          count: categorized.filter(p => p.category === 'C').length,
          message: 'Low-value items - Consider bulk ordering or clearance'
        }
      },
      slowMovers: {
        count: slowMovers.length,
        items: slowMovers,
        action: 'Review pricing or run promotions'
      },
      deadStock: {
        count: deadStock.length,
        items: deadStock,
        potentialLoss: parseFloat(deadStock.reduce((sum, d) => sum + d.value, 0).toFixed(2)),
        action: 'Consider clearance sales or donation'
      }
    }
  };

  res.json(optimization);
});

/**
 * @desc    Benchmarking - Compare against industry standards
 * @route   GET /api/v1/reports/benchmarks
 * @query   companyId (required), shopId (optional), period (30,90,365)
 * @access  Private
 */
const getBenchmarks = asyncHandler(async (req, res) => {
  const { companyId, shopId, period = 30 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  const match = { companyId };
  if (shopId) match.shopId = shopId;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - parseInt(period));

  // Calculate your metrics
  const salesData = await StockChange.aggregate([
    { $match: { ...match, type: 'sale', createdAt: { $gte: fromDate } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } },
        cost: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.cost', 0] }] } }
      }
    }
  ]);

  const inventory = await Product.countDocuments(match);
  const avgInventoryAgg = await require('../models/ProductVariation').aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: match },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$productId', productValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$pricing.cost', 0] }] } } } },
    { $group: { _id: null, value: { $avg: '$productValue' } } }
  ]);
  const avgInventoryValue = avgInventoryAgg[0]?.value || 0;

  const yourMetrics = {
    profitMargin: salesData[0] ? ((salesData[0].revenue - salesData[0].cost) / salesData[0].revenue * 100) : 0,
    stockTurnover: salesData[0] ? (salesData[0].cost / (inventory * (avgInventoryValue[0]?.value || 100))) : 0,
    inventoryHealth: inventory > 0 ? 95 : 0
  };

  const benchmarks = {
    success: true,
    period: `${period} days`,
    yourMetrics: {
      profitMargin: parseFloat(yourMetrics.profitMargin.toFixed(2)),
      stockTurnover: parseFloat(yourMetrics.stockTurnover.toFixed(2)),
      inventoryHealth: parseFloat(yourMetrics.inventoryHealth.toFixed(2))
    },
    industryBenchmarks: {
      profitMargin: 25.0,
      stockTurnover: 4.0,
      inventoryHealth: 90.0
    },
    comparison: {
      profitMargin: {
        value: parseFloat(yourMetrics.profitMargin.toFixed(2)),
        benchmark: 25.0,
        status: yourMetrics.profitMargin >= 25 ? 'Above Average' : 'Below Average',
        recommendation: yourMetrics.profitMargin < 25 ? 'Review pricing strategy and cost management' : 'Excellent performance'
      },
      stockTurnover: {
        value: parseFloat(yourMetrics.stockTurnover.toFixed(2)),
        benchmark: 4.0,
        status: yourMetrics.stockTurnover >= 4 ? 'Above Average' : 'Below Average',
        recommendation: yourMetrics.stockTurnover < 4 ? 'Increase marketing or adjust inventory levels' : 'Strong stock movement'
      },
      inventoryHealth: {
        value: parseFloat(yourMetrics.inventoryHealth.toFixed(2)),
        benchmark: 90.0,
        status: yourMetrics.inventoryHealth >= 90 ? 'Healthy' : 'Needs Attention',
        recommendation: 'Monitor stock levels and demand patterns'
      }
    }
  };

  res.json(benchmarks);
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

// ==================== HELPER FUNCTIONS ====================

function calculateInventoryHealth(lowStock, outOfStock, total) {
  if (total === 0) return 100;
  const healthyPercentage = ((total - lowStock - outOfStock) / total) * 100;
  return parseFloat(healthyPercentage.toFixed(2));
}

function generateDashboardInsight(grossProfit, profitMargin, lowStock) {
  if (lowStock > 0.3) return '⚠️ High low-stock count - Review reorder points';
  if (profitMargin < 15) return '📉 Profit margin below target - Review pricing';
  if (grossProfit < 0) return '❌ Negative profit - Urgent action needed';
  return '✅ Operating within healthy parameters';
}

function generateForecast(historicalData, days) {
  if (historicalData.length < 2) {
    return { message: 'Insufficient data for forecasting' };
  }

  // Simple linear regression
  const n = historicalData.length;
  const xValues = Array.from({ length: n }, (_, i) => i);
  const yValues = historicalData.map(d => d.revenue);

  const xMean = xValues.reduce((a, b) => a + b) / n;
  const yMean = yValues.reduce((a, b) => a + b) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
    denominator += Math.pow(xValues[i] - xMean, 2);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;

  const forecast = [];
  for (let i = 0; i < days; i++) {
    const predictedValue = slope * (n + i) + intercept;
    forecast.push({
      day: i + 1,
      predictedRevenue: parseFloat(Math.max(0, predictedValue).toFixed(2))
    });
  }

  return forecast;
}

function calculateForecastConfidence(historicalData) {
  // Simple confidence score based on data consistency
  if (historicalData.length < 10) return 'Low (need more data)';
  if (historicalData.length < 30) return 'Medium';
  return 'High';
}

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
  // Advanced Reports
  getExecutiveDashboard,
  getRealTimeMetrics,
  getSalesAnalytics,
  getForecast,
  getInventoryOptimization,
  getBenchmarks,
  buildCustomReport
};