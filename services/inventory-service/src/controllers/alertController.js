const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Alert = require('../models/Alert');
const { validateMongoId } = require('../utils/validateMongoId');

const getAllAlerts = asyncHandler(async (req, res) => {
  const { companyId, type, isResolved, page = 1, limit = 20 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }
  // validateMongoId(companyId);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { companyId };
  if (type) query.type = type;
  if (isResolved !== undefined) query.isResolved = isResolved === 'true';

  const alerts = await Alert.find(query)
    .populate('productId', 'name slug')
    .populate('categoryId', 'name slug')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Alert.countDocuments(query);

  res.status(200).json({
    success: true,
    data: alerts,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
  });
});

const getAlertById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const alert = await Alert.findById(id)
    .populate('productId', 'name slug inventory')
    .populate('categoryId', 'name slug');

  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

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

  const alert = await Alert.findByIdAndDelete(id);

  if (!alert) {
    return res.status(404).json({ success: false, message: 'Alert not found' });
  }

  res.status(200).json({ success: true, message: 'Alert deleted successfully' });
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

module.exports = {
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  resolveAlert,
  getUnresolvedAlerts
};