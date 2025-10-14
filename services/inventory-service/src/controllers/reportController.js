// reportController.js
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
  const { companyId } = req.user;
  const { date } = req.query;
  const reportDate = date ? new Date(date) : new Date();
  reportDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(reportDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // Stock changes today
  const stockChanges = await StockChange.aggregate([
    { $match: { companyId, changeDate: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
  ]);

  // Alerts generated today
  const alerts = await Alert.aggregate([
    { $match: { companyId, createdAt: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  // Sales today (from product sales.totalSold delta - approximate via stock 'sale' changes)
  const sales = await StockChange.aggregate([
    { $match: { companyId, changeType: 'sale', changeDate: { $gte: reportDate, $lt: nextDay } } },
    { $group: { _id: null, totalSales: { $sum: { $abs: '$quantity' } } } } // Absolute for sales count
  ]);

  // Low stock count
  const lowStock = await Product.countDocuments({ companyId, 'inventory.quantity': { $lte: '$inventory.lowStockThreshold' } });

  const report = {
    date: reportDate.toISOString().split('T')[0],
    stockChanges,
    alerts,
    sales: sales[0]?.totalSales || 0,
    lowStockCount: lowStock
  };

  res.json({ success: true, data: report });
});

const getProductReport = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  validateMongoId(productId);
  const { companyId } = req.user;

  const product = await Product.findOne({ _id: productId, companyId });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  // Stock history
  const stockHistory = await StockChange.find({ productId }).sort({ changeDate: -1 }).limit(50);

  // Sales and revenue
  const sales = product.sales;

  // Turnover ratio (totalSold / average stock - approximate)
  const turnover = sales.totalSold / (product.inventory.quantity || 1);

  // Discounts applied
  const discounts = await Discount.find({ productId, isActive: true });

  const report = {
    productName: product.name,
    currentStock: product.inventory.quantity,
    sales,
    turnoverRatio: turnover,
    stockHistory,
    discounts
  };

  res.json({ success: true, data: report });
});

const getInventorySummary = asyncHandler(async (req, res) => {
  const { companyId } = req.user;

  // Total products
  const totalProducts = await Product.countDocuments({ companyId });

  // Total inventory value (sum of cost * quantity)
  const inventoryValue = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, totalValue: { $sum: { $multiply: ['$pricing.cost', '$inventory.quantity'] } } } }
  ]);

  // Low stock count
  const lowStock = await Product.countDocuments({ companyId, 'inventory.quantity': { $lte: '$inventory.lowStockThreshold' } });

  // Out of stock
  const outOfStock = await Product.countDocuments({ companyId, 'inventory.quantity': 0 });

  const summary = {
    totalProducts,
    totalInventoryValue: inventoryValue[0]?.totalValue || 0,
    lowStockCount: lowStock,
    outOfStockCount: outOfStock
  };

  res.json({ success: true, data: summary });
});

const getABCAnalysis = asyncHandler(async (req, res) => {
  const { companyId } = req.user;

  // Aggregate by value (cost * quantity) and sort
  const products = await Product.aggregate([
    { $match: { companyId } },
    { $project: { name: 1, value: { $multiply: ['$pricing.cost', '$inventory.quantity'] } } },
    { $sort: { value: -1 } }
  ]);

  const totalValue = products.reduce((sum, p) => sum + p.value, 0);
  let cumulative = 0;
  const abc = products.map(p => {
    cumulative += p.value;
    const percentage = (cumulative / totalValue) * 100;
    p.category = percentage <= 80 ? 'A' : percentage <= 95 ? 'B' : 'C';
    return p;
  });

  res.json({ success: true, data: abc });
});

const getInventoryTurnover = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query;
  const filter = { companyId };
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // Cost of goods sold (approx from sales revenue - but using totalSold * cost)
  const cogs = await Product.aggregate([
    { $match: filter },
    { $group: { _id: null, totalCogs: { $sum: { $multiply: ['$sales.totalSold', '$pricing.cost'] } } } }
  ]);

  // Average inventory (approx current quantity * cost)
  const avgInventory = await Product.aggregate([
    { $match: { companyId } },
    { $group: { _id: null, avgValue: { $avg: { $multiply: ['$inventory.quantity', '$pricing.cost'] } } } }
  ]);

  const turnover = (cogs[0]?.totalCogs || 0) / (avgInventory[0]?.avgValue || 1);

  res.json({ success: true, data: { turnoverRatio: turnover } });
});

const getAgingInventory = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { daysOld = 90 } = req.query;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const agedProducts = await Product.find({
    companyId,
    createdAt: { $lt: cutoff },
    'sales.totalSold': { $lt: 10 } // Example threshold for slow-moving
  }).select('name inventory.quantity createdAt');

  res.json({ success: true, data: agedProducts });
});

const getStockMovementReport = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { startDate, endDate, productId } = req.query;

  const filter = { companyId };
  if (productId) {
    validateMongoId(productId);
    filter.productId = productId;
  }
  if (startDate || endDate) {
    filter.changeDate = {};
    if (startDate) filter.changeDate.$gte = new Date(startDate);
    if (endDate) filter.changeDate.$lte = new Date(endDate);
  }

  const movements = await StockChange.aggregate([
    { $match: filter },
    { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
  ]);

  res.json({ success: true, data: movements });
});

const getAdjustmentReport = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { status, startDate, endDate } = req.query;

  const filter = { companyId };
  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const adjustments = await InventoryAdjustment.find(filter).populate('productId', 'name');

  res.json({ success: true, data: adjustments });
});

const getWarehouseReport = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { warehouseId } = req.query;

  if (warehouseId) validateMongoId(warehouseId);

  const filter = { companyId };
  if (warehouseId) filter['inventory.perWarehouse.warehouseId'] = warehouseId;

  const warehouseStock = await Product.aggregate([
    { $match: filter },
    { $unwind: '$inventory.perWarehouse' },
    { $group: { _id: '$inventory.perWarehouse.warehouseId', totalStock: { $sum: '$inventory.perWarehouse.quantity' } } },
    { $lookup: { from: 'warehouses', localField: '_id', foreignField: '_id', as: 'warehouse' } },
    { $unwind: '$warehouse' },
    { $project: { name: '$warehouse.name', totalStock: 1 } }
  ]);

  res.json({ success: true, data: warehouseStock });
});

const getAlertSummary = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query;

  const filter = { companyId };
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const summary = await Alert.aggregate([
    { $match: filter },
    { $group: { _id: { type: '$type', isResolved: '$isResolved' }, count: { $sum: 1 } } }
  ]);

  res.json({ success: true, data: summary });
});

const getDiscountImpact = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query;

  const filter = { companyId };
  if (startDate || endDate) {
    filter.startDate = { $gte: new Date(startDate) };
    filter.endDate = { $lte: new Date(endDate) };
  }

  const impact = await Discount.aggregate([
    { $match: filter },
    { $lookup: {
      from: 'products',
      localField: 'productId',
      foreignField: '_id',
      as: 'product'
    } },
    { $unwind: '$product' },
    { $project: { discountValue: '$value', sales: '$product.sales.totalSold', type: 1 } },
    { $group: { _id: '$type', totalImpact: { $sum: { $multiply: ['$discountValue', '$sales'] } } } }
  ]);

  res.json({ success: true, data: impact });
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