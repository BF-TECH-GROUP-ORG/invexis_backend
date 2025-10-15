const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Category = require('../models/Category');
const StockChange = require('../models/StockChange');
const Alert = require('../models/Alert');
const Discount = require('../models/Discount');
const Warehouse = require('../models/Warehouse');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const { validateMongoId } = require('../utils/validateMongoId');

const getDailyReport = asyncHandler(async (req, res) => {
  const companyId = "testCompany";
  const { date } = req.query;
  const reportDate = date ? new Date(date) : new Date();
  reportDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(reportDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const yesterday = new Date(reportDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayNext = new Date(yesterday);
  yesterdayNext.setDate(yesterdayNext.getDate() + 1);

  // Stock changes today
  const stockChanges = await StockChange.aggregate([
    { $match: { companyId, changeDate: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
  ]);

  // Yesterday's for % change
  const yesterdayStockChanges = await StockChange.aggregate([
    { $match: { companyId, changeDate: { $gte: yesterday, $lt: yesterdayNext } } },
    { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
  ]);

  // Alerts generated today
  const alerts = await Alert.aggregate([
    { $match: { companyId, createdAt: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  // Yesterday's alerts for % change
  const yesterdayAlerts = await Alert.aggregate([
    { $match: { companyId, createdAt: { $gte: yesterday, $lt: yesterdayNext } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  // Sales today (absolute quantity from 'sale' changes, approximate revenue using avg price)
  const sales = await StockChange.aggregate([
    { $match: { companyId, changeType: 'sale', changeDate: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: null, totalUnitsSold: { $sum: { $abs: '$quantity' } } } }
  ]);
  const avgPrice = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, avgPrice: { $avg: '$pricing.basePrice' } } }
  ]);
  const todayRevenue = (sales[0]?.totalUnitsSold || 0) * (avgPrice[0]?.avgPrice || 0);

  // Yesterday's sales for % change
  const yesterdaySales = await StockChange.aggregate([
    { $match: { companyId, changeType: 'sale', changeDate: { $gte: yesterday, $lt: yesterdayNext } } },
    { $group: { _id: null, totalUnitsSold: { $sum: { $abs: '$quantity' } } } }
  ]);
  const yesterdayRevenue = (yesterdaySales[0]?.totalUnitsSold || 0) * (avgPrice[0]?.avgPrice || 0);
  const revenueChangePct = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100) : 0;

  // Low stock count (use aggregation to avoid cast error)
  const lowStockResult = await Product.aggregate([
    { $match: { companyId } },
    { $addFields: { isLow: { $lte: ['$inventory.quantity', { $ifNull: ['$inventory.lowStockThreshold', 10] }] } } },
    { $match: { isLow: true } },
    { $count: 'lowStockCount' }
  ]);
  const lowStock = lowStockResult[0]?.lowStockCount || 0;

  const totalProducts = await Product.countDocuments({ companyId });
  const lowStockPct = totalProducts > 0 ? (lowStock / totalProducts * 100) : 0;

  // Top category sales (approx via product category count in sales, with value)
  const topCategory = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: '$category', productCount: { $sum: 1 }, totalValue: { $sum: { $multiply: ['$pricing.basePrice', '$sales.totalSold'] } } } },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $unwind: '$category' },
    { $sort: { totalValue: -1 } },
    { $limit: 3 },
    { $project: { name: '$category.name', productCount: 1, totalValue: 1 } }
  ]);

  // Overall efficiency metrics
  const avgTurnover = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, avgSold: { $avg: '$sales.totalSold' }, avgStock: { $avg: '$inventory.quantity' } } }
  ]);
    // Average stock level
  const avgStock = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, avgQuantity: { $avg: '$inventory.quantity' } } }
  ]);
  const avgTurnoverRatio = avgStock[0]?.avgStock > 0 ? avgTurnover[0]?.avgSold / avgStock[0]?.avgStock : 0;

  const report = {
    date: reportDate.toISOString().split('T')[0],
    summary: {
      totalStockChanges: stockChanges.reduce((sum, change) => sum + change.count, 0),
      stockChangeGrowthPct: yesterdayStockChanges.reduce((sum, y) => sum + y.count, 0) > 0 ? ((stockChanges.reduce((sum, c) => sum + c.count, 0) - yesterdayStockChanges.reduce((sum, y) => sum + y.count, 0)) / yesterdayStockChanges.reduce((sum, y) => sum + y.count, 0) * 100) : 0,
      totalSalesUnits: sales[0]?.totalUnitsSold || 0,
      todayRevenue: todayRevenue.toFixed(2),
      revenueChangePct: Math.round(revenueChangePct * 100) / 100 + '%',
      lowStockCount: lowStock,
      lowStockPct: Math.round(lowStockPct * 100) / 100 + '%',
      totalProducts: totalProducts,
      avgTurnoverRatio: Math.round(avgTurnoverRatio * 100) / 100 // Units sold per unit stock
    },
    breakdowns: {
      stockChanges: stockChanges.map(change => ({
        type: change._id,
        count: change.count,
        totalQuantity: change.totalQuantity,
        pctOfTotalChanges: stockChanges.reduce((sum, c) => sum + c.count, 0) > 0 ? Math.round((change.count / stockChanges.reduce((sum, c) => sum + c.count, 0) * 100) * 100) / 100 + '%' : 0
      })),
      alerts: alerts.map(alert => ({ type: alert._id, count: alert.count })),
      topCategories: topCategory.map(cat => ({
        name: cat.name,
        productCount: cat.productCount,
        estimatedRevenue: Math.round(cat.totalValue * 100) / 100
      }))
    },
    trends: {
      yesterdayRevenue: yesterdayRevenue.toFixed(2),
      salesGrowth: revenueChangePct > 0 ? 'Up' : (revenueChangePct < 0 ? 'Down' : 'Stable'),
      alertGrowthPct: yesterdayAlerts.reduce((sum, y) => sum + y.count, 0) > 0 ? ((alerts.reduce((sum, a) => sum + a.count, 0) - yesterdayAlerts.reduce((sum, y) => sum + y.count, 0)) / yesterdayAlerts.reduce((sum, y) => sum + y.count, 0) * 100) : 0
    },
    kpis: {
      inventoryEfficiency: lowStockPct < 15 ? 'Excellent (<15% low stock)' : (lowStockPct < 30 ? 'Good (monitor)' : 'Needs attention'),
      revenueForecast: Math.round(todayRevenue * 30 * 100) / 100, // Monthly projection
      benchmark: { idealLowStockPct: '10%', idealTurnover: '4x/year' }
    }
  };

  res.json({ success: true, data: report });
});


const getProductReport = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  validateMongoId(productId);
  // const { companyId } = req.user;
  const companyId = "testCompany"

  const product = await Product.findOne({ _id: productId, companyId }).populate('category');
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  // Stock history (last 30 days)
  const stockHistory = await StockChange.find({ productId }).sort({ changeDate: -1 }).limit(30);

  // Sales and revenue (30-day velocity)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSales = await StockChange.aggregate([
    { $match: { productId, changeType: 'sale', changeDate: { $gte: thirtyDaysAgo } } },
    { $group: { _id: null, totalUnitsSold: { $sum: { $abs: '$quantity' } } } }
  ]);
  const dailySalesAvg = (recentSales[0]?.totalUnitsSold || 0) / 30;
  const projectedMonthlySales = dailySalesAvg * 30;
  const revenue = product.sales.revenue;
  const margin = ((product.pricing.basePrice - product.pricing.cost) / product.pricing.basePrice * 100);

  // Discounts applied
  const discounts = await Discount.find({ productId, isActive: true });

  // Simple forecast (linear: avg daily * 30)
  const stockVelocity = product.sales.totalSold / (product.createdAt ? ((Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 1); // Days since creation

  const report = {
    productName: product.name,
    category: product.category.name,
    currentStock: product.inventory.quantity,
    sales: {
      totalUnitsSold: product.sales.totalSold,
      totalRevenue: revenue,
      dailyAvg: Math.round(dailySalesAvg * 100) / 100,
      projectedMonthly: Math.round(projectedMonthlySales * 100) / 100,
      marginPct: Math.round(margin * 100) / 100 + '%'
    },
    stock: {
      currentQuantity: product.inventory.quantity,
      velocity: Math.round(stockVelocity * 100) / 100, // Units per day
      daysToSellOut: product.inventory.quantity > 0 ? Math.round(product.inventory.quantity / stockVelocity) : 'N/A'
    },
    stockHistory: stockHistory.map(change => ({
      date: change.changeDate,
      type: change.changeType,
      quantityChange: change.quantity,
      newStock: change.newStock
    })),
    discounts: discounts.map(d => ({ name: d.name, value: d.value + (d.type === 'percentage' ? '%' : '') })),
    insights: {
      profitability: margin > 40 ? 'High' : (margin > 20 ? 'Medium' : 'Low'),
      recommendation: stockVelocity > 5 ? 'High demand—reorder soon' : 'Monitor sales'
    }
  };

  res.json({ success: true, data: report });
});

const getInventorySummary = asyncHandler(async (req, res) => {
  const companyId = "testCompany";

  // Total products
  const totalProducts = await Product.countDocuments({ companyId });

  // Total inventory value (sum of cost * quantity)
  const inventoryValue = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, totalValue: { $sum: { $multiply: ['$pricing.cost', '$inventory.quantity'] } } } }
  ]);

  // Low stock count (aggregation to avoid cast error)
  const lowStockResult = await Product.aggregate([
    { $match: { companyId } },
    { $addFields: { isLow: { $lte: ['$inventory.quantity', { $ifNull: ['$inventory.lowStockThreshold', 10] }] } } },
    { $match: { isLow: true } },
    { $count: 'lowStockCount' }
  ]);
  const lowStock = lowStockResult[0]?.lowStockCount || 0;

  // Out of stock
  const outOfStock = await Product.countDocuments({ companyId, 'inventory.quantity': 0 });

  // Average stock level
  const avgStock = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, avgQuantity: { $avg: '$inventory.quantity' } } }
  ]);

  // Total revenue potential (inventory value * avg turnover 4x/year)
  const turnoverBenchmark = 4;
  const revenuePotential = (inventoryValue[0]?.totalValue || 0) * turnoverBenchmark;

  // % low stock of total
  const lowStockPct = totalProducts > 0 ? (lowStock / totalProducts * 100) : 0;

  // Additional stats: Total categories, avg cost per product
  const totalCategories = await Category.countDocuments({ companyId }); // Assume companyId in Category if multi-tenant
  const avgCost = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, avgCost: { $avg: '$pricing.cost' } } }
  ]);

  const summary = {
    totalProducts,
    totalCategories: totalCategories || 0,
    totalInventoryValue: (inventoryValue[0]?.totalValue || 0).toFixed(2),
    avgStockLevel: Math.round((avgStock[0]?.avgQuantity || 0) * 100) / 100,
    avgCostPerProduct: Math.round((avgCost[0]?.avgCost || 0) * 100) / 100,
    lowStockCount: lowStock,
    lowStockPct: Math.round(lowStockPct * 100) / 100 + '%',
    outOfStockCount: outOfStock,
    outOfStockPct: totalProducts > 0 ? Math.round((outOfStock / totalProducts * 100) * 100) / 100 + '%' : '0%',
    revenuePotential: revenuePotential.toFixed(2),
    benchmark: {
      idealTurnover: '4x/year',
      idealLowStockPct: '<10%',
      currentStockDays: (avgStock[0]?.avgQuantity || 0) > 0 ? Math.round(365 / turnoverBenchmark) : 'N/A'
    },
    efficiencyScore: Math.round((1 - (lowStockPct / 100)) * 100) + '%'
  };

  res.json({ success: true, data: summary });
});


const getABCAnalysis = asyncHandler(async (req, res) => {
  // const { companyId } = req.user;
  const companyId = "testCompany"

  // Aggregate by value (cost * quantity) and sort
  const products = await Product.aggregate([
    { $match: { companyId } },
    { $project: { name: 1, value: { $multiply: ['$pricing.cost', '$inventory.quantity'] } } },
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
  const companyId = "testCompany"
  const { startDate, endDate, period = '30' } = req.query; // Default 30 days
  const days = parseInt(period);
  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, createdAt: { $gte: fromDate, $lte: toDate } };

  // COGS (cost of goods sold: sum totalSold * cost over period)
  const cogs = await Product.aggregate([
    { $match: filter },
    { $group: { _id: null, totalCogs: { $sum: { $multiply: ['$sales.totalSold', '$pricing.cost'] } } } }
  ]);

  // Average inventory value (avg over period; approximate as current * days / period)
  const currentValue = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, avgValue: { $avg: { $multiply: ['$inventory.quantity', '$pricing.cost'] } } } }
  ]);
  const avgInventoryValue = currentValue[0]?.avgValue || 0;

  const turnoverRatio = avgInventoryValue > 0 ? (cogs[0]?.totalCogs || 0) / avgInventoryValue : 0;
  const turnoverDays = turnoverRatio > 0 ? 365 / turnoverRatio : 'N/A';
  const benchmark = 4; // Ideal 4x/year
  const efficiency = turnoverRatio / benchmark * 100;

  res.json({ 
    success: true, 
    data: { 
      periodDays: days,
      turnoverRatio: Math.round(turnoverRatio * 100) / 100,
      turnoverDays: Math.round(turnoverDays * 100) / 100,
      cogs: (cogs[0]?.totalCogs || 0).toFixed(2),
      avgInventoryValue: avgInventoryValue.toFixed(2),
      efficiencyPct: Math.round(efficiency * 100) / 100 + '%',
      benchmark: `${benchmark}x/year`,
      insights: turnoverRatio > benchmark ? 'Excellent—fast-moving stock' : (turnoverRatio > 2 ? 'Good—monitor slow items' : 'Low—clear dead stock')
    } 
  });
});

const getAgingInventory = asyncHandler(async (req, res) => {
  const companyId = "testCompany"
  const { daysOld = 90 } = req.query;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const agedProducts = await Product.aggregate([
    { $match: { companyId, createdAt: { $lt: cutoff }, 'sales.totalSold': { $lt: 10 } } },
    { $project: { name: 1, 'inventory.quantity': 1, createdAt: 1, value: { $multiply: ['$inventory.quantity', '$pricing.cost'] } } },
    { $group: { _id: null, totalAged: { $sum: 1 }, totalAgedValue: { $sum: '$value' }, products: { $push: '$$ROOT' } } },
    { $project: { totalAged: 1, totalAgedValue: 1, totalAgedPct: { $literal: 'N/A' }, products: { $slice: ['$products', 20] } } } // Top 20
  ]);

  const totalProducts = await Product.countDocuments({ companyId });
  const totalValue = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, totalValue: { $sum: { $multiply: ['$inventory.quantity', '$pricing.cost'] } } } }
  ]);
  const agedPct = totalProducts > 0 ? (agedProducts[0]?.totalAged / totalProducts * 100) : 0;

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
const companyId = "testCompany"
const { startDate, endDate, productId } = req.query;

  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, changeDate: { $gte: fromDate, $lte: toDate } };
  if (productId) {
    validateMongoId(productId);
    filter.productId = productId;
  }

  const movements = await StockChange.aggregate([
    { $match: filter },
    { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' }, netChange: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, '$quantity', { $multiply: ['$quantity', -1] }] } } } },
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
const companyId = "testCompany"
const { status, startDate, endDate } = req.query;

  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, createdAt: { $gte: fromDate, $lte: toDate } };
  if (status) filter.status = status;

  const adjustments = await InventoryAdjustment.aggregate([
    { $match: filter },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $group: { _id: '$adjustmentType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' }, totalValue: { $sum: { $multiply: ['$quantity', '$product.pricing.cost'] } } } },
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
const companyId = "testCompany"
const { warehouseId } = req.query;

  if (warehouseId) validateMongoId(warehouseId);

  const filter = { companyId };
  if (warehouseId) filter['inventory.perWarehouse.warehouseId'] = warehouseId;

  const warehouseStock = await Product.aggregate([
    { $match: filter },
    { $unwind: '$inventory.perWarehouse' },
    { $group: { _id: '$inventory.perWarehouse.warehouseId', totalStock: { $sum: '$inventory.perWarehouse.quantity' }, totalValue: { $sum: { $multiply: ['$inventory.perWarehouse.quantity', '$pricing.cost'] } } } },
    { $lookup: { from: 'warehouses', localField: '_id', foreignField: '_id', as: 'warehouse' } },
    { $unwind: '$warehouse' },
    { $project: { name: '$warehouse.name', totalStock: 1, totalValue: 1, capacity: '$warehouse.capacity' } },
    { $addFields: { utilizationPct: { $cond: [{ $gt: ['$capacity', 0] }, { $multiply: [{ $divide: ['$totalStock', '$capacity'] }, 100] }, 0 ] } } }
  ]);

  const totalStockAll = warehouseStock.reduce((sum, w) => sum + w.totalStock, 0);
  const avgUtilization = warehouseStock.length > 0 ? warehouseStock.reduce((sum, w) => sum + w.utilizationPct, 0) / warehouseStock.length : 0;

  const report = {
    totalWarehouses: warehouseStock.length,
    totalStock: totalStockAll,
    avgUtilizationPct: Math.round(avgUtilization * 100) / 100 + '%',
    warehouses: warehouseStock.map(w => ({
      name: w.name,
      totalStock: w.totalStock,
      totalValue: w.totalValue.toFixed(2),
      utilizationPct: Math.round(w.utilizationPct * 100) / 100 + '%',
      capacity: w.capacity || 'Unlimited'
    })),
    insights: {
      overUtilized: warehouseStock.filter(w => w.utilizationPct > 80).length,
      recommendation: avgUtilization > 70 ? 'Rebalance stock across warehouses' : 'Optimal distribution'
    }
  };

  res.json({ success: true, data: report });
});

const getAlertSummary = asyncHandler(async (req, res) => {
const companyId = "testCompany"
const { startDate, endDate } = req.query;

  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, createdAt: { $gte: fromDate, $lte: toDate } };

  const summary = await Alert.aggregate([
    { $match: filter },
    { $group: { _id: { type: '$type', isResolved: '$isResolved' }, count: { $sum: 1 } } },
    { $group: { 
      _id: '$_id.type', 
      total: { $sum: '$count' }, 
      resolved: { $sum: { $cond: [{ $eq: ['$isResolved', true] }, '$count', 0 ] } },
      unresolved: { $sum: { $cond: [{ $eq: ['$isResolved', false] }, '$count', 0 ] } } 
    } },
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
const companyId = "testCompany"
const { startDate, endDate } = req.query;

  const fromDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = endDate ? new Date(endDate) : new Date();

  const filter = { companyId, startDate: { $gte: fromDate }, endDate: { $lte: toDate }, isActive: true };

  const impact = await Discount.aggregate([
    { $match: filter },
    { $lookup: {
      from: 'products',
      localField: 'productId',
      foreignField: '_id',
      as: 'product'
    } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $project: { 
      name: 1, 
      type: 1, 
      value: 1, 
      discountAmount: { $multiply: ['$value', { $ifNull: ['$product.sales.totalSold', 0] }] },
      salesLift: { $ifNull: ['$product.sales.totalSold', 0] },
      revenue: { $multiply: [{ $ifNull: ['$product.pricing.basePrice', 0] }, { $ifNull: ['$product.sales.totalSold', 0] }] },
      cost: { $ifNull: ['$product.pricing.cost', 0] }
    } },
    { $group: { 
      _id: '$type', 
      count: { $sum: 1 },
      totalDiscount: { $sum: '$discountAmount' },
      totalSalesLift: { $sum: '$salesLift' },
      totalRevenue: { $sum: '$revenue' },
      totalCost: { $sum: '$cost' },
      avgMargin: { $avg: { $divide: [{ $subtract: ['$revenue', '$cost'] }, '$revenue'] } }
    } },
    { $project: { 
      type: '$_id', 
      count: 1, 
      totalDiscount: { $round: ['$totalDiscount', 2] },
      totalSalesLift: 1,
      totalRevenue: { $round: ['$totalRevenue', 2] },
      totalCost: { $round: ['$totalCost', 2] },
      roi: { $round: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalDiscount'] }, 2] },
      avgMarginPct: { $round: [{ $multiply: ['$avgMargin', 100] }, 2] }
    } }
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

module.exports = {
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
  getDiscountImpact
};