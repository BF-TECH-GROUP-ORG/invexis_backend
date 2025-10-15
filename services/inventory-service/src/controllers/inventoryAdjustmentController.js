const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const { validateMongoId } = require('../utils/validateMongoId');

const getAllAdjustments = asyncHandler(async (req, res) => {
  const { companyId, status, page = 1, limit = 20 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }
//   validateMongoId(companyId);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { companyId };
  if (status) query.status = status;

  const adjustments = await InventoryAdjustment.find(query)
    .populate('productId', 'name slug')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await InventoryAdjustment.countDocuments(query);

  res.status(200).json({
    success: true,
    data: adjustments,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
  });
});

const getAdjustmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const adjustment = await InventoryAdjustment.findById(id)
    .populate('productId', 'name slug');

  if (!adjustment) {
    return res.status(404).json({ success: false, message: 'Adjustment not found' });
  }

  res.status(200).json({ success: true, data: adjustment });
});

const createAdjustment = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const adjustment = new InventoryAdjustment({
    ...req.body,
    companyId: "testCompany",
    userId: "req.user.id"
  });
  await adjustment.save();

  res.status(201).json({ success: true, message: 'Adjustment created successfully', data: adjustment });
});

const approveAdjustment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const adjustment = await InventoryAdjustment.findById(id);
  if (!adjustment) {
    return res.status(404).json({ success: false, message: 'Adjustment not found' });
  }

  adjustment.status = 'approved';
  adjustment.approvedBy = "req.user.id";
  await adjustment.save();

  res.status(200).json({ success: true, message: 'Adjustment approved successfully', data: adjustment });
});

const rejectAdjustment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const adjustment = await InventoryAdjustment.findById(id);
  if (!adjustment) {
    return res.status(404).json({ success: false, message: 'Adjustment not found' });
  }

  adjustment.status = 'rejected';
  await adjustment.save();

  res.status(200).json({ success: true, message: 'Adjustment rejected successfully', data: adjustment });
});

module.exports = {
  getAllAdjustments,
  getAdjustmentById,
  createAdjustment,
  approveAdjustment,
  rejectAdjustment
};