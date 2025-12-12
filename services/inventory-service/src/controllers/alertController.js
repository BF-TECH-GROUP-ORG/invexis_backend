const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Alert = require('../models/Alert');
const AlertTriggerService = require('../services/alertTriggerService');
const { validateMongoId } = require('../utils/validateMongoId');
const logger = require('../utils/logger');
const { getCache, setCache } = require('../utils/redisHelper');

const getAllAlerts = asyncHandler(async (req, res) => {
  const { companyId, type, isResolved } = req.query;
  let page = parseInt(req.query.page || 1);
  let limit = Math.min(parseInt(req.query.limit || 100), 100);

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }

  const skip = (page - 1) * limit;
  const cacheKey = `alerts:company:${companyId}:page:${page}:limit:${limit}:type:${type || ''}:resolved:${isResolved || ''}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.status(200).json({ success: true, data: cached.data, pagination: cached.pagination });

  const query = { companyId };
  if (type) query.type = type;
  if (isResolved !== undefined) query.isResolved = isResolved === 'true';
  
  const [alerts, total] = await Promise.all([
    Alert.find(query)
      .populate('productId', 'name sku')
      .populate('categoryId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Alert.countDocuments(query)
  ]);

  const pagination = { page, limit, total, pages: Math.ceil(total / limit) };
  setCache(cacheKey, { data: alerts, pagination }, 60).catch(() => {});

  res.status(200).json({ success: true, data: alerts, pagination });
});

const getAlertById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const cacheKey = `alert:${id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.status(200).json({ success: true, data: cached });

  const alert = await Alert.findById(id)
    .populate('productId', 'name sku')
    .populate('categoryId', 'name slug')
    .lean();

  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  setCache(cacheKey, alert, 3600).catch(() => {});
  res.status(200).json({ success: true, data: alert });
});

const createAlert = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const alert = new Alert(req.body);
  await alert.save();

  res.status(201).json({ success: true, message: 'Alert created successfully', data: alert });
});

const updateAlert = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const alert = await Alert.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  res.status(200).json({ success: true, message: 'Alert updated successfully', data: alert });
});

const deleteAlert = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const alert = await Alert.findById(id);

  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  // Soft-delete the alert
  await Alert.updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });

  res.status(200).json({ success: true, message: 'Alert soft-deleted successfully' });
});

const resolveAlert = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const alert = await Alert.findById(id);
  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  await alert.resolve(req.user?.id);

  res.status(200).json({ success: true, message: 'Alert resolved successfully', data: alert });
});

const getUnresolvedAlerts = asyncHandler(async (req, res) => {
  const { companyId, limit = 50 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }
  validateMongoId(companyId);

  const alerts = await Alert.getUnresolvedAlerts(companyId, parseInt(limit));

  res.status(200).json({ success: true, data: alerts, count: alerts.length });
});

// ==================== SMART ALERT GENERATORS ====================

const StockChange = require('../models/StockChange');
const Product = require('../models/Product');

/**
 * @desc    Generate daily summary alert
 * @route   POST /api/v1/alerts/trigger/daily-summary
 */
const generateDailySummary = asyncHandler(async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId required' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Aggregate sales using StockChange schema (type, qty, createdAt)
  const sales = await StockChange.aggregate([
    { $match: { companyId, type: 'sale', createdAt: { $gte: today, $lt: tomorrow } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    // lookup pricing document referenced by product.pricingId
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalUnits: { $sum: { $abs: '$qty' } }, totalRevenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } }, transactionCount: { $sum: 1 } } }
  ]);

  const stats = sales[0] || { totalUnits: 0, totalRevenue: 0, transactionCount: 0 };

  // Create Alert
  const alert = await Alert.create({
    companyId,
    type: 'daily_summary',
    priority: 'low',
    message: `Daily Summary: ${stats.totalUnits} units sold, $${stats.totalRevenue.toFixed(2)} revenue.`,
    data: {
      date: today,
      ...stats
    }
  });

  res.json({ success: true, message: 'Daily summary generated', data: alert });
});

/**
 * @desc    Generate weekly summary alert
 * @route   POST /api/v1/alerts/trigger/weekly-summary
 */
const generateWeeklySummary = asyncHandler(async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId required' });

  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const sales = await StockChange.aggregate([
    { $match: { companyId, type: 'sale', createdAt: { $gte: lastWeek } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalUnits: { $sum: { $abs: '$qty' } }, totalRevenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } }, transactionCount: { $sum: 1 } } }
  ]);

  const stats = sales[0] || { totalUnits: 0, totalRevenue: 0, transactionCount: 0 };

  const alert = await Alert.create({
    companyId,
    type: 'weekly_summary',
    priority: 'medium',
    message: `Weekly Summary: ${stats.totalUnits} units sold, $${stats.totalRevenue.toFixed(2)} revenue.`,
    data: {
      startDate: lastWeek,
      endDate: today,
      ...stats
    }
  });

  res.json({ success: true, message: 'Weekly summary generated', data: alert });
});

/**
 * @desc    Generate monthly summary alert
 * @route   POST /api/v1/alerts/trigger/monthly-summary
 */
const generateMonthlySummary = asyncHandler(async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId required' });

  const today = new Date();
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const sales = await StockChange.aggregate([
    { $match: { companyId, type: 'sale', createdAt: { $gte: lastMonth } } },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
    { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
    { $group: { _id: null, totalUnits: { $sum: { $abs: '$qty' } }, totalRevenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$pricing.basePrice', 0] }] } }, transactionCount: { $sum: 1 } } }
  ]);

  const stats = sales[0] || { totalUnits: 0, totalRevenue: 0, transactionCount: 0 };

  const alert = await Alert.create({
    companyId,
    type: 'monthly_summary',
    priority: 'high',
    message: `Monthly Summary: ${stats.totalUnits} units sold, $${stats.totalRevenue.toFixed(2)} revenue.`,
    data: {
      startDate: lastMonth,
      endDate: today,
      ...stats
    }
  });

  res.json({ success: true, message: 'Monthly summary generated', data: alert });
});

/**
 * @desc    Mark a single alert as read
 * @route   PATCH /api/v1/alerts/:id/read
 */
const markAlertAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId, userRole = 'user' } = req.body;

  validateMongoId(id);

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  const alert = await Alert.findById(id);
  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  await alert.markAsRead(userId, userRole);

  res.json({
    success: true,
    message: 'Alert marked as read',
    data: alert
  });
});

/**
 * @desc    Mark a single alert as unread
 * @route   PATCH /api/v1/alerts/:id/unread
 */
const markAlertAsUnread = asyncHandler(async (req, res) => {
  const { id } = req.params;

  validateMongoId(id);

  const alert = await Alert.findById(id);
  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  await alert.markAsUnread();

  res.json({
    success: true,
    message: 'Alert marked as unread',
    data: alert
  });
});

/**
 * @desc    Mark multiple alerts as read (bulk operation)
 * @route   PATCH /api/v1/alerts/bulk/read
 */
const markMultipleAlertsAsRead = asyncHandler(async (req, res) => {
  const { alertIds, userId, userRole = 'user' } = req.body;

  if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'alertIds array is required and must not be empty'
    });
  }

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  const alerts = await Alert.find({ _id: { $in: alertIds } });

  if (alerts.length === 0) {
    return res.status(404).json({ success: false, message: 'No alerts found' });
  }

  // Mark all as read
  const updatePromises = alerts.map(alert => alert.markAsRead(userId, userRole));
  await Promise.all(updatePromises);

  res.json({
    success: true,
    message: `${alerts.length} alerts marked as read`,
    count: alerts.length
  });
});

/**
 * @desc    Get all unread alerts for a user/scope
 * @route   GET /api/v1/alerts/unread
 */
const getUnreadAlerts = asyncHandler(async (req, res) => {
  const { companyId, userId, shopId = null, limit = 50 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  const alerts = await Alert.getUnreadAlerts(
    companyId,
    userId,
    shopId,
    parseInt(limit)
  );

  res.json({
    success: true,
    data: alerts,
    count: alerts.length
  });
});

/**
 * @desc    Get unread alert count for a user
 * @route   GET /api/v1/alerts/unread/count
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const { companyId, userId, shopId = null } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }

  const query = { companyId, isRead: false };

  if (shopId) {
    query.$or = [
      { scope: 'shop', shopId },
      { scope: 'company' },
      { scope: 'global' }
    ];
  } else {
    query.$or = [
      { scope: 'company' },
      { scope: 'global' }
    ];
  }

  const unreadCount = await Alert.countDocuments(query);

  res.json({
    success: true,
    unreadCount,
    userId,
    companyId,
    shopId: shopId || null
  });
});

/**
 * @desc    Get alert history with filters
 * @route   GET /api/v1/alerts/history
 */
const getAlertHistory = asyncHandler(async (req, res) => {
  const {
    companyId,
    shopId = null,
    type = null,
    scope = null,
    startDate = null,
    endDate = null,
    isRead = null,
    priority = null,
    page = 1,
    limit = 20
  } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }

  const filters = {
    shopId,
    type,
    scope,
    startDate,
    endDate,
    isRead,
    priority,
    page,
    limit
  };

  const result = await Alert.getHistory(companyId, filters);

  res.json({
    success: true,
    data: result.alerts,
    pagination: result.pagination
  });
});

/**
 * @desc    Get alert statistics
 * @route   GET /api/v1/alerts/stats
 */
const getAlertStats = asyncHandler(async (req, res) => {
  const { companyId, shopId = null } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }

  const query = { companyId };

  if (shopId) {
    query.$or = [
      { scope: 'shop', shopId },
      { scope: 'company' },
      { scope: 'global' }
    ];
  }

  // Get stats
  const [
    totalAlerts,
    unreadCount,
    unresolvedCount,
    alertsByType,
    alertsByPriority,
    alertsByScope
  ] = await Promise.all([
    Alert.countDocuments(query),
    Alert.countDocuments({ ...query, isRead: false }),
    Alert.countDocuments({ ...query, isResolved: false }),
    Alert.aggregate([
      { $match: query },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Alert.aggregate([
      { $match: query },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Alert.aggregate([
      { $match: query },
      { $group: { _id: '$scope', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
  ]);

  res.json({
    success: true,
    stats: {
      totalAlerts,
      unreadCount,
      unresolvedCount,
      readCount: totalAlerts - unreadCount,
      resolvedCount: totalAlerts - unresolvedCount,
      alertsByType: Object.fromEntries(
        alertsByType.map(item => [item._id, item.count])
      ),
      alertsByPriority: Object.fromEntries(
        alertsByPriority.map(item => [item._id, item.count])
      ),
      alertsByScope: Object.fromEntries(
        alertsByScope.map(item => [item._id, item.count])
      )
    }
  });
});

/**
 * @desc    Trigger new arrival alert for a product (manual)
 * @route   POST /api/v1/alerts/trigger/new-arrival
 */
const triggerNewArrivalAlert = asyncHandler(async (req, res) => {
  const { productData } = req.body;

  if (!productData) {
    return res.status(400).json({ success: false, message: 'productData is required' });
  }

  const alert = await AlertTriggerService.triggerNewArrivalAlert(productData);

  res.json({
    success: true,
    message: 'New arrival alert triggered',
    data: alert
  });
});


/**
 * @desc    Run smart checks on demand
 * @route   POST /api/v1/alerts/trigger/smart-checks
 */
const runSmartChecks = asyncHandler(async (req, res) => {
  const { companyId, shopId = null } = req.body;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId required' });
  }

  const alerts = await AlertTriggerService.runSmartChecks(companyId, shopId);

  res.json({ success: true, message: 'Smart checks executed', data: alerts });
});



module.exports = {
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  resolveAlert,
  getUnresolvedAlerts,
  generateDailySummary,
  generateWeeklySummary,
  generateMonthlySummary,
  runSmartChecks,
  triggerNewArrivalAlert,
  // New endpoints
  markAlertAsRead,
  markAlertAsUnread,
  markMultipleAlertsAsRead,
  getUnreadAlerts,
  getUnreadCount,
  getAlertHistory,
  getAlertStats
};