const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');
const { validateMongoId } = require('../utils/validator');

const createCategory = asyncHandler(async (req, res) => {
  const category = new Category({ ...req.body, companyId: req.user.companyId });
  await category.save();
  res.status(201).json({ success: true, data: category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  validateMongoId(categoryId);
  const category = await Category.findOneAndUpdate(
    { _id: categoryId, companyId: req.user.companyId },
    { $set: req.body },
    { new: true }
  );
  if (!category) throw new Error('Category not found');
  res.json({ success: true, data: category });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  validateMongoId(categoryId);
  const category = await Category.findOneAndDelete({ _id: categoryId, companyId: req.user.companyId });
  if (!category) throw new Error('Category not found');
  res.json({ success: true, message: 'Category deleted' });
});

const getCategoryTree = asyncHandler(async (req, res) => {
  const tree = await Category.getCategoryTree(req.user.companyId);
  res.json({ success: true, data: tree });
});

module.exports = { createCategory, updateCategory, deleteCategory, getCategoryTree };