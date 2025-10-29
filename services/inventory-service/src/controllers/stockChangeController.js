const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const StockChange = require('../models/StockChange');
const { validateMongoId } = require('../utils/validateMongoId');

const getAllStockChanges = asyncHandler(async (req, res) => {
  const { companyId, productId, changeType, page = 1, limit = 20 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }
  // validateMongoId(companyId);
  if (productId) validateMongoId(productId);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { companyId };
  if (productId) query.productId = productId;
  if (changeType) query.changeType = changeType;

  const stockChanges = await StockChange.find(query)
    .populate('productId', 'name slug')
    .sort({ changeDate: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await StockChange.countDocuments(query);

  res.status(200).json({
    success: true,
    data: stockChanges,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
  });
});

const getStockChangeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const stockChange = await StockChange.findById(id)
    .populate('productId', 'name slug inventory.quantity');

  if (!stockChange) {
    return res.status(404).json({ success: false, message: 'Stock change not found' });
  }

  res.status(200).json({ success: true, data: stockChange });
});

const createStockChange = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const stockChange = new StockChange({
    ...req.body,
    companyId: req.user.companyId,
    userId: req.user.id
  });
  await stockChange.save();

  res.status(201).json({ success: true, message: 'Stock change recorded successfully', data: stockChange });
});

const getStockHistory = asyncHandler(async (req, res) => {
  const { productId, variationId, startDate, endDate, changeType } = req.query;

  if (!productId) {
    return res.status(400).json({ success: false, message: 'Product ID is required' });
  }
  validateMongoId(productId);
  if (variationId) validateMongoId(variationId);

  const history = await StockChange.getStockHistory({ productId, variationId, startDate, endDate, changeType });

  res.status(200).json({ success: true, data: history, count: history.length });
});

module.exports = {
  getAllStockChanges,
  getStockChangeById,
  createStockChange,
  getStockHistory
};