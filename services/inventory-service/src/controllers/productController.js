const asyncHandler = require('express-async-handler');
// Simple validation result helper
const validationResult = (req) => {
  return {
    isEmpty: () => true,
    array: () => []
  };
};
const Product = require('../models/Product');
const Category = require('../models/Category');
const categoryValidationService = require('../services/categoryValidationService');
const ProductPricing = require('../models/ProductPricing');
const ProductAudit = require('../models/ProductAudit');
const ProductStock = require('../models/ProductStock');
const ProductVariation = require('../models/ProductVariation');
const ProductSpecs = require('../models/productSpecs');
const StockChange = require('../models/StockChange');
const { validateMongoId } = require('../utils/validateMongoId');
const { formatEnrichedProduct } = require('../utils/productFormatter');
const { publishProductEvent } = require('../events/productEvents');
const { productEvents } = require('../events/eventHelpers');
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

  // Only validate category as it's a MongoDB ObjectId
  if (category) validateMongoId(category);

  // Generate cache key based on query params
  const cacheKey = `products:${JSON.stringify(req.query)}`;
  const cachedData = await getCache(cacheKey);

  if (cachedData) {
    return res.status(200).json(cachedData);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Build base product query (exclude price/stock filters which are in separate collections)
  const query = {};
  if (companyId) query.companyId = companyId;
  if (status) query.status = status;
  if (visibility) query.visibility = visibility;
  if (category) query.categoryId = category;
  if (brand) query.brand = new RegExp(brand, 'i');
  if (featured !== undefined) query.featured = featured === 'true';
  if (search) {
    query.$text = { $search: search };
  }

  // Handle price filters by querying ProductPricing for matching productIds
  let productIdCandidates = null;
  if (minPrice || maxPrice) {
    const pricingQuery = {};
    if (minPrice) pricingQuery.basePrice = { ...(pricingQuery.basePrice || {}), $gte: parseFloat(minPrice) };
    if (maxPrice) pricingQuery.basePrice = { ...(pricingQuery.basePrice || {}), $lte: parseFloat(maxPrice) };
    const matchedProductIds = await ProductPricing.find(pricingQuery).distinct('productId').lean();
    if (!matchedProductIds || matchedProductIds.length === 0) {
      // No products match pricing filters
      return res.status(200).json({ success: true, data: [], pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 } });
    }
    productIdCandidates = new Set(matchedProductIds.map(id => String(id)));
  }

  // Handle stock filter by querying ProductStock
  if (inStock === 'true') {
    const stocks = await ProductStock.aggregate([
      { $group: { _id: '$productId', qty: { $sum: { $subtract: ['$stockQty', '$reservedQty'] } } } },
      { $match: { qty: { $gt: 0 } } },
      { $project: { productId: '$_id' } }
    ]).exec();
    const stocked = stocks.map(s => String(s.productId || s._id));
    if (!stocked || stocked.length === 0) {
      return res.status(200).json({ success: true, data: [], pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 } });
    }
    if (productIdCandidates) {
      // intersect sets
      const intersect = new Set();
      stocked.forEach(id => { if (productIdCandidates.has(String(id))) intersect.add(String(id)); });
      if (intersect.size === 0) {
        return res.status(200).json({ success: true, data: [], pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 } });
      }
      productIdCandidates = intersect;
    } else {
      productIdCandidates = new Set(stocked);
    }
  }

  // If we have candidate product ids from price/stock filters, add them to the query
  if (productIdCandidates) {
    query._id = { $in: Array.from(productIdCandidates) };
  }

  // Use lean() for read-only queries (much faster - returns plain JS objects, not Mongoose documents)
  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('categoryId', 'name slug level parentCategory isActive')
      .populate('pricingId')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean()
      .exec(),
    Product.countDocuments(query)
  ]);

  // Enhance products with additional data
  const enrichedProducts = await Promise.all(products.map(async (product) => {
    const [variations, stockInfo, specsInfo] = await Promise.all([
      ProductVariation.find({ productId: product._id })
        .populate('attributeValues.attributeId', 'name type')
        .lean(),
      ProductStock.find({ productId: product._id }).lean(),
      ProductSpecs.findOne({ productId: product._id }).lean()
    ]);

    return formatEnrichedProduct(product, variations, stockInfo, specsInfo);
  }));

  const responseData = {
    success: true,
    data: enrichedProducts,
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
    .populate('categoryId', 'name slug level attributes parentCategory isActive')
    .populate('pricingId')
    .lean()
    .exec();

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Fetch all related data comprehensively
  const [variations, stockInfo, specsInfo] = await Promise.all([
    ProductVariation.find({ productId: id })
      .populate('attributeValues.attributeId', 'name type')
      .lean(),
    ProductStock.find({ productId: id }).lean(),
    ProductSpecs.findOne({ productId: id }).lean()
  ]);

  // Build comprehensive enriched product data
  const enrichedProduct = formatEnrichedProduct(product, variations, stockInfo, specsInfo);

  // Cache asynchronously (non-blocking)
  setImmediate(() => {
    setCache(cacheKey, enrichedProduct, 3600)
      .catch((err) => logger.error('Cache set failed:', err));
  });

  res.status(200).json({
    success: true,
    data: enrichedProduct
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
    .populate('categoryId', 'name slug level attributes parentCategory isActive')
    .populate('pricingId')
    .lean();

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Fetch all related data comprehensively
  const [variations, stockInfo, specsInfo] = await Promise.all([
    ProductVariation.find({ productId: product._id })
      .populate('attributeValues.attributeId', 'name type')
      .lean(),
    ProductStock.find({ productId: product._id }).lean(),
    ProductSpecs.findOne({ productId: product._id }).lean()
  ]);

  // Build comprehensive enriched product data
  const enrichedProduct = formatEnrichedProduct(product, variations, stockInfo, specsInfo);


  await setCache(cacheKey, enrichedProduct, 3600);

  res.status(200).json({
    success: true,
    data: enrichedProduct
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

  // EDGE CASE: Images array limit (max 10 images per product)
  if (newImages.length > 10) {
    return res.status(400).json({
      success: false,
      message: 'Cannot exceed 10 images per product',
      currentCount: newImages.length,
      maxLimit: 10
    });
  }

  // NOTE: sku, asin, upc, barcode, qrCode, scanId, browseNodeId are auto-generated by Product model pre-save middleware.
  // Validate that category is provided and is a Level-3 category
  if (!req.body.categoryId) {
    return res.status(400).json({ success: false, message: 'categoryId is required and must be a level-3 category' });
  }

  // ensure category exists and is level-3, and fetch parent L2
  const categoryDoc = await Category.findById(req.body.categoryId).lean();
  if (!categoryDoc || categoryDoc.level !== 3) {
    return res.status(400).json({ success: false, message: 'Invalid category selection: category must be level 3' });
  }

  // EDGE CASE: Validate parent L2 category still exists (not deleted) and is not deleted/inactive
  const parentL2Id = categoryDoc.parentCategory;
  let parentL2Name = null;
  if (parentL2Id) {
    const parentDoc = await Category.findById(parentL2Id).lean();
    if (!parentDoc) {
      return res.status(400).json({
        success: false,
        message: 'Parent L2 category has been deleted; cannot create product with orphaned category'
      });
    }
    if (!parentDoc.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Parent L2 category is inactive; cannot create product'
      });
    }
    parentL2Name = parentDoc.name;
  } else {
    return res.status(400).json({
      success: false,
      message: 'L3 category must have a valid L2 parent category'
    });
  }

  // Validate payload against L2 mapping (if mapping exists)
  try {
    const validation = await categoryValidationService.validateProductPayloadAgainstL2(req.body, parentL2Name);
    if (validation.mappingFound && !validation.valid) {
      return res.status(400).json({ success: false, message: 'Missing required category-specific fields', errors: validation.errors });
    }
  } catch (err) {
    // If validation service fails unexpectedly, log and continue (do not block product creation)
    // but return an internal error if the failure is due to corrupted mapping
    // For safety, allow creation when mapping cannot be read.
    // eslint-disable-next-line no-console
    console.warn('Category validation service error:', err?.message || err);
  }

  // Map frontend fields to backend schema
  const productData = { ...req.body };

  // Handle featured field mapping
  if (req.body.isFeatured !== undefined) {
    productData.featured = req.body.isFeatured;
  }
  if (req.body.featured !== undefined) {
    productData.isFeatured = req.body.featured;
  }

  // Explicitly handle expiration fields
  if (req.body.expiryDate) productData.expiryDate = new Date(req.body.expiryDate);
  if (req.body.manufacturingDate) productData.manufacturingDate = new Date(req.body.manufacturingDate);

  const product = new Product(productData);

  // Process images - handle base64 uploads via events
  const rawImages = [];
  const processedImages = [];

  if (Array.isArray(newImages)) {
    newImages.forEach((img, index) => {
      if (img.data || img.base64) {
        // It's a raw image, stage for background upload
        rawImages.push({
          data: img.data || img.base64,
          format: img.format || 'jpg',
          index: index,
          isPrimary: img.isPrimary || (index === 0),
          sortOrder: img.sortOrder !== undefined ? img.sortOrder : index,
          altText: img.altText || img.alt || product.name
        });
      } else {
        // It's likely already a URL or valid object
        processedImages.push({
          url: img.url,
          cloudinary_id: img.cloudinary_id,
          type: img.type || 'image',
          format: img.format,
          size: img.size,
          altText: img.altText || img.alt || product.name,
          isPrimary: img.isPrimary || (index === 0),
          sortOrder: img.sortOrder !== undefined ? img.sortOrder : index
        });
      }
    });
  }

  product.images = processedImages;
  product.videoUrls = newVideos.map(v => v.url);

  // Save product (this triggers pre-save middleware for auto-generation)
  await product.save();

  // If a pricing payload was provided, persist it in the ProductPricing collection
  if (req.body.pricing) {
    try {
      const pricingPayload = Object.assign({}, req.body.pricing);
      // Ensure basePrice exists for pricing model
      if (pricingPayload.basePrice === undefined || pricingPayload.basePrice === null) {
        // rollback product creation to keep data consistent (soft-delete)
        await Product.updateOne({ _id: product._id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });
        return res.status(400).json({ success: false, message: 'pricing.basePrice is required' });
      }

      const pricingDoc = await ProductPricing.create(Object.assign({}, pricingPayload, {
        productId: product._id,
        companyId: product.companyId // EDGE CASE: Ensure pricing is scoped to company
      }));
      // Link pricingId on product for future reference
      product.pricingId = pricingDoc._id;
      await product.save();
    } catch (err) {
      // On pricing creation error, soft-delete product to avoid dangling unlinked product
      try {
        await Product.updateOne({ _id: product._id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });
      } catch (delErr) {
        logger.error('Failed to soft-delete product after pricing creation error', delErr);
      }
      logger.error('Failed to create ProductPricing:', err);
      return res.status(500).json({ success: false, message: 'Failed to persist product pricing', error: err.message });
    }
  } else if (req.body.pricingId) {
    // EDGE CASE: If pricingId provided directly, validate it belongs to same company
    try {
      const existingPricing = await ProductPricing.findById(req.body.pricingId).lean();
      if (!existingPricing) {
        return res.status(404).json({
          success: false,
          message: 'ProductPricing not found',
          field: 'pricingId'
        });
      }
      if (existingPricing.companyId !== product.companyId) {
        return res.status(403).json({
          success: false,
          message: 'Cannot use pricing from different company',
          field: 'pricingId'
        });
      }
      product.pricingId = req.body.pricingId;
    } catch (err) {
      logger.error('Failed to validate pricingId:', err);
      return res.status(500).json({ success: false, message: 'Failed to validate pricing', error: err.message });
    }
  }

  // Ensure QR/barcode payloads are strictly SKU-only (not full product object)
  try {
    if (product.sku) {
      // Store ONLY SKU for QR/barcode generation (security & stability)
      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            qrPayload: product.sku,
            barcodePayload: product.sku,
            qrCode: product.sku,  // Ensure consistency
            barcode: product.sku  // Ensure consistency
          }
        }
      );
      product.qrPayload = product.sku;
      product.barcodePayload = product.sku;
      logger.info(`✅ QR/Barcode payloads set to SKU: ${product.sku}`);
    } else {
      logger.warn('⚠️ Product created without SKU - QR/Barcode generation may fail');
    }
  } catch (err) {
    logger.warn('Failed to set SKU-only payloads for QR/barcode:', err.message || err);
  }

  // Create product stock record (required for all products)
  try {
    const inventoryData = req.body.inventory || req.body.stock || {};
    const initialQty = parseInt(
      req.body.initialQuantity ||
      req.body.quantity ||
      inventoryData.quantity ||
      0
    );

    const stockData = {
      productId: product._id,
      variationId: null, // Master product stock
      stockQty: initialQty,
      lowStockThreshold: req.body.lowStockThreshold || inventoryData.lowStockThreshold || 10,
      minReorderQty: req.body.minReorderQty || inventoryData.minReorderQty || 20,
      trackQuantity: req.body.trackQuantity !== undefined ? req.body.trackQuantity :
        (inventoryData.trackQuantity !== undefined ? inventoryData.trackQuantity : true),
      allowBackorder: req.body.allowBackorder !== undefined ? req.body.allowBackorder :
        (inventoryData.allowBackorder !== undefined ? inventoryData.allowBackorder : false),
      ...inventoryData
    };

    await ProductStock.create(stockData);

    // Create initial stock change if quantity > 0
    if (initialQty && initialQty > 0) {
      try {
        await StockChange.create({
          companyId: product.companyId,
          shopId: product.shopId,
          productId: product._id,
          type: 'restock',
          qty: Math.abs(initialQty),
          previous: 0,
          new: Math.abs(initialQty),
          reason: 'Initial stock on product creation',
          userId: req.user?.id || 'system',
          meta: {
            productName: product.name,
            categoryId: product.categoryId,
            unitCost: product.pricing?.cost || 0
          }
        });
      } catch (e) {
        logger.warn('Failed to create initial StockChange:', e.message || e);
      }
    }
  } catch (err) {
    logger.error('Failed to create ProductStock:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create product stock record',
      error: err.message
    });
  }

  // Persist product specs (if provided) into ProductSpecs model
  try {
    const specsObj = {};
    if (Array.isArray(req.body.specs)) {
      req.body.specs.forEach(s => { if (s && s.name) specsObj[s.name] = s.value; });
    }
    if (Array.isArray(req.body.attributes)) {
      req.body.attributes.forEach(a => { if (a && a.name) specsObj[a.name] = a.value; });
    }
    // Include any top-level mapped fields that were present
    const mapping = categoryValidationService.findL2MappingByName(parentL2Name);
    if (mapping && mapping.commonFields) {
      mapping.commonFields.forEach((f) => {
        if (req.body[f] !== undefined) specsObj[f] = req.body[f];
      });
    }

    // Only persist if there is something to store
    if (Object.keys(specsObj).length > 0) {
      await ProductSpecs.create({ productId: product._id, l2Category: parentL2Name, specs: specsObj });
    }
  } catch (err) {
    logger.warn('Failed to persist ProductSpecs on create:', err.message || err);
  }

  // Persist audit entry as separate document (do not duplicate in Product)
  try {
    await ProductAudit.create({
      productId: product._id,
      action: 'create',
      changedBy: req.user?.id || 'system',
      newValue: req.body,
      timestamp: new Date()
    });
  } catch (err) {
    logger.error('Failed to persist product audit entry:', err);
  }

  // Populate related data for frontend response
  const populatedProduct = await Product.findById(product._id)
    .populate('categoryId', 'name slug level parentCategory')
    .populate('pricingId')
    .lean();

  // Get stock information
  const stockInfo = await ProductStock.findOne({ productId: product._id }).lean();

  // Get specs information if exists
  const specsInfo = await ProductSpecs.findOne({ productId: product._id }).lean();

  // Build comprehensive response for frontend
  const responseData = {
    // Core product data
    ...populatedProduct,

    // Stock/Inventory information
    stock: stockInfo ? {
      quantity: stockInfo.stockQty || 0,
      lowStockThreshold: stockInfo.lowStockThreshold || 0,
      availableQuantity: Math.max(0, (stockInfo.stockQty || 0) - (stockInfo.reservedQty || 0)),
      inStock: (stockInfo.stockQty || 0) > 0,
      isLowStock: (stockInfo.stockQty || 0) <= (stockInfo.lowStockThreshold || 0),
      trackQuantity: stockInfo.trackQuantity !== false,
      allowBackorder: stockInfo.allowBackorder || false,
      supplier: stockInfo.supplier,
      supplierSKU: stockInfo.supplierSKU
    } : null,

    // Specifications
    specifications: specsInfo ? specsInfo.specs : null,

    // Pricing details (already populated)
    pricing: populatedProduct.pricingId ? {
      basePrice: populatedProduct.pricingId.basePrice,
      currency: populatedProduct.pricingId.currency,
      cost: populatedProduct.pricingId.cost,
      salePrice: populatedProduct.pricingId.salePrice,
      marginAmount: populatedProduct.pricingId.marginAmount,
      marginPercent: populatedProduct.pricingId.marginPercent,
      profitRank: populatedProduct.pricingId.profitRank
    } : null,

    // Auto-generated identifiers
    identifiers: {
      sku: populatedProduct.sku,
      barcode: populatedProduct.barcode,
      qrCode: populatedProduct.qrCode || populatedProduct.qrPayload,
      scanId: populatedProduct.scanId,
      asin: populatedProduct.asin,
      upc: populatedProduct.upc
    },

    // URLs for QR/Barcode images (will be updated in background)
    codes: {
      qrCodeUrl: populatedProduct.qrCodeUrl || null,
      barcodeUrl: populatedProduct.barcodeUrl || null
    },

    // Category information
    category: populatedProduct.categoryId ? {
      id: populatedProduct.categoryId._id,
      name: populatedProduct.categoryId.name,
      slug: populatedProduct.categoryId.slug,
      level: populatedProduct.categoryId.level,
      parentId: populatedProduct.categoryId.parentCategory
    } : null,

    // Status and visibility
    status: {
      active: populatedProduct.status === 'active',
      visible: populatedProduct.visibility === 'public',
      featured: populatedProduct.featured || populatedProduct.isFeatured,
      availability: populatedProduct.availability,
      condition: populatedProduct.condition
    },

    // Metadata
    metadata: {
      createdAt: populatedProduct.createdAt,
      updatedAt: populatedProduct.updatedAt,
      slug: populatedProduct.slug,
      companyId: populatedProduct.companyId,
      shopId: populatedProduct.shopId
    }
  };

  // Remove populated fields to avoid duplication
  delete responseData.pricingId;
  delete responseData.categoryId;

  // Return comprehensive response
  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: responseData,
    actions: {
      view: `/products/${populatedProduct.slug}`,
      edit: `/products/${populatedProduct._id}/edit`,
      inventory: `/products/${populatedProduct._id}/inventory`,
      pricing: `/products/${populatedProduct._id}/pricing`
    }
  });

  // ========== BACKGROUND TASKS (non-blocking) ==========
  // These run after the response is sent to client

  // 1. Request QR/Barcode generation from document-service (async, non-critical)
  if (process.nextTick) {
    setImmediate(async () => {
      try {
        const { requestQRCode, requestBarcode, requestProductImage } = require('../utils/events/documentRequests');

        // Handle Image Uploads
        if (rawImages && rawImages.length > 0) {
          logger.info(`📤 Requesting upload for ${rawImages.length} images for product ${product._id}`);

          for (const img of rawImages) {
            try {
              let buffer;
              if (Buffer.isBuffer(img.data)) {
                buffer = img.data;
              } else {
                // Handle base64 string (strip prefix if present)
                const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
                buffer = Buffer.from(base64Data, 'base64');
              }

              await requestProductImage(product._id.toString(), buffer, product.companyId, img.format);
            } catch (imgErr) {
              logger.error(`Failed to request upload for image index ${img.index}:`, imgErr);
            }
          }
        }

        const skuValue = product.sku;
        if (!skuValue) {
          logger.warn(`⚠️ Cannot generate QR/Barcode for product ${product._id} - SKU missing`);
          return;
        }

        logger.info(`📤 Requesting QR/Barcode generation for SKU: ${skuValue}`);

        // Emit events to document-service
        await Promise.all([
          requestQRCode(product._id.toString(), skuValue, product.companyId),
          requestBarcode(product._id.toString(), skuValue, product.companyId)
        ]);

        logger.info(`✅ QR/Barcode generation requests sent for SKU: ${skuValue}`);
      } catch (err) {
        logger.error('Background: Failed to request document generation:', err);
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

  // EDGE CASE: Images array limit (max 10 images total)
  if (newImages.length > 10) {
    return res.status(400).json({
      success: false,
      message: 'Cannot exceed 10 images per product',
      currentCount: newImages.length,
      maxLimit: 10
    });
  }

  // Use lean + findById for fast read (no need for full Mongoose document)
  const oldProduct = await Product.findById(id).lean();
  if (!oldProduct) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // EDGE CASE: Prevent SKU modification (SKU should be immutable after creation)
  if (req.body.sku && req.body.sku !== oldProduct.sku) {
    return res.status(400).json({
      success: false,
      message: 'SKU cannot be modified after product creation (immutable field)',
      field: 'sku',
      currentSKU: oldProduct.sku,
      attemptedSKU: req.body.sku
    });
  }

  // EDGE CASE: If categoryId or category is being changed, validate it's still L3 and parent exists
  const newCategoryId = req.body.categoryId || req.body.category;
  if (newCategoryId && newCategoryId !== String(oldProduct.categoryId)) {
    validateMongoId(newCategoryId);
    const newCategoryDoc = await Category.findById(newCategoryId).lean();
    if (!newCategoryDoc || newCategoryDoc.level !== 3) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category selection: category must be level 3',
        field: 'categoryId'
      });
    }
    // Validate parent L2 still exists
    if (newCategoryDoc.parentCategory) {
      const parentDoc = await Category.findById(newCategoryDoc.parentCategory).lean();
      if (!parentDoc) {
        return res.status(400).json({
          success: false,
          message: 'Parent L2 category has been deleted; cannot change to this category',
          field: 'categoryId'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'L3 category must have a valid L2 parent category',
        field: 'categoryId'
      });
    }

    // Normalize to categoryId for consistency
    if (req.body.category) {
      req.body.categoryId = newCategoryId;
      delete req.body.category;
    }
  }

  // EDGE CASE: Validate product name is still unique in company (unless keeping same name)
  if (req.body.name && req.body.name !== oldProduct.name) {
    const duplicate = await Product.findOne({
      _id: { $ne: id },
      companyId: oldProduct.companyId,
      name: req.body.name
    }).lean();
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Another product with this name already exists in your company',
        field: 'name'
      });
    }
  }

  // Handle images and videos
  // Separate raw base64 images from existing/URL images
  const rawImages = [];
  let finalImages = oldProduct.images || [];
  const incomingImages = Array.isArray(req.body.images) ? req.body.images : [];

  const validIncomingImages = [];

  incomingImages.forEach((img, index) => {
    if (img.data || img.base64) {
      rawImages.push({
        data: img.data || img.base64,
        format: img.format || 'jpg',
        index: index,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
        altText: img.altText || img.alt
      });
    } else {
      validIncomingImages.push(img);
    }
  });

  if (req.headers['x-replace-images'] === 'true') {
    // REPLACEMENT LOGIC
    logger.info(`🔄 Replacing image array for product ${id}`);

    // Identify images to delete from Cloudinary
    const incomingIds = new Set(validIncomingImages.map(img => img.cloudinary_id).filter(Boolean));
    const toDelete = (oldProduct.images || []).filter(img =>
      img.cloudinary_id &&
      !incomingIds.has(img.cloudinary_id) &&
      !img.cloudinary_id.startsWith('placeholder_')
    );

    if (toDelete.length > 0) {
      logger.info(`🗑️ Deleting ${toDelete.length} removed images from Cloudinary`);
      // Warning: deleteFile relies on uploadUtil which we are removing.
      // Ideally this should also be an event: requestDeleteFile
      // For now, logging warning as we are in a transition.
      logger.warn('Skipping direct Cloudinary delete as uploadUtil is deprecated. Implement document.delete event ideally.');
    }

    finalImages = validIncomingImages;
  } else if (validIncomingImages.length > 0) {
    // APPEND LOGIC (Default)
    logger.info(`➕ Appending ${validIncomingImages.length} new images to product ${id}`);

    // filter out any duplicates just in case
    const existingIds = new Set(finalImages.map(img => img.cloudinary_id).filter(Boolean));
    const newItems = validIncomingImages.filter(img => !existingIds.has(img.cloudinary_id));

    finalImages = [...finalImages, ...newItems];
  }

  // EDGE CASE: Enforce limit (5 images max)
  if (finalImages.length > 5) {
    return res.status(400).json({
      success: false,
      message: 'Product cannot have more than 5 images total',
      currentCount: finalImages.length,
      maxLimit: 5
    });
  }

  // Ensure primary and sort order are sane
  finalImages = finalImages.map((img, idx) => ({
    ...img,
    isPrimary: img.isPrimary || (idx === 0),
    sortOrder: img.sortOrder !== undefined ? img.sortOrder : idx
  }));


  req.body.images = finalImages;

  // Enforce Video Limit (Max 2)
  const incomingVideosCheck = Array.isArray(req.body.videos) ? req.body.videos : [];
  const currentVideoCount = (oldProduct.videoUrls || []).length;
  // Note: This is an estimation. Real check happens during processing, but we should fail early if total likely exceeds.
  // Actually, we calculate `videoUrlsToSave` + `videoFilesToProcess`.
  // Let's do the check after processing the arrays below.


  req.body.images = finalImages;

  // Handle Videos (URLs vs Files)
  const incomingVideos = Array.isArray(newVideos) ? newVideos : [];
  const videoUrlsToSave = [...(oldProduct.videoUrls || [])];
  const videoFilesToProcess = [];

  incomingVideos.forEach(v => {
    // If it's a string, check if it's a URL
    if (typeof v === 'string') {
      if (v.startsWith('http') || v.startsWith('www')) {
        if (!videoUrlsToSave.includes(v)) videoUrlsToSave.push(v);
      } else {
        // Assume base64 or raw data string for upload
        videoFilesToProcess.push({ buffer: Buffer.from(v, 'base64'), format: 'mp4' });
      }
    } else if (v.url) {
      if (!videoUrlsToSave.includes(v.url)) videoUrlsToSave.push(v.url);
    } else if (v.buffer || v.data) {
      videoFilesToProcess.push({
        buffer: v.buffer ? Buffer.from(v.buffer) : Buffer.from(v.data, 'base64'),
        format: v.format || 'mp4'
      });
    }
  });

  const totalNewVideos = videoUrlsToSave.length + videoFilesToProcess.length;
  if (totalNewVideos > 2) {
    return res.status(400).json({
      success: false,
      message: 'Product cannot have more than 2 videos total',
      currentCount: totalNewVideos,
      maxLimit: 2
    });
  }

  req.body.videoUrls = videoUrlsToSave;

  // Perform the update
  const product = await Product.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('categoryId', 'name slug level')
    .populate('pricingId');

  if (product && videoFilesToProcess.length > 0) {
    // Process video files async
    setImmediate(() => {
      try {
        const { requestProductVideo } = require('../utils/events/documentRequests');
        videoFilesToProcess.forEach(vFile => {
          requestProductVideo(product._id.toString(), vFile.buffer, product.companyId, vFile.format)
            .catch(err => logger.warn(`Failed to req video upload for ${product._id}`, err));
        });
      } catch (err) {
        logger.warn('Failed to init video upload process (update)', err);
      }
    });
  }

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found after update'
    });
  }

  // Update pricing if provided
  if (req.body.pricing && product.pricingId) {
    try {
      await ProductPricing.findByIdAndUpdate(
        product.pricingId,
        req.body.pricing,
        { runValidators: true }
      );
      // Refresh the populated pricing data
      await product.populate('pricingId');
    } catch (err) {
      logger.warn('Failed to update product pricing:', err.message);
    }
  }

  // Update inventory if provided
  if (req.body.inventory || req.body.stock) {
    try {
      const stockData = req.body.inventory || req.body.stock;
      await ProductStock.findOneAndUpdate(
        { productId: product._id },
        stockData,
        { upsert: true, runValidators: true }
      );
    } catch (err) {
      logger.warn('Failed to update product stock:', err.message);
    }
  }

  // Update specs if provided
  if (req.body.specs || req.body.attributes) {
    try {
      const specsObj = {};
      if (Array.isArray(req.body.specs)) {
        req.body.specs.forEach(s => { if (s && s.name) specsObj[s.name] = s.value; });
      }
      if (Array.isArray(req.body.attributes)) {
        req.body.attributes.forEach(a => { if (a && a.name) specsObj[a.name] = a.value; });
      }

      if (Object.keys(specsObj).length > 0) {
        await ProductSpecs.findOneAndUpdate(
          { productId: product._id },
          { specs: specsObj },
          { upsert: true }
        );
      }
    } catch (err) {
      logger.warn('Failed to update product specs:', err.message);
    }
  }

  // Get additional data for comprehensive response
  const [stockInfo, specsInfo] = await Promise.all([
    ProductStock.findOne({ productId: product._id }).lean(),
    ProductSpecs.findOne({ productId: product._id }).lean()
  ]);

  // Build comprehensive response similar to create
  const responseData = {
    ...product.toObject(),
    stock: stockInfo ? {
      quantity: stockInfo.stockQty || 0,
      lowStockThreshold: stockInfo.lowStockThreshold || 0,
      availableQuantity: Math.max(0, (stockInfo.stockQty || 0) - (stockInfo.reservedQty || 0)),
      inStock: (stockInfo.stockQty || 0) > 0,
      isLowStock: (stockInfo.stockQty || 0) <= (stockInfo.lowStockThreshold || 0),
      trackQuantity: stockInfo.trackQuantity !== false
    } : null,
    specifications: specsInfo ? specsInfo.specs : null,
    pricing: product.pricingId ? {
      basePrice: product.pricingId.basePrice,
      currency: product.pricingId.currency,
      cost: product.pricingId.cost,
      salePrice: product.pricingId.salePrice,
      marginAmount: product.pricingId.marginAmount,
      marginPercent: product.pricingId.marginPercent
    } : null
  };

  // Persist audit entry as separate document
  try {
    await ProductAudit.create({
      productId: product._id,
      action: 'update',
      changedBy: req.user?.id || 'system',
      oldValue: oldProduct,
      newValue: req.body,
      timestamp: new Date()
    });
  } catch (err) {
    logger.error('Failed to persist product audit entry (update):', err);
  }

  // Send response immediately
  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: responseData,
    actions: {
      view: `/products/${product.slug}`,
      edit: `/products/${product._id}/edit`,
      inventory: `/products/${product._id}/inventory`
    }
  });

  // ========== BACKGROUND TASKS ==========

  // 1. Request QR/Barcode regeneration and Image Uploads
  setImmediate(async () => {
    try {
      const { requestQRCode, requestBarcode, requestProductImage } = require('../utils/events/documentRequests');

      // Handle raw image uploads
      if (rawImages && rawImages.length > 0) {
        logger.info(`📤 Requesting upload for ${rawImages.length} new images for product ${id}`);
        for (const img of rawImages) {
          try {
            let buffer;
            if (Buffer.isBuffer(img.data)) {
              buffer = img.data;
            } else {
              const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
              buffer = Buffer.from(base64Data, 'base64');
            }
            await requestProductImage(product._id.toString(), buffer, product.companyId, img.format);
          } catch (imgErr) {
            logger.error(`Failed to request upload for new image:`, imgErr);
          }
        }
      }

      // Use SKU-only payloads for QR/barcode generation when available
      const skuValue = product.sku || product.qrPayload || product.qrCode;

      if (!skuValue) {
        logger.warn(`⚠️ Cannot regenerate QR/Barcode for product ${product._id} - SKU missing`);
        return;
      }

      logger.info(`📤 Requesting QR/Barcode regeneration for SKU: ${skuValue}`);

      await Promise.all([
        requestQRCode(product._id.toString(), skuValue, product.companyId),
        requestBarcode(product._id.toString(), skuValue, product.companyId)
      ]);

      logger.info(`✅ QR/Barcode regeneration requests sent`);
    } catch (err) {
      logger.error('Background: Failed to request QR/barcode regeneration:', err);
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

  // Soft-delete the product to avoid data loss
  await Product.updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });

  // Send response immediately (don't wait for Cloudinary cleanup)
  res.status(200).json({
    success: true,
    message: 'Product soft-deleted successfully',
    data: { _id: id }
  });

  // ========== BACKGROUND TASKS (non-blocking) ==========

  // 1. File cleanup is now handled by document-service
  setImmediate(() => {
    logger.info(`File cleanup for product ${id} delegated to document-service`);
  });

  // 2. Update category stats (fire-and-forget)
  if (product.category) {
    setImmediate(() => {
      // Assuming Category model is imported
      const Category = require('../models/Category');
      Category.updateOne(
        { _id: product.category },
        { $inc: { 'statistics.totalProducts': -1 } }
      ).catch((err) => logger.error('Background: Category decrement failed:', err));
    });
  }

  // 3. Invalidate caches (async, non-blocking)
  setImmediate(() => {
    // Assuming delCache and scanDel are imported/available
    const { delCache, scanDel } = require('../utils/cache');
    Promise.all([
      delCache(`product:${id}`),
      delCache(`product:slug:${product.slug}`),
      scanDel('products:*')
    ]).catch((err) => logger.error('Background: Cache cleanup failed:', err));
  });

  // 4. Emit delete event (async, non-blocking)
  setImmediate(() => {
    // Assuming publishProductEvent is imported/available
    const { publishProductEvent } = require('../utils/events/productEvents');
    publishProductEvent('inventory.product.deleted', { _id: id, ...product })
      .catch((err) => logger.error('Background: Delete event publish failed:', err));
  });
});

const updateInventory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  validateMongoId(id);
  const { quantity, operation = 'set', variationId, reason } = req.body;

  // For safety we require a variationId to update concrete stock levels.
  if (!variationId) {
    return res.status(400).json({ success: false, message: 'variationId is required for inventory updates. Use stock endpoints for product-level adjustments.' });
  }

  const product = await Product.findById(id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  const variation = await ProductVariation.findById(variationId);
  if (!variation || String(variation.productId) !== String(id)) {
    return res.status(404).json({ success: false, message: 'Variation not found for this product' });
  }

  const oldQuantity = variation.stockQty || 0;
  let newQuantity;
  switch (operation) {
    case 'increment':
      newQuantity = oldQuantity + Math.abs(Number(quantity));
      break;
    case 'decrement':
      newQuantity = Math.max(0, oldQuantity - Math.abs(Number(quantity)));
      break;
    case 'set':
    default:
      newQuantity = Math.max(0, Number(quantity));
  }

  const qtyDiff = newQuantity - oldQuantity; // positive for inflow, negative for outflow

  // Build StockChange according to StockChange schema
  const changeType = operation === 'decrement' ? 'sale' : (operation === 'increment' ? 'restock' : 'adjustment');
  const stockChangePayload = {
    companyId: product.companyId,
    shopId: product.shopId,
    productId: id,
    variationId,
    type: changeType,
    qty: qtyDiff === 0 ? 0 : (changeType === 'sale' ? -Math.abs(qtyDiff) : Math.abs(qtyDiff)),
    previous: oldQuantity,
    reason: reason || `Manual ${operation} update`,
    userId: req.user?.id || 'system'
  };

  try {
    const sc = await StockChange.create(stockChangePayload);
    // StockChange pre-save will atomically update the variation.stockQty when variationId is set
  } catch (err) {
    logger.error('Failed to create StockChange:', err);
    return res.status(500).json({ success: false, message: 'Failed to update inventory', error: err.message });
  }

  // Re-fetch updated variation and compute aggregated product stock
  const updatedVariation = await ProductVariation.findById(variationId).lean();
  const totalAgg = await ProductVariation.aggregate([
    { $match: { productId: product._id } },
    { $group: { _id: null, total: { $sum: '$stockQty' } } }
  ]);
  const aggregatedTotal = totalAgg[0]?.total || 0;

  // Persist audit entry
  try {
    await ProductAudit.create({
      productId: product._id,
      action: 'stock_change',
      changedBy: req.user?.id || 'system',
      oldValue: { variationId, quantity: oldQuantity },
      newValue: { variationId, quantity: updatedVariation.stockQty, operation },
      timestamp: new Date()
    });
  } catch (err) {
    logger.error('Failed to persist product audit entry (stock_change):', err);
  }

  // Trigger low stock alert if needed
  try {
    const stockSettings = await ProductStock.findOne({ productId: product._id }).lean();
    const lowThresh = stockSettings?.lowStockThreshold ?? 5;
    if (updatedVariation.stockQty <= lowThresh && operation === 'decrement') {
      const Alert = require('../models/Alert');
      await Alert.create({
        companyId: product.companyId,
        type: 'low_stock',
        productId: id,
        variationId,
        threshold: lowThresh,
        message: `Stock for product ${product.name} (variation ${variationId}) is low: ${updatedVariation.stockQty}`
      });
    }
  } catch (e) {
    logger.warn('Low stock alert check failed:', e.message || e);
  }

  // Invalidate caches and emit event
  await delCache(`product:${id}`);
  await delCache(`product:slug:${product.slug}`);
  await scanDel('products:*');
  await publishProductEvent('inventory.stock.updated', {
    productId: product._id,
    variationId,
    oldQuantity,
    newQuantity: updatedVariation.stockQty,
    productName: product.name,
    companyId: product.companyId,
    shopId: product.shopId,
    reason: reason || 'Manual update'
  });

  res.status(200).json({
    success: true,
    message: 'Inventory updated successfully',
    data: {
      productId: product._id,
      variationId,
      oldQuantity,
      newQuantity: updatedVariation.stockQty,
      aggregatedTotal
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

  if (category) query.categoryId = category;
  if (companyId) query.companyId = companyId;

  const products = await Product.find(query)
    .populate('categoryId', 'name slug')
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
    visibility: 'public',
    isDeleted: { $ne: true }
  };

  if (category) query.categoryId = category;
  if (minPrice || maxPrice) {
    query['pricing.basePrice'] = {};
    if (minPrice) query['pricing.basePrice'].$gte = parseFloat(minPrice);
    if (maxPrice) query['pricing.basePrice'].$lte = parseFloat(maxPrice);
  }

  // Use lean() for better performance and comprehensive population
  const [products, total] = await Promise.all([
    Product.find(query, { score: { $meta: 'textScore' } })
      .populate('categoryId', 'name slug level parentCategory isActive')
      .populate('pricingId')
      .sort(sort === 'relevance' ? { score: { $meta: 'textScore' } } : sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean()
      .exec(),
    Product.countDocuments(query)
  ]);

  // Enhance products with comprehensive related data
  const enrichedProducts = await Promise.all(products.map(async (product) => {
    const [variations, stockInfo, specsInfo] = await Promise.all([
      ProductVariation.find({ productId: product._id })
        .populate('attributeValues.attributeId', 'name type')
        .lean(),
      ProductStock.find({ productId: product._id }).lean(),
      ProductSpecs.findOne({ productId: product._id }).lean()
    ]);

    // Calculate comprehensive stock metrics
    const totalStock = stockInfo.reduce((sum, stock) => sum + (stock.stockQty || 0), 0);
    const totalReserved = stockInfo.reduce((sum, stock) => sum + (stock.reservedQty || 0), 0);
    const availableStock = Math.max(0, totalStock - totalReserved);
    const lowStockThreshold = stockInfo.length > 0 ? Math.min(...stockInfo.map(s => s.lowStockThreshold || 0)) : 0;

    return {
      ...product,
      variations: variations || [],
      stock: {
        total: totalStock,
        available: availableStock,
        reserved: totalReserved,
        inStock: availableStock > 0,
        isLowStock: totalStock <= lowStockThreshold,
        lowStockThreshold,
        details: stockInfo || []
      },
      specifications: specsInfo ? specsInfo.specs : {},
      pricing: product.pricingId ? {
        basePrice: product.pricingId.basePrice,
        salePrice: product.pricingId.salePrice,
        cost: product.pricingId.cost,
        currency: product.pricingId.currency,
        marginAmount: product.pricingId.marginAmount,
        marginPercent: product.pricingId.marginPercent
      } : null,
      codes: {
        qrCodeUrl: product.qrCodeUrl,
        barcodeUrl: product.barcodeUrl,
        qrPayload: product.qrPayload,
        barcodePayload: product.barcodePayload
      },
      identifiers: {
        sku: product.sku,
        barcode: product.barcode,
        qrCode: product.qrCode,
        scanId: product.scanId
      },
      category: product.categoryId ? {
        id: product.categoryId._id,
        name: product.categoryId.name,
        slug: product.categoryId.slug,
        level: product.categoryId.level
      } : null,
      status: {
        active: product.status === 'active',
        visible: product.visibility === 'public',
        featured: product.featured || product.isFeatured,
        availability: product.availability
      },
      // Include search relevance score
      relevanceScore: product.score
    };
  }));

  res.status(200).json({
    success: true,
    data: enrichedProducts,
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
  if (!shopId) return res.status(400).json({ success: false, message: 'Shop ID is required' });

  // Enforce Upload Limits
  const newImages = req.body.images || [];
  const newVideos = req.body.videos || [];

  if (newImages.length > 5) {
    return res.status(400).json({
      success: false,
      message: 'Product cannot have more than 5 images',
      currentCount: newImages.length,
      maxLimit: 5
    });
  }

  if (newVideos.length > 2) {
    return res.status(400).json({
      success: false,
      message: 'Product cannot have more than 2 videos',
      currentCount: newVideos.length,
      maxLimit: 2
    });
  }

  // Check if product exists (Logic for smart-create decision);

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

  // Ensure provided category is level-3 and determine parent L2 name for specs validation
  const categoryDocForSmart = await Category.findById(category).lean();
  if (!categoryDocForSmart || categoryDocForSmart.level !== 3) {
    return res.status(400).json({ success: false, message: 'category must be a level-3 category' });
  }
  let parentL2Name = null;
  if (categoryDocForSmart.parentCategory) {
    const pdoc = await Category.findById(categoryDocForSmart.parentCategory).lean();
    parentL2Name = pdoc ? pdoc.name : null;
  }

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

      await existingProduct.save();

      // Persist audit entry as separate document
      try {
        await ProductAudit.create({
          productId: existingProduct._id,
          action: 'merge_restock',
          changedBy: req.user?.id || 'system',
          oldValue: { quantity: previousQuantity },
          newValue: { quantity: newQuantity, mergeReason: 'Smart product merge - same name, category, company, shop' },
          timestamp: new Date()
        });
      } catch (err) {
        logger.error('Failed to persist product audit entry (merge_restock):', err);
      }
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

  // Merge all product data (do NOT embed inventory directly on Product model)
  const productData = {
    ...otherProductData,
    name,
    category,
    companyId,
    shopId
  };

  const product = new Product(productData);

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

  // Handle Videos (URLs vs Files)
  const videoUrlsToSave = [];
  const videoFilesToProcess = [];

  if (Array.isArray(newVideos)) {
    newVideos.forEach(v => {
      // If it's a string, check if it's a URL
      if (typeof v === 'string') {
        if (v.startsWith('http') || v.startsWith('www')) {
          videoUrlsToSave.push(v);
        } else {
          // Assume base64 or raw data string for upload
          videoFilesToProcess.push({ buffer: Buffer.from(v, 'base64'), format: 'mp4' }); // Default to mp4 if no format provided
        }
      } else if (v.url) {
        // Object with URL
        videoUrlsToSave.push(v.url);
      } else if (v.buffer || v.data) {
        // Object with data
        videoFilesToProcess.push({
          buffer: v.buffer ? Buffer.from(v.buffer) : Buffer.from(v.data, 'base64'),
          format: v.format || 'mp4'
        });
      }
    });
  }

  product.videoUrls = videoUrlsToSave;

  await product.save();

  // Process video files async
  if (videoFilesToProcess.length > 0) {
    try {
      const { requestProductVideo } = require('../utils/events/documentRequests');
      videoFilesToProcess.forEach(vFile => {
        requestProductVideo(product._id.toString(), vFile.buffer, product.companyId, vFile.format)
          .catch(err => logger.warn(`Failed to req video upload for ${product._id}`, err));
      });
    } catch (err) {
      logger.warn('Failed to init video upload process', err);
    }
  }

  // Ensure SKU-only payloads for QR/barcode
  try {
    if (product.sku) {
      await Product.updateOne({ _id: product._id }, { $set: { qrPayload: product.sku, barcodePayload: product.sku } });
      product.qrPayload = product.sku;
      product.barcodePayload = product.sku;
    }
  } catch (err) {
    logger.warn('Failed to set SKU-only payloads for QR/barcode (smart-create):', err.message || err);
  }

  // If inventory info was provided in the request, create ProductStock and initial StockChange
  try {
    const stockPayload = req.body.stock || (req.body.lowStockThreshold || req.body.initialQuantity ? { lowStockThreshold: req.body.lowStockThreshold } : null);
    const initialQty = parseInt(quantity || 0);
    if (stockPayload) {
      await ProductStock.create(Object.assign({}, stockPayload, { productId: product._id }));
      if (initialQty && initialQty > 0) {
        try {
          await StockChange.create({
            companyId: product.companyId,
            shopId: product.shopId,
            productId: product._id,
            type: 'restock',
            qty: Math.abs(initialQty),
            previous: 0,
            reason: 'Initial stock on smart-create',
            userId: req.user?.id || 'system'
          });
        } catch (e) { logger.warn('Failed to create initial StockChange (smart-create):', e.message || e); }
      }
    }
  } catch (e) { logger.warn('ProductStock creation (smart-create) failed:', e.message || e); }

  // Persist product specs (if provided)
  try {
    const specsObj = {};
    if (Array.isArray(req.body.specs)) req.body.specs.forEach(s => { if (s && s.name) specsObj[s.name] = s.value; });
    if (Array.isArray(req.body.attributes)) req.body.attributes.forEach(a => { if (a && a.name) specsObj[a.name] = a.value; });
    const mapping = categoryValidationService.findL2MappingByName(parentL2Name);
    if (mapping && mapping.commonFields) mapping.commonFields.forEach(f => { if (req.body[f] !== undefined) specsObj[f] = req.body[f]; });
    if (Object.keys(specsObj).length > 0) {
      await ProductSpecs.create({ productId: product._id, l2Category: parentL2Name, specs: specsObj });
    }
  } catch (e) { logger.warn('Failed to persist ProductSpecs (smart-create):', e.message || e); }

  // Create audit entry instead of pushing into non-existent auditTrail
  try {
    await ProductAudit.create({ productId: product._id, action: 'create', changedBy: req.user?.id || 'system', newValue: req.body, timestamp: new Date() });
  } catch (e) { logger.warn('Failed to persist audit (smart-create):', e.message || e); }

  // Generate and upload Barcode and QR Code images (async via event)
  try {
    const { requestQRCode, requestBarcode } = require('../utils/events/documentRequests');
    await Promise.all([
      requestQRCode(product._id.toString(), product.sku, product.companyId),
      requestBarcode(product._id.toString(), product.sku, product.companyId)
    ]);
  } catch (err) {
    logger.error('Failed to request barcode/QR code generation (smart-create):', err);
  }
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
    // Decode base64 payload
    const decodedBuffer = Buffer.from(payload, 'base64');
    const decodedString = decodedBuffer.toString('utf-8');

    // Try parse JSON — if it's an object with sku, or if it's a plain sku string, lookup the product
    let parsed = null;
    try {
      parsed = JSON.parse(decodedString);
    } catch (e) {
      // not JSON, leave parsed as null
    }

    // If parsed is an object and contains sku, try to fetch product by sku
    if (parsed && typeof parsed === 'object') {
      if (parsed.sku) {
        const found = await Product.findOne({ sku: String(parsed.sku).toUpperCase() }).lean();
        return res.status(200).json({ success: true, message: 'Product scanned (sku)', data: found || parsed, scannedAt: new Date().toISOString() });
      }
      // return parsed object as-is
      return res.status(200).json({ success: true, message: 'Decoded object from scan', data: parsed, scannedAt: new Date().toISOString() });
    }

    // If not JSON, treat decodedString as SKU or scanId
    const plain = decodedString.trim();
    if (plain) {
      const found = await Product.findOne({ $or: [{ sku: plain.toUpperCase() }, { barcode: plain }, { scanId: plain }] }).lean();
      return res.status(200).json({ success: true, message: 'Product scanned', data: found || plain, scannedAt: new Date().toISOString() });
    }
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

// ------------------ Bulk endpoints ------------------

const bulkCreateProducts = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : (req.body.products || []);
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Request body must be an array of products or { products: [] }' });
  }

  const results = [];



  // Pre-check duplicates within batch by companyId + lowercased name
  // const batchNameMap = new Map();
  // for (const it of items) {
  //   const key = `${it.shopId || ''}::${(it.name || '').trim().toLowerCase()}`;
  //   batchNameMap.set(key, (batchNameMap.get(key) || 0) + 1);
  // }

  // // Pre-query existing products that would conflict by (companyId, name)
  // const conflictQueries = items
  //   .filter(i => i.shopId && i.name)
  //   .map(i => ({ shopId: i.shopId, name: new RegExp(`^${i.name}$`, 'i') }));

  // let existingConflicts = [];
  // if (conflictQueries.length > 0) {
  //   existingConflicts = await Product.find({ $or: conflictQueries }).lean();
  // }




  // Process sequentially to avoid overwhelming DB; for larger batches consider streams
  for (const payload of items) {
    const itemRes = { input: payload, success: false };

    try {
      // ========== FIELD COLLECTION & NORMALIZATION ==========
      // Extract specialized fields from payload (similar to createProduct)
      const newImages = payload.images || [];
      const newVideos = payload.videos || [];

      // Normalize categoryId vs category field
      let categoryId = payload.categoryId || payload.category;

      // Basic required fields validation
      if (!payload.name || !categoryId || !payload.companyId || !payload.shopId) {
        itemRes.error = 'name, categoryId (or category), companyId and shopId are required';
        results.push(itemRes);
        continue;
      }

      // Image limit check (max 10 images per product)
      if (newImages.length > 10) {
        itemRes.error = `Cannot exceed 10 images per product (received ${newImages.length})`;
        results.push(itemRes);
        continue;
      }

      // // Batch duplicate check (shop-specific)
      // const batchKey = `${payload.shopId}::${payload.name.trim().toLowerCase()}`;
      // if (batchNameMap.get(batchKey) > 1) {
      //   itemRes.error = 'Duplicate product name in submitted batch for the same shop';
      //   results.push(itemRes);
      //   continue;
      // }

      // // Existing DB conflict check (shop-specific)
      // const conflict = existingConflicts.find(c => String(c.shopId) === String(payload.shopId) && String(c.name).toLowerCase() === String(payload.name).toLowerCase());
      // if (conflict) {
      //   itemRes.error = 'Product with this name already exists in the shop';
      //   results.push(itemRes);
      //   continue;
      // }

      // ========== CATEGORY VALIDATION ==========
      validateMongoId(categoryId);
      const categoryDoc = await Category.findById(categoryId).lean();
      if (!categoryDoc || categoryDoc.level !== 3) {
        itemRes.error = 'Invalid category: must be a level-3 category';
        results.push(itemRes);
        continue;
      }

      const parentL2Id = categoryDoc.parentCategory;
      if (!parentL2Id) {
        itemRes.error = 'L3 category must have a valid L2 parent category';
        results.push(itemRes);
        continue;
      }

      // Validate parent L2 category exists and is active
      const parentDoc = await Category.findById(parentL2Id).lean();
      if (!parentDoc) {
        itemRes.error = 'Parent L2 category has been deleted; cannot create product with orphaned category';
        results.push(itemRes);
        continue;
      }
      if (!parentDoc.isActive) {
        itemRes.error = 'Parent L2 category is inactive; cannot create product';
        results.push(itemRes);
        continue;
      }
      const parentL2Name = parentDoc.name;

      // Validate payload against L2 mapping (if mapping exists)
      try {
        const validation = await categoryValidationService.validateProductPayloadAgainstL2(payload, parentL2Name);
        if (validation.mappingFound && !validation.valid) {
          itemRes.error = `Missing required category-specific fields: ${validation.errors.join(', ')}`;
          results.push(itemRes);
          continue;
        }
      } catch (err) {
        logger.warn('BulkCreate: Category validation service error:', err?.message || err);
        // Continue anyway - do not block creation
      }

      // ========== PRODUCT DOCUMENT CREATION ==========
      // Create product payload with normalized categoryId
      const productPayload = Object.assign({}, payload);
      productPayload.categoryId = categoryId;
      delete productPayload.category;
      delete productPayload.images;
      delete productPayload.videos;
      delete productPayload.pricing;
      delete productPayload.stock;
      delete productPayload.inventory;
      delete productPayload.specs;
      delete productPayload.attributes;

      const productDoc = new Product(productPayload);

      // Process and attach images with proper structure
      productDoc.images = newImages.map((img, idx) => ({
        url: img.url,
        cloudinary_id: img.cloudinary_id,
        type: img.type || 'image',
        format: img.format,
        size: img.size,
        altText: img.altText || img.alt,
        isPrimary: img.isPrimary || (idx === 0),
        sortOrder: img.sortOrder !== undefined ? img.sortOrder : idx
      }));

      // Process and attach video URLs
      productDoc.videoUrls = newVideos.map(v => v.url || v);

      // Save product (triggers pre-save middleware for auto-generation)
      await productDoc.save();

      // ========== PRICING PERSISTENCE ==========
      if (payload.pricing) {
        const pricingPayload = Object.assign({}, payload.pricing);
        if (pricingPayload.basePrice === undefined || pricingPayload.basePrice === null) {
          await Product.updateOne({ _id: productDoc._id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });
          itemRes.error = 'pricing.basePrice is required';
          results.push(itemRes);
          continue;
        }
        try {
          const pricingDoc = await ProductPricing.create(Object.assign({}, pricingPayload, {
            productId: productDoc._id,
            companyId: productDoc.companyId
          }));
          productDoc.pricingId = pricingDoc._id;
          await productDoc.save();
        } catch (err) {
          await Product.updateOne({ _id: productDoc._id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });
          itemRes.error = `Failed to create pricing: ${err.message || err}`;
          results.push(itemRes);
          continue;
        }
      }

      // ========== STOCK PERSISTENCE ==========
      try {
        const inventoryData = payload.inventory || payload.stock || {};
        const initialQty = parseInt(
          payload.initialQuantity ||
          payload.quantity ||
          inventoryData.quantity ||
          0
        );

        const stockData = {
          productId: productDoc._id,
          variationId: null, // Master product stock
          stockQty: initialQty,
          lowStockThreshold: payload.lowStockThreshold || inventoryData.lowStockThreshold || 10,
          minReorderQty: payload.minReorderQty || inventoryData.minReorderQty || 20,
          trackQuantity: payload.trackQuantity !== undefined ? payload.trackQuantity :
            (inventoryData.trackQuantity !== undefined ? inventoryData.trackQuantity : true),
          allowBackorder: payload.allowBackorder !== undefined ? payload.allowBackorder :
            (inventoryData.allowBackorder !== undefined ? inventoryData.allowBackorder : false),
          ...inventoryData
        };

        await ProductStock.create(stockData);

        if (initialQty && initialQty > 0) {
          await StockChange.create({
            companyId: productDoc.companyId,
            shopId: productDoc.shopId,
            productId: productDoc._id,
            type: 'restock',
            qty: Math.abs(initialQty),
            previous: 0,
            new: Math.abs(initialQty),
            reason: 'Initial stock on bulk product creation',
            userId: req.user?.id || 'system'
          });
        }
      } catch (err) {
        logger.warn('BulkCreate: failed to persist stock for product', err.message || err);
      }

      // ========== PRODUCT SPECS PERSISTENCE ==========
      try {
        const specsObj = {};

        // Collect specs from specs array
        if (Array.isArray(payload.specs)) {
          payload.specs.forEach(s => { if (s && s.name) specsObj[s.name] = s.value; });
        }

        // Collect specs from attributes array
        if (Array.isArray(payload.attributes)) {
          payload.attributes.forEach(a => { if (a && a.name) specsObj[a.name] = a.value; });
        }

        // Include any top-level mapped fields from L2 category mapping
        const mapping = categoryValidationService.findL2MappingByName(parentL2Name);
        if (mapping && mapping.commonFields) {
          mapping.commonFields.forEach((f) => {
            if (payload[f] !== undefined) specsObj[f] = payload[f];
          });
        }

        // Persist specs if there's something to store
        if (Object.keys(specsObj).length > 0) {
          await ProductSpecs.create({ productId: productDoc._id, l2Category: parentL2Name, specs: specsObj });
        }
      } catch (err) {
        logger.warn('BulkCreate: failed to persist specs', err.message || err);
      }

      // ========== AUDIT ENTRY PERSISTENCE ==========
      try {
        await ProductAudit.create({
          productId: productDoc._id,
          action: 'create',
          changedBy: req.user?.id || 'system',
          newValue: payload,
          timestamp: new Date()
        });
      } catch (err) {
        logger.warn('BulkCreate: failed to persist audit entry', err.message || err);
      }

      // Audit entry
      try {
        await ProductAudit.create({ productId: productDoc._id, action: 'create', changedBy: req.user?.id || 'system', newValue: payload, timestamp: new Date() });
      } catch (err) {
        logger.warn('BulkCreate: failed to persist audit', err.message || err);
      }

      // Success for this item
      itemRes.success = true;
      itemRes.data = productDoc;
      results.push(itemRes);

      // Background tasks per created product (non-blocking)
      setImmediate(() => {
        try {
          // Category stats
          if (productDoc.category) {
            Category.updateOne({ _id: productDoc.category }, { $inc: { 'statistics.totalProducts': 1 } }).catch(() => { });
          }

          // Trigger document generation (QR/Barcode)
          // We require inside the function or file top-level. Since this is inside a loop/function, requiring at top is better, but safe here if not already imported.
          // Ideally imports should be at top, but to minimize diff noise we can require here if needed, or better, rely on the fact that we can edit the top of file too.
          // Checking file content: line 1832 in singleCreate uses require inside function. We will follow that pattern or check top level.
          // Let's use require here to be safe and consistent with singleCreate.
          const { requestQRCode, requestBarcode } = require('../utils/events/documentRequests');

          Promise.all([
            requestQRCode(productDoc._id.toString(), productDoc.sku, productDoc.companyId),
            requestBarcode(productDoc._id.toString(), productDoc.sku, productDoc.companyId)
          ]).catch(docErr => logger.warn(`BulkCreate: doc gen error for ${productDoc._id}`, docErr));

          // Cache invalidation and create outbox event for reliable publishing
          scanDel('products:*').catch(() => { });
          // Use Outbox pattern to enqueue event for dispatcher
          productEvents.created(productDoc, productDoc.companyId).catch(() => { });
        } catch (e) {
          logger.warn('BulkCreate: background task error', e.message || e);
        }
      });

    } catch (err) {
      logger.error('BulkCreate: unexpected error creating product', err);
      itemRes.error = err.message || err;
      results.push(itemRes);
    }
  }

  res.status(207).json({ success: true, results });
});

const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : (req.body.products || []);
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: 'Request body must be an array of update objects' });

  const results = [];

  for (const op of items) {
    const itemRes = { input: op, success: false };
    try {
      const { id, ...changes } = op;
      if (!id) { itemRes.error = 'id is required for updates'; results.push(itemRes); continue; }

      // Validate MongoDB ID format
      try {
        validateMongoId(id);
      } catch (err) {
        itemRes.error = 'Invalid product ID format';
        results.push(itemRes);
        continue;
      }

      const existing = await Product.findById(id).lean();
      if (!existing) { itemRes.error = 'Product not found'; results.push(itemRes); continue; }

      // Prevent SKU change
      if (changes.sku && changes.sku !== existing.sku) {
        itemRes.error = 'SKU cannot be modified after creation';
        results.push(itemRes);
        continue;
      }

      // If changing name, ensure uniqueness within company
      if (changes.name && changes.name !== existing.name) {
        const dup = await Product.findOne({
          _id: { $ne: id },
          companyId: existing.companyId,
          name: changes.name
        }).lean();
        if (dup) {
          itemRes.error = 'Another product with this name exists in company';
          results.push(itemRes);
          continue;
        }
      }

      // Category validation if present (handle both categoryId and category fields)
      const newCategoryId = changes.categoryId || changes.category;
      if (newCategoryId && newCategoryId !== String(existing.categoryId)) {
        try {
          validateMongoId(newCategoryId);
        } catch (err) {
          itemRes.error = 'Invalid category ID format';
          results.push(itemRes);
          continue;
        }

        const newCat = await Category.findById(newCategoryId).lean();
        if (!newCat || newCat.level !== 3) {
          itemRes.error = 'Invalid category: must be level-3';
          results.push(itemRes);
          continue;
        }
        if (!newCat.parentCategory) {
          itemRes.error = 'L3 category must have L2 parent';
          results.push(itemRes);
          continue;
        }

        // Normalize to categoryId
        changes.categoryId = newCategoryId;
        delete changes.category;
      }

      // Images handling: combine existing images with new ones if provided
      let updatePayload = Object.assign({}, changes);
      if (Array.isArray(changes.images)) {
        if (changes.images.length > 10) {
          itemRes.error = 'Cannot exceed 10 images per product';
          results.push(itemRes);
          continue;
        }
        const existingImages = existing.images || [];
        const totalImages = existingImages.length + changes.images.length;

        if (totalImages > 10) {
          itemRes.error = `Total images would exceed 10 (existing: ${existingImages.length}, new: ${changes.images.length})`;
          results.push(itemRes);
          continue;
        }

        // Process new images
        const processedImages = changes.images.map((img, idx) => ({
          url: img.url || img,
          cloudinary_id: img.cloudinary_id,
          type: img.type || 'image',
          altText: img.altText || img.alt,
          isPrimary: img.isPrimary || false,
          sortOrder: existingImages.length + idx
        }));

        updatePayload.images = [...existingImages, ...processedImages];
      }

      // Video handling
      if (Array.isArray(changes.videos)) {
        const existingVideos = existing.videoUrls || [];
        const newVideoUrls = changes.videos.map(v => v.url || v);
        updatePayload.videoUrls = [...existingVideos, ...newVideoUrls];
        delete updatePayload.videos;
      }

      // Perform the update
      const updatedProduct = await Product.findByIdAndUpdate(
        id,
        updatePayload,
        { new: true, runValidators: true }
      ).populate('categoryId', 'name slug')
        .populate('pricingId');

      if (!updatedProduct) {
        itemRes.error = 'Product not found after update';
        results.push(itemRes);
        continue;
      }

      // Update related data if provided
      if (changes.pricing && updatedProduct.pricingId) {
        try {
          await ProductPricing.findByIdAndUpdate(
            updatedProduct.pricingId,
            changes.pricing,
            { runValidators: true }
          );
        } catch (err) {
          logger.warn(`Failed to update pricing for product ${id}:`, err.message);
        }
      }

      if (changes.inventory || changes.stock) {
        try {
          const stockData = changes.inventory || changes.stock;
          await ProductStock.findOneAndUpdate(
            { productId: id },
            stockData,
            { upsert: true, runValidators: true }
          );
        } catch (err) {
          logger.warn(`Failed to update stock for product ${id}:`, err.message);
        }
      }

      // Create audit entry
      try {
        await ProductAudit.create({
          productId: id,
          action: 'bulk_update',
          changedBy: req.user?.id || 'system',
          oldValue: existing,
          newValue: changes,
          timestamp: new Date()
        });
      } catch (err) {
        logger.warn(`Failed to create audit entry for product ${id}:`, err.message);
      }

      itemRes.success = true;
      itemRes.data = updatedProduct;
      results.push(itemRes);

    } catch (err) {
      itemRes.error = err.message || 'Update failed';
      results.push(itemRes);
    }
  }

  // Invalidate caches asynchronously
  setImmediate(() => {
    scanDel('products:*').catch((err) => logger.error('Bulk update cache cleanup failed:', err));
  });

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  res.status(207).json({
    success: true,
    message: `Bulk update completed: ${successCount} successful, ${failureCount} failed`,
    summary: {
      total: results.length,
      successful: successCount,
      failed: failureCount
    },
    results
  });
});

const bulkDeleteProducts = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body) ? req.body : (req.body.ids || []);
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, message: 'Request body must be an array of product ids or { ids: [] }' });

  const results = [];

  for (const id of ids) {
    const itemRes = { id, success: false };
    try {
      validateMongoId(id);
      const product = await Product.findById(id).lean();
      if (!product) { itemRes.error = 'Product not found'; results.push(itemRes); continue; }

      await Product.updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || 'system' } });
      itemRes.success = true; itemRes.data = { _id: id };
      results.push(itemRes);

      setImmediate(async () => {
        try {
          // Trigger document service cleanup via event if needed
          // For now, soft delete doesn't require immediate file destruction
          // TODO: Implement 'document.product.deleted' event handling in document-service if file cleanup is required
        } catch (e) { logger.warn('BulkDelete: cleanup warning', e.message || e); }
      });

      // Category stat decrement, cache invalidation and event
      if (product.category) Category.updateOne({ _id: product.category }, { $inc: { 'statistics.totalProducts': -1 } }).catch(() => { });
      delCache(`product:${id}`).catch(() => { });
      delCache(`product:slug:${product.slug}`).catch(() => { });
      scanDel('products:*').catch(() => { });
      publishProductEvent('inventory.product.deleted', { _id: id, ...product }).catch(() => { });

    } catch (err) {
      logger.error('BulkDelete: unexpected error', err);
      itemRes.error = err.message || err; results.push(itemRes);
    }
  }

  res.status(207).json({ success: true, results });
});


const deleteAllProducts = asyncHandler(async (req, res) => {
  try {
    // Delete all products
    await Product.deleteMany({});

    // Delete related data to maintain integrity
    await ProductStock.deleteMany({});
    await ProductPricing.deleteMany({});
    await ProductVariation.deleteMany({});
    await ProductSpecs.deleteMany({});

    // Clear all product-related cache
    await scanDel('products:*');
    await scanDel('product:*');

    res.status(200).json({
      success: true,
      message: 'All products and related data (stocks, pricing, variations, specs) have been permanently deleted.'
    });
  } catch (error) {
    logger.error('DeleteAllProducts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all products',
      error: error.message
    });
  }
});

module.exports = {
  getAllProducts,
  getProductById,
  getProductBySlug,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteAllProducts, // Export the new function
  updateInventory,
  getLowStockProducts,
  getScheduledProducts,
  getFeaturedProducts,
  searchProducts,
  getOldUnboughtProducts,
  smartCreateProduct,
  bulkCreateProducts,
  bulkUpdateProducts,
  bulkDeleteProducts,
  checkProductDuplicate,
  scanProduct,
  lookupByBarcode
};