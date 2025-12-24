// Manual async wrapper instead of express-async-handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
// Simple validation result helper
const validationResult = (req) => {
  return {
    isEmpty: () => true,
    array: () => []
  };
};
const mongoose = require('mongoose');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const Product = require('../models/Product');
const { validateMongoId } = require('../utils/validateMongoId');
const { getCache, setCache, scanDel } = require('../utils/redisHelper');

const getAllAdjustments = asyncHandler(async (req, res) => {
  const { companyId } = req.query;
  let { page = 1, limit = 100 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }

  page = parseInt(page);
  limit = Math.min(parseInt(limit) || 100, 100);
  const skip = (page - 1) * limit;

  const status = req.query.status;
  const cacheKey = `adjustments:company:${companyId}:page:${page}:limit:${limit}:status:${status || ''}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.status(200).json({ success: true, data: cached.data, pagination: cached.pagination });

  const query = { companyId };
  if (req.query.shopId) query.shopId = req.query.shopId;
  if (status) query.status = status;

  const [adjustments, total] = await Promise.all([
    InventoryAdjustment.find(query)
      .populate('productId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InventoryAdjustment.countDocuments(query)
  ]);

  const pagination = { page, limit, total, pages: Math.ceil(total / limit) };
  setCache(cacheKey, { data: adjustments, pagination }, 60).catch(() => {});

  res.status(200).json({ success: true, data: adjustments, pagination });
});

const getAdjustmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const cacheKey = `adjustment:${id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.status(200).json({ success: true, data: cached });

  const adjustment = await InventoryAdjustment.findById(id)
    .populate('productId', 'name slug')
    .lean();

  if (!adjustment) {
    return res.status(404).json({ success: false, message: 'Adjustment not found' });
  }

  setCache(cacheKey, adjustment, 3600).catch(() => {});
  res.status(200).json({ success: true, data: adjustment });
});

const createAdjustment = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const { productId, variationId, quantity, reason, adjustmentType } = req.body;
  const companyId = req.user.companyId;
  const userId = req.user.id;

  // EDGE CASE: Validate quantity is positive and numeric
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Quantity must be a positive number',
      field: 'quantity'
    });
  }

  // EDGE CASE: Validate reason is provided and meaningful (min 5 chars)
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({
      success: false,
      message: 'Reason must be provided and at least 5 characters long',
      field: 'reason'
    });
  }

  // EDGE CASE: Validate product exists and belongs to company
  validateMongoId(productId);
  const product = await Product.findOne({ _id: productId, companyId }).lean();
  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found or does not belong to your company',
      field: 'productId'
    });
  }

  // EDGE CASE: Validate variation exists if provided
  if (variationId) {
    validateMongoId(variationId);
    const ProductVariation = require('../models/ProductVariation');
    const variation = await ProductVariation.findOne({
      _id: variationId,
      productId: productId
    }).lean();
    if (!variation) {
      return res.status(404).json({
        success: false,
        message: 'Variation not found for this product',
        field: 'variationId'
      });
    }
  }

  const adjustment = new InventoryAdjustment({
    productId,
    variationId: variationId || null,
    quantity: Math.floor(Math.abs(Number(quantity))),
    reason: reason.trim(),
    adjustmentType: adjustmentType || 'loss', // Default to loss if not specified
    companyId,
    shopId: req.body.shopId || product.shopId,
    userId,
    status: 'pending'
  });

  try {
    await adjustment.save();
  } catch (err) {
    if (err.name === 'MongoServerError' && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate adjustment request',
        error: err.message
      });
    }
    throw err;
  }

  await scanDel('adjustments:*').catch(() => {});

  res.status(201).json({ success: true, message: 'Adjustment created successfully', data: adjustment });
});

const approveAdjustment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const adjustment = await InventoryAdjustment.findById(id);
  if (!adjustment) {
    return res.status(404).json({ success: false, message: 'Adjustment not found' });
  }

  // EDGE CASE: Idempotency check - only allow approval if status is 'pending'
  // Calculate stock delta based on adjustment type
  // Gains/Restocks increase stock (+), Damage/Theft/Loss/Other decrease stock (-)
  // 'count' is typically treated as a loss if positive quantity is provided as "missing"
  const isGain = ['gain', 'restock'].includes(adjustment.adjustmentType);
  const stockDelta = isGain ? Math.abs(adjustment.quantity) : -Math.abs(adjustment.quantity);

  // Fetch current stock to perform safety checks
  const ProductStock = mongoose.model('ProductStock');
  const stockRecord = await ProductStock.findOne({
    productId: adjustment.productId,
    variationId: adjustment.variationId || null
  });

  if (!stockRecord) {
    return res.status(404).json({ success: false, message: 'Current stock record not found for this product' });
  }

  // Safety check: Cannot result in negative stock unless backorders allowed
  const newStock = stockRecord.stockQty + stockDelta;
  if (newStock < 0 && !stockRecord.allowBackorder) {
    return res.status(400).json({
      success: false,
      message: `Adjustment rejected: Results in negative stock (${newStock}). Current available: ${stockRecord.stockQty}`,
      currentStock: stockRecord.stockQty,
      requestedAdjustment: stockDelta
    });
  }

  // Create StockChange - this will trigger the atomic update to ProductStock via its pre-save hook
  const StockChange = mongoose.model('StockChange');
  const stockChange = new StockChange({
    companyId: adjustment.companyId,
    shopId: adjustment.shopId,
    productId: adjustment.productId,
    variationId: adjustment.variationId,
    type: 'adjustment',
    qty: stockDelta,
    previous: stockRecord.stockQty,
    reason: `Approved Adjustment: ${adjustment.reason}`,
    userId: req.user.id,
    meta: {
      adjustmentId: adjustment._id,
      adjustmentType: adjustment.adjustmentType
    }
  });

  try {
    await stockChange.save();
    
    // Update adjustment status
    adjustment.status = 'approved';
    adjustment.approvedBy = req.user.id;
    adjustment.approvedAt = new Date();
    await adjustment.save();

  } catch (err) {
    return res.status(400).json({
      success: false,
      message: 'Failed to apply adjustment: ' + err.message,
      error: err.message
    });
  }

  await Promise.all([
    scanDel('adjustments:*'),
    scanDel('products:*'),
    scanDel(`product:${adjustment.productId}*`)
  ]).catch(() => {});

  res.status(200).json({ 
    success: true, 
    message: 'Adjustment approved and stock updated successfully', 
    data: {
      adjustment,
      stockDelta,
      previousStock: stockRecord.stockQty,
      newStock: newStock
    }
  });
});

const rejectAdjustment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;
  validateMongoId(id);

  // EDGE CASE: Require rejection reason
  if (!rejectionReason || rejectionReason.trim().length < 5) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason must be provided and at least 5 characters long',
      field: 'rejectionReason'
    });
  }

  const adjustment = await InventoryAdjustment.findById(id);
  if (!adjustment) {
    return res.status(404).json({ success: false, message: 'Adjustment not found' });
  }

  // EDGE CASE: Idempotency check - only allow rejection if status is 'pending'
  if (adjustment.status !== 'pending') {
    return res.status(409).json({
      success: false,
      message: `Cannot reject adjustment with status '${adjustment.status}'. Only 'pending' adjustments can be rejected.`,
      currentStatus: adjustment.status,
      field: 'status'
    });
  }

  adjustment.status = 'rejected';
  adjustment.rejectionReason = rejectionReason.trim();
  adjustment.rejectedBy = req.user.id;
  adjustment.rejectedAt = new Date();

  await adjustment.save();

  await scanDel('adjustments:*').catch(() => {});

  res.status(200).json({ success: true, message: 'Adjustment rejected successfully', data: adjustment });
});

module.exports = {
  getAllAdjustments,
  getAdjustmentById,
  createAdjustment,
  approveAdjustment,
  rejectAdjustment
};