const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Discount = require('../models/Discount');
const { validateMongoId } = require('../utils/validateMongoId');

const getAllDiscounts = asyncHandler(async (req, res) => {
  const { companyId, isActive, page = 1, limit = 20 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }
  // validateMongoId(companyId);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { companyId };
  if (isActive !== undefined) query.isActive = isActive === 'true';

  const discounts = await Discount.find(query)
    .populate('productId', 'name slug')
    .populate('categoryId', 'name slug')
    .sort({ startDate: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Discount.countDocuments(query);

  res.status(200).json({
    success: true,
    data: discounts,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
  });
});

const getDiscountById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const discount = await Discount.findById(id)
    .populate('productId', 'name slug')
    .populate('categoryId', 'name slug');

  if (!discount) {
    return res.status(404).json({ success: false, message: 'Discount not found' });
  }

  res.status(200).json({ success: true, data: discount });
});

const createDiscount = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const discount = new Discount(req.body);
  await discount.save();

  res.status(201).json({ success: true, message: 'Discount created successfully', data: discount });
});

const updateDiscount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
  }

  const discount = await Discount.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

  if (!discount) {
    return res.status(404).json({ success: false, message: 'Discount not found' });
  }

  res.status(200).json({ success: true, message: 'Discount updated successfully', data: discount });
});

const deleteDiscount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const discount = await Discount.findByIdAndDelete(id);

  if (!discount) {
    return res.status(404).json({ success: false, message: 'Discount not found' });
  }

  res.status(200).json({ success: true, message: 'Discount deleted successfully' });
});

const getActiveDiscounts = asyncHandler(async (req, res) => {
  const { productId, categoryId } = req.query;

  if (!productId && !categoryId) {
    return res.status(400).json({ success: false, message: 'Provide productId or categoryId' });
  }
  if (productId) validateMongoId(productId);
  if (categoryId) validateMongoId(categoryId);

  const discounts = await Discount.getActiveDiscounts({ productId, categoryId });

  res.status(200).json({ success: true, data: discounts, count: discounts.length });
});

module.exports = {
  getAllDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  getActiveDiscounts
};