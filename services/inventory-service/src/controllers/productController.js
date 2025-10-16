const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { validateMongoId } = require('../utils/validator');

const createProduct = asyncHandler(async (req, res) => {
  const product = new Product({ ...req.body, companyId: req.user.companyId });
  await product.save();
  res.status(201).json({ success: true, data: product });
});

const updateProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  validateMongoId(productId);
  const product = await Product.findOneAndUpdate(
    { _id: productId, companyId: req.user.companyId },
    { $set: req.body },
    { new: true }
  );
  if (!product) throw new Error('Product not found');
  res.json({ success: true, data: product });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  validateMongoId(productId);
  const product = await Product.findOneAndDelete({ _id: productId, companyId: req.user.companyId });
  if (!product) throw new Error('Product not found');
  res.json({ success: true, message: 'Product deleted' });
});

const getOldUnboughtProducts = asyncHandler(async (req, res) => {
  const { daysOld = 30 } = req.query;
  const products = await Product.getOldUnboughtProducts(req.user.companyId, parseInt(daysOld, 10));
  res.json({ success: true, data: products });
});

module.exports = { createProduct, updateProduct, deleteProduct, getOldUnboughtProducts };