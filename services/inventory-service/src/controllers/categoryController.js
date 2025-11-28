const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { validateMongoId } = require('../utils/validateMongoId');
const fs = require('fs');
const path = require('path');

const getAllCategories = asyncHandler(async (req, res) => {
  const { level, parentCategory, isActive, search, page = 1, limit = 50, companyId } = req.query;

  if (parentCategory) validateMongoId(parentCategory);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query
  const query = {};
  if (level) query.level = parseInt(level);
  if (parentCategory) query.parentCategory = parentCategory;
  if (companyId) query.companyId = companyId;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) {
    query.$text = { $search: search };
  }

  const categories = await Category.find(query)
    .populate('parentCategory', 'name slug level')
    .sort({ level: 1, sortOrder: 1, name: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Category.countDocuments(query);

  res.status(200).json({
    success: true,
    data: categories,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const category = await Category.findById(id)
    .populate('parentCategory', 'name slug level')
    .populate('subcategories');

  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Category not found'
    });
  }

  res.status(200).json({
    success: true,
    data: category
  });
});

const getCategoryBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const category = await Category.findOne({ slug })
    .populate('parentCategory', 'name slug level')
    .populate('subcategories');

  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Category not found'
    });
  }

  res.status(200).json({
    success: true,
    data: category
  });
});

const getCategoryTree = asyncHandler(async (req, res) => {
  const tree = await Category.getCategoryTree();

  res.status(200).json({
    success: true,
    data: tree
  });
});

const getLevel2Categories = asyncHandler(async (req, res) => {
  const { isActive, search, page = 1, limit = 50 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query for level 2 only
  const query = { level: 2 };
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) {
    query.$text = { $search: search };
  }

  const categories = await Category.find(query)
    .populate('parentCategory', 'name slug level')
    .sort({ sortOrder: 1, name: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Category.countDocuments(query);

  res.status(200).json({
    success: true,
    data: categories,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

const getLevel3Categories = asyncHandler(async (req, res) => {
  const { companyId, isActive, search, page = 1, limit = 50 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query for level 3 only
  const query = { level: 3 };
  if (companyId) query.companyId = companyId;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) {
    query.$text = { $search: search };
  }

  const categories = await Category.find(query)
    .populate('parentCategory', 'name slug level')
    .sort({ sortOrder: 1, name: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Category.countDocuments(query);

  res.status(200).json({
    success: true,
    data: categories,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});


const getCategoriesByIds = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids array is required in request body' });
  }

  // Validate all ids
  try {
    ids.forEach(id => validateMongoId(id));
  } catch (err) {
    return res.status(400).json({ success: false, message: 'One or more ids are invalid' });
  }

  const categories = await Category.find({ _id: { $in: ids } })
    .populate('parentCategory', 'name level')
    .sort({ level: 1, sortOrder: 1, name: 1 });

  res.status(200).json({ success: true, data: categories, count: categories.length });
});


const getLevel3CategoriesByCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId parameter is required' });
  }

  const categories = await Category.find({ level: 3, companyId, isActive: true }).sort({ sortOrder: 1, name: 1 });

  res.status(200).json({ success: true, data: categories, count: categories.length });
});

const getLevel3CategoriesByCompanyPaginated = asyncHandler(async (req, res) => {
  const { companyId } = req.params || req.query.companyId;
  const { isActive, search, page = 1, limit = 50 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId parameter is required' });
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query for level 3 categories scoped to company
  const query = { level: 3, companyId };
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) {
    query.$text = { $search: search };
  }

  const categories = await Category.find(query)
    .populate('parentCategory', 'name level')
    .sort({ sortOrder: 1, name: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Category.countDocuments(query);

  res.status(200).json({
    success: true,
    data: categories,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

const getCategoryPath = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const path = await Category.getCategoryPath(id);

  if (path.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Category not found'
    });
  }

  res.status(200).json({
    success: true,
    data: path
  });
});

const createCategory = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  // Basic hierarchical validations before creating to give clear errors
  const { level, parentCategory } = req.body;

  // If creating a level-3 category it must have a companyId
  if (parseInt(level) === 3 && !req.body.companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required for level 3 categories' });
  }

  // If parentCategory is provided, ensure it exists and has valid level
  if (parentCategory) {
    validateMongoId(parentCategory);
    const parent = await Category.findById(parentCategory);
    if (!parent) {
      return res.status(400).json({ success: false, message: 'Parent category not found' });
    }
    if (parent.level >= 3) {
      return res.status(400).json({ success: false, message: 'Cannot create subcategory under level 3 category' });
    }
    if (parseInt(level) !== parent.level + 1) {
      return res.status(400).json({ success: false, message: 'Invalid category level for given parent' });
    }
  }

  const newImage = req.body.images ? { url: req.body.images[0].url, alt: req.body.images[0].altText } : undefined;
  delete req.body.images;

  const category = new Category(req.body);
  if (newImage) {
    category.image = newImage;
  }
  await category.save();

  // Update parent category's subcategory count
  if (category.parentCategory) {
    validateMongoId(category.parentCategory);
    await Category.findByIdAndUpdate(
      category.parentCategory,
      { $inc: { 'statistics.totalSubcategories': 1 } }
    );
  }

  res.status(201).json({
    success: true,
    message: 'Category created successfully',
    data: category
  });
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const newImage = req.body.images ? { url: req.body.images[0].url, alt: req.body.images[0].altText } : undefined;
  delete req.body.images;

  if (newImage) {
    req.body.image = newImage;
  }

  // Fetch existing category to compute resulting hierarchy and safely validate
  const existing = await Category.findById(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  // Determine resulting values after update (fall back to existing)
  const resultingLevel = req.body.level !== undefined ? parseInt(req.body.level) : existing.level;
  const resultingParent = req.body.parentCategory !== undefined ? req.body.parentCategory : existing.parentCategory;
  const resultingCompanyId = req.body.companyId !== undefined ? req.body.companyId : existing.companyId;

  // If resulting level is 3, ensure companyId will be present
  // For level-3 categories require the caller to provide companyId and it must match the existing one
  if (resultingLevel === 3) {
    const providedCompanyId = req.body.companyId || req.query.companyId;
    if (!providedCompanyId) {
      return res.status(400).json({ success: false, message: 'companyId is required to modify level 3 categories' });
    }
    if (existing.companyId && providedCompanyId !== existing.companyId) {
      return res.status(403).json({ success: false, message: 'companyId does not match this category' });
    }
    // ensure request uses the correct companyId
    req.body.companyId = existing.companyId || providedCompanyId;
  }

  // If parentCategory is being set/changed, validate it and ensure hierarchy rules
  if (resultingParent) {
    validateMongoId(resultingParent);
    const parent = await Category.findById(resultingParent);
    if (!parent) {
      return res.status(400).json({ success: false, message: 'Parent category not found' });
    }
    if (parent.level >= 3) {
      return res.status(400).json({ success: false, message: 'Cannot set parent under level 3 category' });
    }
    if (resultingLevel !== parent.level + 1) {
      return res.status(400).json({ success: false, message: 'Invalid resulting level for given parent' });
    }
  } else if (resultingLevel !== 1 && !resultingParent) {
    // If not providing parent but level isn't root, that's invalid
    return res.status(400).json({ success: false, message: 'Non-root categories must have a parentCategory' });
  }

  // Perform update
  const category = await Category.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('parentCategory', 'name slug level');

  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  // If parent changed, update parent's statistics (decrement old, increment new)
  const oldParentId = existing.parentCategory ? existing.parentCategory.toString() : null;
  const newParentId = category.parentCategory ? category.parentCategory.toString() : null;

  if (oldParentId && oldParentId !== newParentId) {
    try {
      await Category.findByIdAndUpdate(oldParentId, { $inc: { 'statistics.totalSubcategories': -1 } });
    } catch (e) {
      // log but don't fail the request
      console.error('Failed to decrement old parent subcategory count', e);
    }
  }

  if (newParentId && oldParentId !== newParentId) {
    try {
      await Category.findByIdAndUpdate(newParentId, { $inc: { 'statistics.totalSubcategories': 1 } });
    } catch (e) {
      console.error('Failed to increment new parent subcategory count', e);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Category updated successfully',
    data: category
  });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  // Check if category has subcategories
  const subcategoriesCount = await Category.countDocuments({ parentCategory: id });
  if (subcategoriesCount > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete category with subcategories'
    });
  }

  // Check if category has products - products now only reference one category field (level 3)
  const productsCount = await Product.countDocuments({
    category: id
  });

  if (productsCount > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete category with products'
    });
  }

  const category = await Category.findById(id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Category not found'
    });
  }

  // If deleting a level-3 category, require companyId param (in query or body) and validate it matches


  // Delete image file if exists
  if (category.image && category.image.url && category.image.url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '..', category.image.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  await Category.findByIdAndDelete(id);

  // Update parent category's subcategory count
  if (category.parentCategory) {
    validateMongoId(category.parentCategory);
    await Category.findByIdAndUpdate(
      category.parentCategory,
      { $inc: { 'statistics.totalSubcategories': -1 } }
    );
  }

  res.status(200).json({
    success: true,
    message: 'Category deleted successfully'
  });
});

const toggleActiveStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const category = await Category.findById(id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Category not found'
    });
  }

  category.isActive = !category.isActive;
  await category.save();

  res.status(200).json({
    success: true,
    message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
    data: category
  });
});

const createLevel3Category = asyncHandler(async (req, res) => {
  const { companyId } = req.params || req.query.companyId;
  const { name, parentCategory, description, attributes } = req.body;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId parameter is required' });
  }

  // Check validation errors from express-validator
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  // Validate parentCategory is provided and is level 2
  if (!parentCategory) {
    return res.status(400).json({ success: false, message: 'parentCategory is required for level 3 categories' });
  }

  validateMongoId(parentCategory);
  const parent = await Category.findById(parentCategory);
  if (!parent) {
    return res.status(404).json({ success: false, message: 'Parent category not found' });
  }
  if (parent.level !== 2) {
    return res.status(400).json({ success: false, message: 'Parent category must be level 2' });
  }

  // Extract image if provided
  const newImage = req.body.images ? { url: req.body.images[0].url, alt: req.body.images[0].altText } : undefined;

  // Create level 3 category with companyId from body (already validated)
  const category = new Category({
    name,
    parentCategory,
    description,

    attributes,
    level: 3,
    companyId: companyId,
    image: newImage
  });

  await category.save();

  // Update parent category's subcategory count
  await Category.findByIdAndUpdate(
    parentCategory,
    { $inc: { 'statistics.totalSubcategories': 1 } }
  );

  res.status(201).json({
    success: true,
    message: 'Level 3 category created successfully',
    data: category
  });
});

module.exports = {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryTree,
  getLevel2Categories,
  getLevel3Categories,
  getLevel3CategoriesByCompany,
  getLevel3CategoriesByCompanyPaginated,
  getCategoryPath,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleActiveStatus,
  createLevel3Category,
  getCategoriesByIds
};