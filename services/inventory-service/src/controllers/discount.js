const asyncHandler = require('express-async-handler');
const Discount = require('../models/Discount');
const { validateMongoId } = require('../utils/validator');

const createDiscount = asyncHandler(async (req, res) => {
  const discount = new Discount({ ...req.body, companyId: req.user.companyId });
  await discount.save();
  res.status(201).json({ success: true, data: discount });
});

const getActiveDiscounts = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  validateMongoId(productId);
  const discounts = await Discount.getActiveDiscounts(productId);
  res.json({ success: true, data: discounts });
});

module.exports = { createDiscount, getActiveDiscounts };