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
    categoryId: id
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

  // Soft-delete the category to preserve data history
  await Category.updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });

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
    message: 'Category soft-deleted successfully'
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

const seedCategories = asyncHandler(async (req, res) => {
  // Public seed endpoint — intentionally simple and idempotent.

  // Try multiple candidate locations to load the JSON files (covers different run contexts)
  let parentsData = [];
  let subsData = [];
  const tried = [];
  const errors = [];

  const candidates = [
    path.join(__dirname, '..', 'data'),
    path.join(__dirname, '..', '..', 'shared', 'bodies', 'categories'),
    path.resolve(process.cwd(), 'services', 'inventory-service', 'shared', 'bodies', 'categories'),
    path.resolve(process.cwd(), 'invexis_backend', 'services', 'inventory-service', 'shared', 'bodies', 'categories'),
    path.resolve(process.cwd(), 'services', 'inventory-service', 'shared', 'bodies'),
  ];

  const tryLoad = (basePath, fileName) => {
    const p = path.join(basePath, fileName);
    tried.push(p);
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      errors.push({ path: p, message: err.message });
    }
    return null;
  };

  for (const base of candidates) {
    if (!parentsData) parentsData = [];
    if (!subsData) subsData = [];
    if (!parentsData.length) {
      const loaded = tryLoad(base, 'parentategories.json');
      if (Array.isArray(loaded) && loaded.length) parentsData = loaded;
    }
    if (!subsData.length) {
      const loaded = tryLoad(base, 'subCategory.json');
      if (Array.isArray(loaded) && loaded.length) subsData = loaded;
    }
    if (parentsData.length && subsData.length) break;
  }

  if (!Array.isArray(parentsData)) parentsData = [];
  if (!Array.isArray(subsData)) subsData = [];

  if (!parentsData.length && !subsData.length) {
    return res.status(500).json({ success: false, message: 'Category source files not found or empty', tried, errors, debug: { parentsCount: parentsData.length, subsCount: subsData.length } });
  }

  // Delete ALL categories and drop the collection to clear all indexes
  // This ensures no E11000 duplicate key errors on the unique slug index
  // WARNING: this will remove all level 1/2/3 categories and may orphan product references.
  let deletedAllCount = 0;
  try {
    const existingCount = await Category.countDocuments({});
    if (existingCount > 0) {
      // Soft-delete all categories instead of dropping data
      const delResult = await Category.updateMany({}, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });
      deletedAllCount = delResult.modifiedCount || 0;
    }
    // Drop the entire collection to remove all indexes (including unique slug index)
    // Then mongoose will recreate indexes on first insert
    await Category.collection.drop();
  } catch (dropErr) {
    // Collection may not exist yet, continue anyway
    console.log('Drop collection info:', dropErr.message);
  }

  // Debug info for troubleshooting: include lengths and sample names
  const parentSample = Array.isArray(parentsData) ? parentsData.slice(0, 5).map(p => p.name || '') : [];
  const subSample = Array.isArray(subsData) ? subsData.slice(0, 5).map(s => s.name || '') : [];

  const slugify = (name) => {
    return name
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Ensure slug is unique by appending numeric suffix if needed
  const ensureUniqueSlug = async (baseSlug) => {
    let candidate = baseSlug;
    let i = 1;
    while (true) {
      const found = await Category.findOne({ slug: candidate });
      if (!found) return candidate;
      candidate = `${baseSlug}-${i}`;
      i += 1;
    }
  };

  const summary = {
    parentsInserted: 0,
    parentsSkipped: 0,
    subsInserted: 0,
    subsSkipped: 0,
    missingParents: [],
    deletedAll: 0,
  };

  // map parent name (lowercase) -> ObjectId
  const parentMap = {};

  // Insert or map level-1 parents
  for (const p of parentsData) {
    const name = (p.name || '').trim();
    if (!name) continue;
    const baseSlug = slugify(name);
    const slug = await ensureUniqueSlug(baseSlug);
    let existing = await Category.findOne({ slug, level: 1 });
    if (existing) {
      parentMap[name.toLowerCase()] = existing._id;
      summary.parentsSkipped++;
      continue;
    }

    const newParent = new Category({
      name,
      slug,
      description: p.description || '',
      level: 1,
      parentCategory: null,
      isActive: typeof p.isActive === 'boolean' ? p.isActive : true,
      sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : 0,
      image: p.image || {},
      seo: p.seo || {},
      statistics: p.statistics || { totalProducts: 0, totalSubcategories: 0 },
      attributes: p.attributes || []
    });

    await newParent.save();
    parentMap[name.toLowerCase()] = newParent._id;
    summary.parentsInserted++;
  }

  // Insert level-2 subcategories under parents
  for (const s of subsData) {
    const name = (s.name || '').trim();
    const parentName = (s.parentCategoryName || '').trim();
    if (!name || !parentName) continue;
    const parentKey = parentName.toLowerCase();
    let parentId = parentMap[parentKey];
    if (!parentId) {
      // try to find parent by slug as fallback
      const parentSlug = slugify(parentName);
      const parentDoc = await Category.findOne({ slug: parentSlug, level: 1 });
      if (parentDoc) parentId = parentDoc._id;
    }

    if (!parentId) {
      summary.missingParents.push(parentName);
      continue;
    }

    const baseSlug = slugify(name);
    // For level-2 categories, include parent name in slug to ensure global uniqueness
    // e.g., "clothing-watches" vs "jewelry-watches"
    const parentSlugPart = slugify(parentName);
    const level2BaseSlug = `${parentSlugPart}-${baseSlug}`;
    const slug = await ensureUniqueSlug(level2BaseSlug);
    
    const existingSub = await Category.findOne({ slug, parentCategory: parentId, level: 2 });
    if (existingSub) {
      summary.subsSkipped++;
      continue;
    }

    // Auto-generate missing fields for level-2 categories
    const generatedDescription = s.description || `${name} — products and items categorized under ${parentName}`;
    const generatedSeo = s.seo || {
      metaTitle: `${name} | ${parentName}`,
      metaDescription: `${generatedDescription}`,
      keywords: [slugify(parentName), slugify(name)]
    };
    const generatedImage = s.image || { url: '', alt: name };
    const generatedAttributes = Array.isArray(s.attributes) ? s.attributes : [];
    const generatedStatistics = s.statistics || { totalProducts: 0, totalSubcategories: 0 };

    const newSub = new Category({
      name,
      slug,
      description: generatedDescription,
      level: 2,
      parentCategory: parentId,
      isActive: typeof s.isActive === 'boolean' ? s.isActive : true,
      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : (s.sortOrder || 0),
      image: generatedImage,
      seo: generatedSeo,
      attributes: generatedAttributes,
      statistics: generatedStatistics
    });

    await newSub.save();
    summary.subsInserted++;
  }

  // Recompute and update parent statistics.totalSubcategories
  for (const [nameLower, id] of Object.entries(parentMap)) {
    const count = await Category.countDocuments({ parentCategory: id });
    await Category.findByIdAndUpdate(id, { 'statistics.totalSubcategories': count });
  }

  // include deleted count in summary
  summary.deletedAll = typeof deletedAllCount === 'number' ? deletedAllCount : 0;

  res.status(200).json({ success: true, summary, debug: { parentsCount: parentsData.length, subsCount: subsData.length, parentSample, subSample } });
});

/**
 * @desc    Get Level 3 category with parent Level 2 category hierarchy
 * @route   GET /api/v1/categories/level3/:categoryId
 * @access  Public
 */
const getLevel3CategoryWithParent = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  
  // Validate input
  validateMongoId(categoryId);
  
  // Get the Level 3 category
  const level3Category = await Category.findById(categoryId);
  
  if (!level3Category) {
    return res.status(404).json({
      success: false,
      message: 'Level 3 category not found'
    });
  }
  
  // Verify it's actually a Level 3 category
  if (level3Category.level !== 3) {
    return res.status(400).json({
      success: false,
      message: `Invalid category level. Expected level 3, got level ${level3Category.level}`
    });
  }
  
  // Get the parent Level 2 category
  let level2Category = null;
  let level1Category = null;
  
  if (level3Category.parentCategory) {
    level2Category = await Category.findById(level3Category.parentCategory)
      .select('_id name slug level description image sortOrder parentCategory');
    
    // Get the Level 2's parent (Level 1)
    if (level2Category && level2Category.parentCategory) {
      level1Category = await Category.findById(level2Category.parentCategory)
        .select('_id name slug level description image sortOrder');
    }
  }
  
  // Get statistics for the Level 3 category (product count, etc.)
  const productCount = await Product.countDocuments({
    category: categoryId,
    isDeleted: false
  });
  
  // Format response with hierarchy
  const response = {
    success: true,
    data: {
      level3: {
        _id: level3Category._id,
        name: level3Category.name,
        slug: level3Category.slug,
        level: level3Category.level,
        description: level3Category.description,
        image: level3Category.image,
        attributes: level3Category.attributes,
        seo: level3Category.seo,
        isActive: level3Category.isActive,
        companyId: level3Category.companyId,
        sortOrder: level3Category.sortOrder,
        statistics: {
          ...level3Category.statistics,
          totalProducts: productCount
        }
      },
      level2Parent: level2Category ? {
        _id: level2Category._id,
        name: level2Category.name,
        slug: level2Category.slug,
        level: level2Category.level,
        description: level2Category.description,
        image: level2Category.image,
        sortOrder: level2Category.sortOrder
      } : null,
      level1GrandParent: level1Category ? {
        _id: level1Category._id,
        name: level1Category.name,
        slug: level1Category.slug,
        level: level1Category.level,
        description: level1Category.description,
        image: level1Category.image,
        sortOrder: level1Category.sortOrder
      } : null,
      hierarchy: {
        breadcrumb: [
          level1Category && { id: level1Category._id, name: level1Category.name, slug: level1Category.slug },
          level2Category && { id: level2Category._id, name: level2Category.name, slug: level2Category.slug },
          { id: level3Category._id, name: level3Category.name, slug: level3Category.slug }
        ].filter(Boolean)
      }
    }
  };
  
  res.status(200).json(response);
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
  getLevel3CategoryWithParent,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleActiveStatus,
  seedCategories,
  createLevel3Category,
  getCategoriesByIds
};