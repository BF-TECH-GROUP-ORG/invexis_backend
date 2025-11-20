const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { validateMongoId } = require('../utils/validateMongoId');
const fs = require('fs');
const path = require('path');

const getAllProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sort = '-createdAt',
    status,
    visibility,
    category,
    subcategory,
    subSubcategory,
    brand,
    featured,
    search,
    minPrice,
    maxPrice,
    inStock,
    companyId
  } = req.query;

  if (companyId) validateMongoId(companyId);
  if (category) validateMongoId(category);
  if (subcategory) validateMongoId(subcategory);
  if (subSubcategory) validateMongoId(subSubcategory);

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query
  const query = {};
  if (companyId) query.companyId = companyId;
  if (status) query.status = status;
  if (visibility) query.visibility = visibility;
  if (category) query.category = category;
  if (subcategory) query.subcategory = subcategory;
  if (subSubcategory) query.subSubcategory = subSubcategory;
  if (brand) query.brand = new RegExp(brand, 'i');
  if (featured !== undefined) query.featured = featured === 'true';
  if (inStock === 'true') query['inventory.quantity'] = { $gt: 0 };
  if (search) {
    query.$text = { $search: search };
  }
  if (minPrice || maxPrice) {
    query['pricing.basePrice'] = {};
    if (minPrice) query['pricing.basePrice'].$gte = parseFloat(minPrice);
    if (maxPrice) query['pricing.basePrice'].$lte = parseFloat(maxPrice);
  }

  const products = await Product.find(query)
    .populate('category', 'name slug level')
    .populate('subcategory', 'name slug level')
    .populate('subSubcategory', 'name slug level')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .select('-auditTrail'); // Exclude audit trail for performance

  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    data: products,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const product = await Product.findById(id)
    .populate('category', 'name slug level attributes')
    .populate('subcategory', 'name slug level attributes')
    .populate('subSubcategory', 'name slug level attributes');

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  res.status(200).json({
    success: true,
    data: product
  });
});

const getProductBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const product = await Product.findOne({ slug })
    .populate('category', 'name slug level attributes')
    .populate('subcategory', 'name slug level attributes')
    .populate('subSubcategory', 'name slug level attributes');

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  res.status(200).json({
    success: true,
    data: product
  });
});

const getProductsByCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  validateMongoId(categoryId);

  const { includeSubcategories = false, page = 1, limit = 20, sort = '-createdAt' } = req.query;

  const pageInt = parseInt(page);
  const limitInt = parseInt(limit);

  // Fetch all products (query returns a Mongoose array)
  let products = await Product.getProductsByCategory(categoryId, includeSubcategories === 'true');

  // Optional: sort manually if needed
  if (sort) {
    const sortField = sort.replace('-', '');
    const desc = sort.startsWith('-');
    products.sort((a, b) => {
      if (a[sortField] < b[sortField]) return desc ? 1 : -1;
      if (a[sortField] > b[sortField]) return desc ? -1 : 1;
      return 0;
    });
  }

  const total = products.length;
  const startIndex = (pageInt - 1) * limitInt;
  const endIndex = startIndex + limitInt;

  const paginatedProducts = products.slice(startIndex, endIndex);

  res.status(200).json({
    success: true,
    data: paginatedProducts,
    pagination: {
      page: pageInt,
      limit: limitInt,
      total,
      pages: Math.ceil(total / limitInt)
    }
  });
});



const createProduct = asyncHandler(async (req, res) => {
  // Check validation errors (for bulk, we'll validate each individually)
  if (!Array.isArray(req.body)) {
    // For single, validate as before
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
  }

  let productsData;
  if (Array.isArray(req.body)) {
    productsData = req.body;
  } else {
    productsData = [req.body];
  }

  const createdProducts = [];
  const failedProducts = [];

  for (let productData of productsData) {
    try {
      // Individual validation for bulk items
      const itemErrors = validationResult({ body: productData });
      if (!itemErrors.isEmpty()) {
        failedProducts.push({
          data: productData.name || 'Unknown',
          errors: itemErrors.array()
        });
        continue;
      }

      const newImages = productData.images || [];
      const newVideos = productData.videos || [];
      delete productData.images;
      delete productData.videos;

      const product = new Product(productData);

      // Add audit trail entry
      product.auditTrail.push({
        action: 'create',
        changedBy: req.user?.id || 'system',
        newValue: productData
      });

      product.images = newImages.map((img, index) => ({
        url: img.url,
        alt: img.altText,
        isPrimary: index === 0,
        sortOrder: index
      }));

      product.videoUrls = newVideos.map(v => v.url);

      await product.save();

      createdProducts.push(product);

      // Update category product counts
      if (product.category) {
        validateMongoId(product.category);
        await Category.findByIdAndUpdate(
          product.category,
          { $inc: { 'statistics.totalProducts': 1 } }
        );
      }
    } catch (error) {
      failedProducts.push({
        data: productData.name || 'Unknown',
        error: error.message
      });
    }
  }

  const response = {
    success: createdProducts.length > 0,
    message: `Successfully created ${createdProducts.length} products${failedProducts.length > 0 ? `, ${failedProducts.length} failed` : ''}`,
    data: {
      created: createdProducts,
      failed: failedProducts
    }
  };

  res.status(createdProducts.length > 0 ? 201 : 400).json(response);
});



const updateProduct = asyncHandler(async (req, res) => {
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

  const newImages = req.body.images || [];
  const newVideos = req.body.videos || [];
  delete req.body.images;
  delete req.body.videos;

  const oldProduct = await Product.findById(id);
  if (!oldProduct) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  let updatedImages = oldProduct.images || [];
  updatedImages = [...updatedImages, ...newImages.map((img, index) => ({
    url: img.url,
    alt: img.altText,
    isPrimary: updatedImages.length === 0 && index === 0,
    sortOrder: updatedImages.length + index
  }))];

  let updatedVideoUrls = oldProduct.videoUrls || [];
  updatedVideoUrls = [...updatedVideoUrls, ...newVideos.map(v => v.url)];

  req.body.images = updatedImages;
  req.body.videoUrls = updatedVideoUrls;

  const product = await Product.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('category subcategory subSubcategory');

  // Add audit trail entry
  product.auditTrail.push({
    action: 'update',
    changedBy: req.user?.id || 'system',
    oldValue: oldProduct.toObject(),
    newValue: req.body
  });

  await product.save();

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: product
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Delete associated files
  product.images.forEach(img => {
    if (img.url && img.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', img.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  product.videoUrls.forEach(url => {
    if (url && url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  product.variations.forEach(variation => {
    variation.images.forEach(img => {
      if (img.url && img.url.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, '..', img.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });
  });

  // Add audit trail entry before deletion
  product.auditTrail.push({
    action: 'delete',
    changedBy: req.user?.id || 'system',
    oldValue: product.toObject()
  });

  await product.save();
  await Product.findByIdAndDelete(id);

  // Update category product count
  if (product.category) {
    validateMongoId(product.category);
    await Category.findByIdAndUpdate(
      product.category,
      { $inc: { 'statistics.totalProducts': -1 } }
    );
  }

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully'
  });
});

const updateInventory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const { quantity, operation = 'set', warehouseId, variationId, reason } = req.body;

  const product = await Product.findById(id);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  let oldQuantity;
  let targetPath = 'inventory.quantity'; // Default
  if (variationId) {
    const variation = product.variations.id(variationId); // Use Mongoose id() for subdoc
    if (!variation) {
      return res.status(404).json({ success: false, message: 'Variation not found' });
    }
    oldQuantity = variation.stockQty;
    targetPath = `variations.${variationId}.stockQty`;
  } else {
    oldQuantity = product.inventory.quantity;
  }

  let newQuantity;
  switch (operation) {
    case 'increment':
      newQuantity = oldQuantity + quantity;
      break;
    case 'decrement':
      newQuantity = Math.max(0, oldQuantity - quantity);
      break;
    case 'set':
    default:
      newQuantity = Math.max(0, quantity);
  }

  if (newQuantity < 0) {
    return res.status(400).json({ success: false, message: 'You do not have enough products in stock' });
  }

  // Handle perWarehouse if warehouseId provided
  let warehouseUpdate = null;
  if (warehouseId) {
    validateMongoId(warehouseId);
    const warehouseEntry = product.inventory.perWarehouse.find(wh => wh.warehouseId.equals(warehouseId));
    if (warehouseEntry) {
      warehouseEntry.quantity = newQuantity; // Update existing
    } else {
      product.inventory.perWarehouse.push({
        warehouseId,
        quantity: newQuantity,
        lowStockThreshold: product.inventory.lowStockThreshold
      });
    }
    warehouseUpdate = true;
  }

  const StockChange = require('../models/StockChange');
  const stockChange = new StockChange({
    companyId: product.companyId,
    productId: id,
    variationId,
    warehouseId,
    changeType: operation === 'decrement' ? 'sale' : (operation === 'increment' ? 'restock' : 'adjustment'),
    quantity: operation === 'decrement' ? -quantity : quantity,
    previousStock: oldQuantity,
    newStock: newQuantity,
    reason: reason || `Manual ${operation} update`,
    userId: req.user?.id || 'system'
  });
  await stockChange.save();

  // Update main quantity if not warehouse-specific (or aggregate if warehouse)
  if (!warehouseId) {
    product.inventory.quantity = newQuantity;
  } else if (warehouseUpdate) {
    // Re-aggregate main quantity
    product.inventory.quantity = product.inventory.perWarehouse.reduce((total, wh) => total + wh.quantity, 0);
  }

  // Update availability based on total
  product.availability = product.inventory.quantity > 0 ? 'in_stock' : 'out_of_stock';

  // Add audit trail
  product.auditTrail.push({
    action: 'stock_change',
    changedBy: req.user?.id || 'system',
    oldValue: { quantity: oldQuantity },
    newValue: { quantity: newQuantity, operation }
  });

  await product.save();

  // Trigger alert if low (use total quantity)
  if (product.inventory.quantity <= product.inventory.lowStockThreshold && operation === 'decrement') {
    const Alert = require('../models/Alert');
    const alert = new Alert({
      companyId: product.companyId,
      type: 'low_stock',
      productId: id,
      threshold: product.inventory.lowStockThreshold,
      message: `Stock for product ${product.name} is low: ${product.inventory.quantity}`
    });
    await alert.save();
  }

  res.status(200).json({
    success: true,
    message: 'Inventory updated successfully',
    data: {
      id: product._id,
      oldQuantity,
      newQuantity: product.inventory.quantity, // Use aggregated total
      stockStatus: product.stockStatus
    }
  });
});

const getLowStockProducts = asyncHandler(async (req, res) => {
  const { companyId, threshold = 10 } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'Company ID is required'
    });
  }

  // validateMongoId(companyId);

  const products = await Product.getLowStockProducts(companyId, parseInt(threshold));

  res.status(200).json({
    success: true,
    data: products,
    count: products.length
  });
});

const getScheduledProducts = asyncHandler(async (req, res) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'Company ID is required'
    });
  }

  // validateMongoId(companyId);

  const products = await Product.getScheduledProducts(companyId);

  res.status(200).json({
    success: true,
    data: products,
    count: products.length
  });
});

const getFeaturedProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, companyId } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (companyId) validateMongoId(companyId);
  if (category) validateMongoId(category);

  const query = { 
    featured: true, 
    status: 'active', 
    visibility: 'public' 
  };
  
  if (category) query.category = category;
  if (companyId) query.companyId = companyId;

  const products = await Product.find(query)
    .populate('category', 'name slug')
    .sort({ sortOrder: 1, 'reviewSummary.averageRating': -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    data: products,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

const searchProducts = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20, sort = '-createdAt', category, minPrice, maxPrice } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Search query must be at least 2 characters long'
    });
  }

  if (category) validateMongoId(category);

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {
    $text: { $search: q },
    status: 'active',
    visibility: 'public'
  };

  if (category) query.category = category;
  if (minPrice || maxPrice) {
    query['pricing.basePrice'] = {};
    if (minPrice) query['pricing.basePrice'].$gte = parseFloat(minPrice);
    if (maxPrice) query['pricing.basePrice'].$lte = parseFloat(maxPrice);
  }

  const products = await Product.find(query, { score: { $meta: 'textScore' } })
    .populate('category', 'name slug')
    .sort(sort === 'relevance' ? { score: { $meta: 'textScore' } } : sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    data: products,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    },
    searchQuery: q
  });
});

const getOldUnboughtProducts = asyncHandler(async (req, res) => {
  const { companyId, daysOld = 30 } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'Company ID is required' });
  }
  // validateMongoId(companyId);

  const products = await Product.getOldUnboughtProducts(companyId, parseInt(daysOld));

  res.status(200).json({ success: true, data: products, count: products.length });
});

module.exports = {
  getAllProducts,
  getProductById,
  getProductBySlug,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  updateInventory,
  getLowStockProducts,
  getScheduledProducts,
  getFeaturedProducts,
  searchProducts,
  getOldUnboughtProducts
};