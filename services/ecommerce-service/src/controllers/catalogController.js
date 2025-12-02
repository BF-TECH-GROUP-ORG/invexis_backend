const { search: listProducts, findByProductId: getProduct, create: createProduct, update: updateProduct, deleteProduct } = require('../services/catalogService');
const { catalogProductSchema, paginationSchema } = require('../utils/app');
const Catalog = require('../models/Catalog.models');
const cache = require('../utils/cache');

exports.listProducts = async (req, res) => {
  try {
    const { companyId, shopId, status, page, limit, category, keyword, sortBy, sortOrder } = req.query;

    // Validate pagination
    const { error, value } = paginationSchema.validate({ page, limit, sortBy, sortOrder }, { stripUnknown: true });
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });

    // Build query object for public product listing
    const query = {};

    // Optional filters - NO REQUIRED FILTERS (return all products by default for public storefront)
    if (status) query.status = status;
    if (companyId) query.companyId = companyId;
    if (shopId) query.shopId = shopId;
    if (category) query.categoryId = category;
    if (keyword) {
      // Text search on name and description
      query.$text = { $search: keyword };
    }

    // Get products - public endpoint, no authentication required
    const products = await listProducts(query, {
      page: value.page,
      limit: value.limit,
      sort: value.sortBy ? { [value.sortBy]: value.sortOrder === 'asc' ? 1 : -1, featured: -1 } : { featured: -1 }
    });

    // Log for debugging
    console.log('📦 Catalog Query:', { query, pagination: { page: value.page, limit: value.limit } });
    console.log('📦 Products found:', products?.length || 0);

    res.json({
      success: true,
      data: products || [],
      pagination: {
        page: value.page,
        limit: value.limit,
        total: products?.length || 0
      }
    });
  } catch (err) {
    console.error('❌ Error in listProducts:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { companyId } = req.query;

    // No companyId validation - public endpoint
    console.log('🔍 Fetching product:', { productId, companyId });

    const product = await getProduct(productId, companyId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `Product ${productId} not found`
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (err) {
    console.error('❌ Error in getProduct:', err);
    res.status(err.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: err.message
    });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { error, value } = catalogProductSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { companyId } = req.user;
    const product = await createProduct(companyId, value);
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { error, value } = catalogProductSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { id: productId } = req.params;
    const { companyId } = req.user;
    const product = await updateProduct(productId, companyId, value);
    res.json(product);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id: productId } = req.params;
    const { companyId } = req.user;
    const result = await deleteProduct(productId, companyId);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};

/**
 * DEBUG ENDPOINT: Check database and cache status
 * GET /ecommerce/products/debug/status
 */
exports.debugStatus = async (req, res) => {
  try {
    console.log('🔍 DEBUG: Checking catalog database and cache...');

    // Check database count
    const totalCount = await Catalog.countDocuments();
    const activeCount = await Catalog.countDocuments({ isDeleted: false });
    const sampleProducts = await Catalog.find().limit(5).lean();

    console.log(`📊 Database Stats:
    - Total records: ${totalCount}
    - Active records: ${activeCount}
    - Sample: ${JSON.stringify(sampleProducts, null, 2)}`);

    // Check cache
    const cacheKeys = await cache.keys('catalog:*');

    res.json({
      success: true,
      debug: {
        database: {
          totalCount,
          activeCount,
          sampleProducts: sampleProducts.slice(0, 2)
        },
        cache: {
          keysCount: cacheKeys?.length || 0,
          keys: cacheKeys?.slice(0, 10) || []
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ DEBUG ERROR:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
};