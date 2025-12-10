const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { validateMongoId } = require('../utils/validateMongoId');
const fs = require('fs');
const path = require('path');
const { publishProductEvent } = require('../events/productEvents');
const { scanDel, setCache, getCache, delCache } = require('../utils/redisHelper');
const logger = require('../utils/logger');

const getAllProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sort = '-createdAt',
    status,
    visibility,
    category,
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

  // Generate cache key based on query params
  const cacheKey = `products:${JSON.stringify(req.query)}`;
  const cachedData = await getCache(cacheKey);

  if (cachedData) {
    return res.status(200).json(cachedData);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build query
  const query = {};
  if (companyId) query.companyId = companyId;
  if (status) query.status = status;
  if (visibility) query.visibility = visibility;
  if (category) query.category = category;
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

  // Use lean() for read-only queries (much faster - returns plain JS objects, not Mongoose documents)
  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name slug level')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-auditTrail')
      .lean()
      .exec(),
    Product.countDocuments(query)
  ]);

  const responseData = {
    success: true,
    data: products,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  };

  // Cache for 5 minutes (fire-and-forget)
  setImmediate(() => {
    setCache(cacheKey, responseData, 300)
      .catch((err) => logger.error('Cache set failed:', err));
  });

  res.status(200).json(responseData);
});

const getProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  const cacheKey = `product:${id}`;
  const cachedProduct = await getCache(cacheKey);

  if (cachedProduct) {
    return res.status(200).json({
      success: true,
      data: cachedProduct
    });
  }

  // Use lean for read-only queries
  const product = await Product.findById(id)
    .populate('category', 'name slug level attributes')
    .lean()
    .exec();

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Cache asynchronously (non-blocking)
  setImmediate(() => {
    setCache(cacheKey, product, 3600)
      .catch((err) => logger.error('Cache set failed:', err));
  });

  res.status(200).json({
    success: true,
    data: product
  });
});

const getProductBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const cacheKey = `product:slug:${slug}`;
  const cachedProduct = await getCache(cacheKey);

  if (cachedProduct) {
    return res.status(200).json({
      success: true,
      data: cachedProduct
    });
  }

  const product = await Product.findOne({ slug })
    .populate('category', 'name slug level attributes');

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  await setCache(cacheKey, product, 3600);

  res.status(200).json({
    success: true,
    data: product
  });
});

const getProductsByCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  validateMongoId(categoryId);

  const { includeSubcategories = false, page = 1, limit = 20, sort = '-createdAt' } = req.query;

  const cacheKey = `products:category:${categoryId}:${JSON.stringify(req.query)}`;
  const cachedData = await getCache(cacheKey);

  if (cachedData) {
    return res.status(200).json(cachedData);
  }

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

  const responseData = {
    success: true,
    data: paginatedProducts,
    pagination: {
      page: pageInt,
      limit: limitInt,
      total,
      pages: Math.ceil(total / limitInt)
    }
  };

  await setCache(cacheKey, responseData, 300);

  res.status(200).json(responseData);
});

const createProduct = asyncHandler(async (req, res) => {
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

  // NOTE: sku, asin, upc, barcode, qrCode, scanId, browseNodeId are auto-generated by Product model pre-save middleware.
  const product = new Product(req.body);

  // Process images
  product.images = newImages.map((img, index) => ({
    url: img.url,
    cloudinary_id: img.cloudinary_id,
    type: img.type || 'image',
    format: img.format,
    size: img.size,
    altText: img.altText || img.alt,
    isPrimary: img.isPrimary || (index === 0),
    sortOrder: img.sortOrder !== undefined ? img.sortOrder : index
  }));

  product.videoUrls = newVideos.map(v => v.url);

  // Add audit trail
  product.auditTrail.push({
    action: 'create',
    changedBy: req.user?.id || 'system',
    newValue: req.body
  });

  // Save product (this triggers pre-save middleware for auto-generation)
  await product.save();

  // Return response immediately - do not wait for side effects
  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: product
  });

  // ========== BACKGROUND TASKS (non-blocking) ==========
  // These run after the response is sent to client

  // 1. Generate and upload QR/Barcode images (async, non-critical)
  // Uses full product payload (base64-encoded) stored in product.qrPayload and product.barcodePayload
  if (process.nextTick) {
    setImmediate(async () => {
      try {
        const { generateQRCodeBuffer, generateBarcodeBuffer } = require('../utils/imageGenerator');
        const { uploadBuffer } = require('../utils/uploadUtil');

        // Use the full encoded product payload from the model (contains complete product data as base64)
        const qrPayload = product.qrPayload || product.qrCode;
        const barcodePayload = product.barcodePayload || product.barcode;

        const [qrBuffer, barcodeBuffer] = await Promise.all([
          generateQRCodeBuffer(qrPayload),
          generateBarcodeBuffer(barcodePayload)
        ]);

        const [qrUpload, barcodeUpload] = await Promise.all([
          uploadBuffer(qrBuffer, `QrBar_Codes/${product._id}`, 'qrcode'),
          uploadBuffer(barcodeBuffer, `QrBar_Codes/${product._id}`, 'barcode')
        ]); 

        // Update product with URLs
        await Product.updateOne(
          { _id: product._id },
          {
            qrCodeUrl: qrUpload.secure_url,
            barcodeUrl: barcodeUpload.secure_url
          }
        );
      } catch (err) {
        logger.error('Background: Failed to generate QR/barcode images:', err);
      }
    });
  }

  // 2. Update category stats (fire-and-forget)
  if (product.category) {
    setImmediate(() => {
      Category.updateOne(
        { _id: product.category },
        { $inc: { 'statistics.totalProducts': 1 } }
      ).catch((err) => logger.error('Background: Category update failed:', err));
    });
  }

  // 3. Invalidate caches asynchronously
  setImmediate(() => {
    scanDel('products:*').catch((err) => logger.error('Background: Cache invalidation failed:', err));
  });

  // 4. Emit event asynchronously
  setImmediate(() => {
    publishProductEvent('inventory.product.created', product.toObject())
      .catch((err) => logger.error('Background: Event publish failed:', err));
  });
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

  // Use lean + findById for fast read (no need for full Mongoose document)
  const oldProduct = await Product.findById(id).lean();
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
  ).populate('category');

  // Add audit trail entry
  product.auditTrail.push({
    action: 'update',
    changedBy: req.user?.id || 'system',
    oldValue: oldProduct,
    newValue: req.body
  });

  await product.save();

  // Send response immediately
  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: product
  });

  // ========== BACKGROUND TASKS ==========

  // 1. Regenerate QR/Barcode images if product data changed (async, non-critical)
  setImmediate(async () => {
    try {
      const { generateQRCodeBuffer, generateBarcodeBuffer } = require('../utils/imageGenerator');
      const { uploadBuffer } = require('../utils/uploadUtil');

      // Use the updated full encoded product payload from the model
      const qrPayload = product.qrPayload || product.qrCode;
      const barcodePayload = product.barcodePayload || product.barcode;

      const [qrBuffer, barcodeBuffer] = await Promise.all([
        generateQRCodeBuffer(qrPayload),
        generateBarcodeBuffer(barcodePayload)
      ]);

      const [qrUpload, barcodeUpload] = await Promise.all([
        uploadBuffer(qrBuffer, `QrBar_Codes/${product._id}`, 'qrcode'),
        uploadBuffer(barcodeBuffer, `QrBar_Codes/${product._id}`, 'barcode')
      ]);

      // Update product with new URLs
      await Product.updateOne(
        { _id: product._id },
        {
          qrCodeUrl: qrUpload.secure_url,
          barcodeUrl: barcodeUpload.secure_url
        }
      );
    } catch (err) {
      logger.error('Background: Failed to regenerate QR/barcode images on update:', err);
    }
  });

  // 2. Cache invalidation (fire-and-forget)
  setImmediate(() => {
    Promise.all([
      delCache(`product:${id}`),
      delCache(`product:slug:${oldProduct.slug}`),
      scanDel('products:*')
    ]).catch((err) => logger.error('Background: Cache cleanup failed:', err));
  });

  // 3. Emit events (async, non-blocking)
  setImmediate(() => {
    publishProductEvent('inventory.product.updated', product.toObject())
      .catch((err) => logger.error('Background: Event publish failed:', err));
  });

  // 4. Check visibility change and emit product.exposed if needed
  setImmediate(() => {
    try {
      const becamePublic = oldProduct.visibility !== product.visibility && product.visibility === 'public';
      const becameActiveAndPublic = oldProduct.status !== product.status && product.status === 'active' && product.visibility === 'public';
      if (becamePublic || becameActiveAndPublic) {
        publishProductEvent('product.exposed', product.toObject())
          .catch((err) => logger.error('Background: product.exposed publish failed:', err));
      }
    } catch (err) {
      logger.error('Failed to check/publish product.exposed event:', err);
    }
  });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);

  // Use lean for read-only operation
  const product = await Product.findById(id).lean();

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Delete from database immediately
  await Product.deleteOne({ _id: id });

  // Send response immediately (don't wait for Cloudinary cleanup)
  res.status(200).json({
    success: true,
    message: 'Product deleted successfully',
    data: { _id: id }
  });

  // ========== BACKGROUND TASKS ==========

  // 1. Delete Cloudinary files (async, non-critical)
  setImmediate(async () => {
    try {
      const { cloudinary } = require('../utils/uploadUtil');

      // Parallel delete operations
      const deleteOps = [];

      // Delete product images
      if (product.images && product.images.length > 0) {
        for (const img of product.images) {
          if (img.cloudinary_id) {
            deleteOps.push(
              cloudinary.uploader.destroy(img.cloudinary_id)
                .catch((err) => logger.warn(`Failed to delete image ${img.cloudinary_id}:`, err))
            );
          }
        }
      }

      // Delete QR/Barcode folder
      if (product.qrCodeUrl || product.barcodeUrl) {
        deleteOps.push(
          cloudinary.api.delete_resources_by_prefix(`QrBar_Codes/${product._id}`)
            .catch((err) => logger.warn(`Failed to delete QR/Barcode folder:`, err))
        );
      }

      // Delete variation images
      if (product.variations && product.variations.length > 0) {
        for (const variation of product.variations) {
          if (variation.images && variation.images.length > 0) {
            for (const img of variation.images) {
              if (img.cloudinary_id) {
                deleteOps.push(
                  cloudinary.uploader.destroy(img.cloudinary_id)
                    .catch((err) => logger.warn(`Failed to delete variation image ${img.cloudinary_id}:`, err))
                );
              }
            }
          }
        }
      }

      // Delete product folder (catch-all)
      deleteOps.push(
        cloudinary.api.delete_resources_by_prefix(`products/${product._id}`)
          .catch((err) => logger.warn(`Failed to delete product folder:`, err))
      );

      // Execute all deletes in parallel
      await Promise.all(deleteOps);
      logger.info(`Background: Cloudinary cleanup completed for product ${id}`);
    } catch (err) {
      logger.error('Background: Cloudinary cleanup error:', err);
    }
  });

  // 2. Update category stats (fire-and-forget)
  if (product.category) {
    setImmediate(() => {
      Category.updateOne(
        { _id: product.category },
        { $inc: { 'statistics.totalProducts': -1 } }
      ).catch((err) => logger.error('Background: Category decrement failed:', err));
    });
  }

  // 3. Invalidate caches (async, non-blocking)
  setImmediate(() => {
    Promise.all([
      delCache(`product:${id}`),
      delCache(`product:slug:${product.slug}`),
      scanDel('products:*')
    ]).catch((err) => logger.error('Background: Cache cleanup failed:', err));
  });

  // 4. Emit delete event (async, non-blocking)
  setImmediate(() => {
    publishProductEvent('inventory.product.deleted', { _id: id, ...product })
      .catch((err) => logger.error('Background: Delete event publish failed:', err));
  });

  // Send response
  res.status(200).json({
    success: true,
    message: 'Product deleted successfully'
  });
});

const updateInventory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const { quantity, operation = 'set', variationId, reason } = req.body;

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

  // Note: per-warehouse support removed; update product-level inventory only

  const StockChange = require('../models/StockChange');
  const stockChange = new StockChange({
    companyId: product.companyId,
    shopId: product.shopId,
    productId: id,
    variationId,
    warehouseId: null,
    changeType: operation === 'decrement' ? 'sale' : (operation === 'increment' ? 'restock' : 'adjustment'),
    quantity: operation === 'decrement' ? -quantity : quantity,
    previousStock: oldQuantity,
    newStock: newQuantity,
    reason: reason || `Manual ${operation} update`,
    userId: req.user?.id || 'system'
  });
  await stockChange.save();

  // Update main product-level quantity
  product.inventory.quantity = newQuantity;

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

  // Invalidate caches
  await delCache(`product:${id}`);
  await delCache(`product:slug:${product.slug}`);
  await scanDel('products:*');

  // Emit event
  await publishProductEvent('inventory.product.updated', product.toObject());

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
    .sort({ sortOrder: 1, createdAt: -1 })
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

/**
 * @desc    Smart product creation - merge if exists OR create new
 * @route   POST /api/v1/products/smart-create
 * @access  Private
 */
const smartCreateProduct = asyncHandler(async (req, res) => {
  const {
    name,
    category,
    companyId,
    shopId,
    quantity = 0,
    mergeIfExists = false,
    ignoreWarnings = false,
    ...otherProductData
  } = req.body;

  // Validate required fields
  if (!name || !category || !companyId || !shopId) {
    return res.status(400).json({
      success: false,
      message: 'name, category, companyId, and shopId are required'
    });
  }

  validateMongoId(category);

  // ========== STEP 1: Check for existing product ==========
  const existingProduct = await Product.findOne({
    name: { $regex: `^${name}$`, $options: 'i' }, // Case-insensitive match
    category: category,
    companyId: companyId,
    shopId: shopId
  });

  // ========== STEP 2: If exists, analyze compatibility ==========
  if (existingProduct) {
    const warnings = [];
    const conflicts = [];

    // Check SKU compatibility
    if (req.body.sku && existingProduct.sku && existingProduct.sku !== req.body.sku) {
      warnings.push({
        type: 'sku_mismatch',
        severity: 'medium',
        message: `Existing product has SKU: "${existingProduct.sku}", you provided: "${req.body.sku}"`
      });
    }

    // Check brand compatibility
    if (req.body.brand && existingProduct.brand && existingProduct.brand !== req.body.brand) {
      conflicts.push({
        type: 'brand_mismatch',
        severity: 'high',
        message: `Existing product brand: "${existingProduct.brand}", you provided: "${req.body.brand}"`
      });
      warnings.push({
        type: 'brand_mismatch',
        severity: 'high',
        message: `Products have different brands - are they really the same product?`
      });
    }

    // Check price compatibility
    if (req.body.pricing?.basePrice && existingProduct.pricing?.basePrice) {
      const priceDiff = Math.abs(
        (req.body.pricing.basePrice - existingProduct.pricing.basePrice) /
        existingProduct.pricing.basePrice * 100
      );
      if (priceDiff > 20) { // More than 20% difference
        warnings.push({
          type: 'price_mismatch',
          severity: 'high',
          message: `Price difference: Existing ${existingProduct.pricing.basePrice}, You provided ${req.body.pricing.basePrice} (${priceDiff.toFixed(1)}% difference)`
        });
      }
    }

    // Check description/specifications
    if (req.body.description && existingProduct.description) {
      const existingDesc = existingProduct.description.toLowerCase();
      const newDesc = req.body.description.toLowerCase();
      if (existingDesc !== newDesc && !newDesc.includes(existingDesc.substring(0, 20))) {
        warnings.push({
          type: 'description_mismatch',
          severity: 'medium',
          message: `Product descriptions differ significantly`
        });
      }
    }

    // If there are conflicts and user didn't acknowledge them
    if (conflicts.length > 0 && !ignoreWarnings) {
      return res.status(409).json({
        success: false,
        action: 'conflict_detected',
        message: 'Product conflicts detected. Please review and acknowledge warnings.',
        existingProduct: {
          id: existingProduct._id,
          name: existingProduct.name,
          sku: existingProduct.sku,
          brand: existingProduct.brand,
          pricing: existingProduct.pricing,
          currentQuantity: existingProduct.inventory.quantity,
          createdAt: existingProduct.createdAt
        },
        warnings: warnings,
        conflicts: conflicts,
        userAction: 'Please set `ignoreWarnings: true` if you want to proceed with merge, or set `mergeIfExists: false` to create new product'
      });
    }

    // ========== STEP 3: User chose to merge ==========
    if (mergeIfExists) {
      // Update existing product quantity
      const previousQuantity = existingProduct.inventory.quantity || 0;
      const newQuantity = previousQuantity + parseInt(quantity || 0);

      existingProduct.inventory.quantity = newQuantity;

      // Add audit trail entry
      existingProduct.auditTrail.push({
        action: 'merge_restock',
        changedBy: req.user?.id || 'system',
        oldValue: { quantity: previousQuantity },
        newValue: { quantity: newQuantity },
        mergeReason: 'Smart product merge - same name, category, company, shop',
        timestamp: new Date()
      });

      // Update other fields if provided and not conflicting
      if (req.body.description && !req.body.description === existingProduct.description) {
        existingProduct.description = req.body.description;
      }

      await existingProduct.save();

      logger.info(
        `✅ Product merged: "${name}" in ${companyId}:${shopId} - Added ${quantity} units (Total: ${newQuantity})`
      );

      return res.json({
        success: true,
        action: 'merged',
        message: `Added ${quantity} units to existing product`,
        data: {
          productId: existingProduct._id,
          name: existingProduct.name,
          sku: existingProduct.sku,
          previousQuantity,
          quantityAdded: parseInt(quantity || 0),
          newTotalQuantity: newQuantity,
          warnings: warnings,
          mergedAt: new Date()
        }
      });
    }

    // ========== STEP 4: User chose NOT to merge ==========
    // Continue to create new product
    return res.status(409).json({
      success: false,
      action: 'merge_suggested',
      message: 'Similar product exists. Consider merging instead of creating duplicate.',
      existingProduct: {
        id: existingProduct._id,
        name: existingProduct.name,
        sku: existingProduct.sku,
        brand: existingProduct.brand,
        pricing: existingProduct.pricing,
        currentQuantity: existingProduct.inventory.quantity,
        createdAt: existingProduct.createdAt
      },
      warnings: warnings,
      userAction: 'Set `mergeIfExists: true` to merge, or accept duplicate with `mergeIfExists: false`'
    });
  }

  // ========== STEP 5: No existing product - CREATE NEW ==========
  const newImages = req.body.images || [];
  const newVideos = req.body.videos || [];
  delete req.body.images;
  delete req.body.videos;

  // Merge all product data
  const productData = {
    ...otherProductData,
    name,
    category,
    companyId,
    shopId,
    inventory: {
      quantity: parseInt(quantity || 0),
      lowStockThreshold: req.body.lowStockThreshold || 10
    }
  };

  const product = new Product(productData);

  // Generate and upload Barcode and QR Code images
  try {
    const { generateQRCodeBuffer, generateBarcodeBuffer } = require('../utils/imageGenerator');
    const { uploadBuffer } = require('../utils/uploadUtil');

    const productData_temp = JSON.stringify({
      id: product._id,
      sku: product.sku,
      name: product.name
    });

    const qrBuffer = await generateQRCodeBuffer(productData_temp);
    const barcodeBuffer = await generateBarcodeBuffer(productData_temp);

    const qrUpload = await uploadBuffer(qrBuffer, `QrBar_Codes/${product._id}`, 'qrcode');
    const barcodeUpload = await uploadBuffer(barcodeBuffer, `QrBar_Codes/${product._id}`, 'barcode');

    product.qrCodeUrl = qrUpload.secure_url;
    product.barcodeUrl = barcodeUpload.secure_url;
  } catch (err) {
    logger.error('Failed to generate/upload barcode/QR code images:', err);
  }

  // Add audit trail entry
  product.auditTrail.push({
    action: 'create',
    changedBy: req.user?.id || 'system',
    newValue: req.body
  });

  product.images = newImages.map((img, index) => ({
    url: img.url,
    cloudinary_id: img.cloudinary_id,
    type: img.type || 'image',
    format: img.format,
    size: img.size,
    altText: img.altText || img.alt,
    isPrimary: img.isPrimary || index === 0,
    sortOrder: img.sortOrder !== undefined ? img.sortOrder : index
  }));

  product.videoUrls = newVideos.map(v => v.url);

  await product.save();

  // Update category product counts
  if (product.category) {
    validateMongoId(product.category);
    await Category.findByIdAndUpdate(
      product.category,
      { $inc: { 'statistics.totalProducts': 1 } }
    );
  }

  // Invalidate caches
  await scanDel('products:*');

  // Emit event
  await publishProductEvent('inventory.product.created', product.toObject());

  logger.info(`✅ New product created: "${name}" in ${companyId}:${shopId} with ${quantity} units`);

  res.status(201).json({
    success: true,
    action: 'created',
    message: 'New product created successfully',
    data: product
  });
});

/**
 * @desc    Check if product exists (before deciding merge/create)
 * @route   GET /api/v1/products/check-duplicate
 * @access  Private
 */
const checkProductDuplicate = asyncHandler(async (req, res) => {
  const { name, category, companyId, shopId } = req.query;

  if (!name || !category || !companyId || !shopId) {
    return res.status(400).json({
      success: false,
      message: 'name, category, companyId, and shopId query parameters are required'
    });
  }

  validateMongoId(category);

  const existingProduct = await Product.findOne({
    name: { $regex: `^${name}$`, $options: 'i' },
    category: category,
    companyId: companyId,
    shopId: shopId
  });

  if (existingProduct) {
    return res.json({
      success: true,
      exists: true,
      product: {
        id: existingProduct._id,
        name: existingProduct.name,
        sku: existingProduct.sku,
        brand: existingProduct.brand,
        pricing: existingProduct.pricing,
        currentQuantity: existingProduct.inventory.quantity,
        createdAt: existingProduct.createdAt,
        description: existingProduct.description
      },
      recommendation: 'This product already exists. Consider merging instead of creating a duplicate.'
    });
  }

  res.json({
    success: true,
    exists: false,
    message: 'No existing product found. Safe to create new product.'
  });
});

/**
 * @desc    Decode and retrieve full product data from QR/barcode scan
 * @route   POST /api/v1/products/scan
 * @access  Public
 * @param   {string} payload - Base64-encoded payload from QR code or barcode
 */
const scanProduct = asyncHandler(async (req, res) => {
  const { payload } = req.body;

  if (!payload) {
    return res.status(400).json({
      success: false,
      message: 'payload (base64-encoded QR/barcode data) is required'
    });
  }

  try {
    // Decode base64 payload to get full product object
    const decodedBuffer = Buffer.from(payload, 'base64');
    const decodedString = decodedBuffer.toString('utf-8');
    const productData = JSON.parse(decodedString);

    // Return the decoded product data with metadata
    res.status(200).json({
      success: true,
      message: 'Product data decoded successfully from scan',
      data: productData,
      scannedAt: new Date().toISOString()
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: 'Failed to decode QR/barcode payload. Ensure it is a valid base64-encoded product JSON.',
      error: err.message
    });
  }
});

/**
 * @desc    Look up product by barcode/QR code value
 * @route   GET /api/v1/products/lookup/:barcode
 * @access  Public
 */
const lookupByBarcode = asyncHandler(async (req, res) => {
  const { barcode } = req.params;

  if (!barcode) {
    return res.status(400).json({
      success: false,
      message: 'barcode parameter is required'
    });
  }

  const product = await Product.findOne({
    $or: [
      { barcode: barcode },
      { sku: barcode.toUpperCase() },
      { scanId: barcode }
    ]
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: `Product not found for barcode: ${barcode}`
    });
  }

  res.status(200).json({
    success: true,
    message: 'Product found by barcode',
    data: product
  });
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
  getOldUnboughtProducts,
  smartCreateProduct,
  checkProductDuplicate,
  scanProduct,
  lookupByBarcode
};