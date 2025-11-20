const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { validateMongoId } = require('../utils/validateMongoId');
const fs = require('fs');
const path = require('path');

const getAllCategories = asyncHandler(async (req, res) => {
  const { level, parentCategory, isActive, search, page = 1, limit = 50 } = req.query;

  if (parentCategory) validateMongoId(parentCategory);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query
  const query = {};
  if (level) query.level = parseInt(level);
  if (parentCategory) query.parentCategory = parentCategory;
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

  let categoriesData;
  
  // Handle both single object and array
  if (Array.isArray(req.body)) {
    categoriesData = req.body;
  } else {
    categoriesData = [req.body];
  }

  const createdCategories = [];
  const failedCategories = [];

  // Process each category
  for (let categoryData of categoriesData) {
    try {
      // Handle image field (already provided in correct format)
      const category = new Category(categoryData);
      await category.save();
      createdCategories.push(category);

      // Update parent category's subcategory count
      if (category.parentCategory) {
        validateMongoId(category.parentCategory);
        await Category.findByIdAndUpdate(
          category.parentCategory,
          { $inc: { 'statistics.totalSubcategories': 1 } }
        );
      }
    } catch (error) {
      failedCategories.push({
        data: categoryData.name || 'Unknown',
        error: error.message
      });
    }
  }

  const response = {
    success: createdCategories.length > 0,
    message: `Successfully created ${createdCategories.length} categories${failedCategories.length > 0 ? `, ${failedCategories.length} failed` : ''}`,
    data: {
      created: createdCategories,
      failed: failedCategories
    }
  };

  res.status(createdCategories.length > 0 ? 201 : 400).json(response);
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

  const category = await Category.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('parentCategory', 'name slug level');

  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Category not found'
    });
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

  // Check if category has products
  const productsCount = await Product.countDocuments({ 
    $or: [
      { category: id },
      { subcategory: id },
      { subSubcategory: id }
    ]
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

module.exports = {
  getAllCategories,
  getCategoryById,
  getCategoryBySlug,
  getCategoryTree,
  getCategoryPath,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleActiveStatus
};