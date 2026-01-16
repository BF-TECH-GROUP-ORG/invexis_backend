// Manual async wrapper instead of express-async-handler
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const Alert = require('../models/Alert');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const Category = require('../models/Category');
const { validateMongoId } = require('../utils/validateMongoId');
const logger = require('../utils/logger');
const { getCache, setCache, scanDel, delCache } = require('../utils/redisHelper');
const ProductVariation = require('../models/ProductVariation');
const AnalyticsService = require('../services/analyticsService'); // Added AnalyticsService import
const ProductStock = require('../models/ProductStock');
const ProductPricing = require('../models/ProductPricing');
const ProductTransfer = require('../models/ProductTransfer');
const { formatEnrichedProduct } = require('../utils/productFormatter');
const InventoryAnalyticsService = require('../services/inventoryAnalyticsService');
const ProductSpecs = require('../models/productSpecs');
const { publishProductEvent } = require('../events/productEvents');
// Helper: sanitize product data before creating destination product copies
// Delete unique/indexed fields so Product pre-save hooks regenerate them with new unique values
// transferType: 'intra_company' or 'cross_company'
function sanitizeDestinationProductData(data, transferType = 'cross_company') {
    // Fields that MUST be deleted so pre-save hooks regenerate them with unique values
    const fieldsToDelete = [
        '_id',
        'slug',            // Will be auto-generated from name in pre-save
        'sku',             // Will be auto-generated in pre-save with ensureUnique
        'barcode',         // Will be set to SKU in pre-save
        'scanId',          // Will be auto-generated in pre-save with ensureUnique
        'asin',            // Will be auto-generated in pre-save with ensureUnique
        'upc',             // Will be auto-generated in pre-save
        'barcodePayload',  // Will be regenerated from full product object in pre-save
        'qrPayload',       // Will be regenerated from full product object in pre-save
        'qrCode',          // Will be regenerated
        'qrCodeUrl',       // Will be regenerated
        'qrCloudinaryId',  // Cloudinary ID doesn't apply to new product
        'barcodeUrl',      // Will be regenerated
        'barcodeCloudinaryId', // Cloudinary ID doesn't apply to new product
        'pricingId'        // New pricing will be created separately
    ];

    fieldsToDelete.forEach((f) => { if (f in data) delete data[f]; });

    // Reset soft-delete flags (destination product is active, not deleted)
    data.isDeleted = false;
    data.deletedAt = null;
    data.deletedBy = null;

    // Reset sales metrics for destination product
    if (data.sales) {
        data.sales.totalSold = 0;
        data.sales.revenue = 0;
    }

    // For cross-company transfers, do NOT share supplier name (it's company-specific)
    // For intra-company transfers, share the supplier name
    if (transferType === 'cross_company') {
        data.supplierName = null;
    }

    return data;
}

/**
 * Replicate variations and create corresponding ProductStock records for destination product
 * - Copies all ProductVariation documents for source product to destination product
 * - Copies stock defaults from source variation stocks where available
 * - Creates ProductStock records for each new variation with receivedQty if provided
 *
 * @param {ObjectId} sourceProductId
 * @param {ObjectId} destinationProductId
 * @param {String} destCompanyId
 * @param {String} destShopId
 * @param {Number} masterReceivedQty - quantity received for master product (used if no per-variation quantities provided)
 * @param {Object} variationReceivedMap - optional map of sourceVariationId -> qty received
 */
async function replicateVariationsAndStocks(sourceProductId, destinationProductId, destCompanyId, destShopId, masterReceivedQty = 0, variationReceivedMap = null) {
    try {
        const sourceVariations = await ProductVariation.find({ productId: sourceProductId }).lean();
        if (!sourceVariations || sourceVariations.length === 0) return;

        // Preload source variation stocks keyed by variationId
        const sourceVarIds = sourceVariations.map(v => v._id);
        const sourceStocks = await ProductStock.find({ productId: sourceProductId, variationId: { $in: sourceVarIds } }).lean();
        const stockByVariation = {};
        for (const s of sourceStocks) stockByVariation[String(s.variationId)] = s;

        for (const srcVar of sourceVariations) {
            const varObj = Object.assign({}, srcVar);
            const originalVarId = varObj._id;
            delete varObj._id;
            varObj.productId = destinationProductId;

            // Create new variation
            let createdVar;
            try {
                createdVar = await ProductVariation.create(varObj);
            } catch (err) {
                logger.error('Failed to create product variation for destination product:', err);
                continue;
            }

            // Prepare stock for this variation from source
            const sourceStock = stockByVariation[String(originalVarId)];

            // Determine received quantity for this variation
            let receivedQty = 0;
            if (variationReceivedMap && variationReceivedMap[String(originalVarId)] !== undefined) {
                receivedQty = Number(variationReceivedMap[String(originalVarId)]) || 0;
            }

            // If no per-variation quantities provided, keep variation stock 0 and use masterReceivedQty on product-level stock
            const stockQty = receivedQty;

            try {
                await ProductStock.create({
                    productId: destinationProductId,
                    variationId: createdVar._id,
                    shopId: destShopId,
                    companyId: destCompanyId,
                    stockQty,
                    reservedQty: 0,
                    trackQuantity: sourceStock ? (sourceStock.trackQuantity !== undefined ? sourceStock.trackQuantity : true) : true,
                    lowStockThreshold: sourceStock ? sourceStock.lowStockThreshold || 10 : 10,
                    allowBackorder: sourceStock ? sourceStock.allowBackorder || false : false,
                    minReorderQty: sourceStock ? sourceStock.minReorderQty || 20 : 20,
                    safetyStock: sourceStock ? sourceStock.safetyStock || 0 : 0,
                    supplierLeadDays: sourceStock ? sourceStock.supplierLeadDays || 7 : 7,
                    // Forecasting fields - reset for new variation
                    avgDailySales: 0,
                    stockoutRiskDays: 0,
                    suggestedReorderQty: sourceStock ? sourceStock.minReorderQty || 20 : 20,
                    lastRestockDate: new Date(),
                    lastForecastUpdate: new Date(),
                    // Analytics reset for new variation
                    totalUnitsSold: 0,
                    totalRevenue: 0,
                    avgCost: sourceStock ? sourceStock.avgCost || 0 : 0,
                    profitMarginPercent: sourceStock ? sourceStock.profitMarginPercent || 0 : 0
                });
            } catch (err) {
                logger.error('Failed to create product stock for variation on destination product:', err);
            }
        }
    } catch (err) {
        logger.error('Error replicating variations and stocks:', err);
    }
}

/**
 * Replicate product specifications for destination product
 * @param {ObjectId} sourceProductId 
 * @param {ObjectId} destinationProductId 
 */
async function replicateProductSpecs(sourceProductId, destinationProductId) {
    try {
        const sourceSpecs = await ProductSpecs.findOne({ productId: sourceProductId }).lean();
        if (!sourceSpecs) {
            logger.info(`ℹ️ No specifications found for source product ${sourceProductId}`);
            return;
        }

        const specsObj = { ...sourceSpecs };
        delete specsObj._id;
        delete specsObj.createdAt;
        delete specsObj.updatedAt;
        specsObj.productId = destinationProductId;

        await ProductSpecs.create(specsObj);
        logger.info(`✓ Replicated specifications for destination product ${destinationProductId}`);
    } catch (err) {
        logger.error(`❌ Failed to replicate specs from ${sourceProductId} to ${destinationProductId}:`, err.message);
    }
}
// ==================== COMPANY LEVEL OPERATIONS ====================

/**
 * @desc    Get company-wide inventory overview
 * @route   GET /api/v1/companies/:companyId/overview
 * @access  Private
 */
const getCompanyOverview = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Try cache first
    const cacheKey = `company:overview:${companyId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    // 1. Get Inventory Snapshot from centralized service
    // This utilizes ProductStock aggregation correctly (including lowStock, outOfStock)
    const snapshot = await AnalyticsService.getInventorySnapshot(companyId);

    // 2. Counts not in snapshot
    // Total products (documents) - Snapshot returns totalSKUs from ProductStock, which might differ slightly if stocks missing
    // But for overview, Product.countDocuments is fine.
    const totalProducts = await Product.countDocuments({ companyId });

    // Active alerts
    const activeAlerts = await Alert.countDocuments({ companyId, isResolved: false });

    // Pending adjustments
    const pendingAdjustments = await InventoryAdjustment.countDocuments({ companyId, status: 'pending' });

    const response = {
        companyId,
        totalProducts,
        totalStock: snapshot.totalUnits,
        totalValue: snapshot.totalCostValue.toFixed(2), // Use cost value as standard inventory value
        lowStockCount: snapshot.lowStockUnits,
        outOfStockCount: snapshot.outOfStockUnits,
        activeAlerts,
        pendingAdjustments,
        lastUpdated: new Date()
    };

    // Cache short-lived overview for faster GETs
    setCache(cacheKey, response, 60).catch(() => { logger.error('Failed to set cache for company overview'); });

    res.json({ success: true, data: response });
});

/**
 * @desc    Get all products for a company
 * @route   GET /api/v1/companies/:companyId/products
 * @access  Private
 */
const getCompanyProducts = asyncHandler(async (req, res) => {
    const { companyId } = req.params || req.body || req.query;
    let { page = 1, limit = 100, status, visibility, category, brand, search } = req.query;

    page = parseInt(page);
    limit = Math.min(parseInt(limit) || 100, 100);
    const skip = (page - 1) * limit;

    const cacheKey = `company:products:${companyId}:page:${page}:limit:${limit}:status:${status || ''}:vis:${visibility || ''}:cat:${category || ''}:brand:${brand || ''}:q:${search || ''}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ success: true, data: cached.data, pagination: cached.pagination });

    const query = { companyId };
    if (status) query.status = status;
    if (visibility) query.visibility = visibility;
    if (category) query.categoryId = category;
    if (brand) query.brand = new RegExp(brand, 'i');
    if (search) query.$text = { $search: search };

    const products = await Product.find(query)
        .populate('categoryId', 'name slug level attributes parentCategory isActive')
        .populate('pricingId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await Product.countDocuments(query);

    // Enhance products with additional data using shared formatter
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

    const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
    };

    // Cache page for a short TTL
    setCache(cacheKey, { data: enrichedProducts, pagination }, 60).catch(() => { logger.error('Failed to set cache for company products'); });

    res.json({ success: true, data: enrichedProducts, pagination });
});

/**
 * @desc    Get a single product by its SKU for a company (ULTRA-FAST POS <50ms with cache)
 * @route   GET /api/v1/companies/:companyId/products/sku/:sku
 * @access  Private
 * 
 * Performance targets:
 * - Cache hit: ~5-8ms (Redis retrieval)
 * - Cache miss: ~30-50ms (optimized DB queries)
 * - Uses indexes on {companyId, sku} and product lookups
 */
const getProductBySku = asyncHandler(async (req, res) => {
    const { companyId, sku } = req.params || req.body || req.query;

    if (!companyId || !sku) {
        return res.status(400).json({ success: false, message: 'companyId and sku are required' });
    }

    const skuUpper = sku.toUpperCase();
    const cacheKey = `pos:${companyId}:${skuUpper}`;

    // L1 Cache: Redis (instant - 5-8ms)
    try {
        const cached = await getCache(cacheKey);
        if (cached) {
            return res.json({ success: true, data: cached }).end();
        }
    } catch (cacheErr) {
        // Non-blocking - continue to DB if cache fails
        logger.debug(`Cache miss for ${cacheKey}`);
    }

    // Optimized single query with selective field projection (required for speed)
    const product = await Product.findOne(
        { companyId, sku: skuUpper },
        {
            _id: 1,
            name: 1,
            sku: 1,
            categoryId: 1,
            pricingId: 1,
            description: 1,
            images: 1,
            status: 1
        }
    )
        .populate('categoryId', 'name slug level')
        .populate('pricingId', 'basePrice salePrice cost')
        .lean()
        .hint({ companyId: 1, sku: 1 });

    if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Parallel load with lean() for maximum speed (all heavy lifting at DB level)
    const productId = product._id;
    const [variations, stockInfo, specsInfo] = await Promise.all([
        // Get variations with minimal fields
        ProductVariation.find({ productId }, '_id name attributeValues')
            .populate('attributeValues.attributeId', 'name')
            .lean()
            .hint({ productId: 1 }),
        // Get stock for all shops (cached frequently)
        ProductStock.findOne({ productId }, 'stockQty reservedQty lowStockThreshold inStock shopId')
            .lean()
            .sort({ shopId: 1 })
            .hint({ productId: 1 }),
        // Get specs (optional, can be null)
        ProductSpecs.findOne({ productId }, 'specifications')
            .lean()
            .hint({ productId: 1 })
    ]);

    // Format enriched product (re-use same formatter for compatibility)
    const enriched = await formatEnrichedProduct(product, variations, stockInfo ? [stockInfo] : [], specsInfo);

    // L2 Cache: Set with aggressive TTL (5 minutes - frequent POS scans)
    // Non-blocking background cache write
    setCache(cacheKey, enriched, 300).catch(err => {
        logger.debug(`Cache write non-blocking for ${skuUpper}:`, err.message);
    });

    // Return immediately (no await on cache)
    res.json({ success: true, data: enriched });
});

/**
 * @desc    Get all stock changes for a company (audit trail)
 * @route   GET /api/v1/companies/:companyId/stock-changes
 * @access  Private
 */
const getCompanyStockChanges = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { page = 1, limit = 50, changeType, startDate, endDate, shopId, groupBy = 'day' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });

    // Build query
    const query = { companyId };
    if (shopId) query.shopId = shopId;
    if (changeType) query.type = changeType || changeType;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const endDateObj = new Date(endDate);
            endDateObj.setHours(23, 59, 59, 999);
            query.createdAt.$lte = endDateObj;
        }
    }

    try {
        // Paginated recent changes (readable list)
        const changesPromise = StockChange.find(query)
            .populate('productId', 'name sku brand categoryId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .lean();

        const countPromise = StockChange.countDocuments(query);

        // Aggregation for insights — normalize qty field to handle legacy names
        const groupFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-%m-%d' : '%Y-%m-%d';
        const aggPromise = StockChange.aggregate([
            { $match: query },
            { $addFields: { qtyNorm: { $ifNull: ['$qty', '$quantity'] } } },
            {
                $facet: {
                    summary: [
                        {
                            $group: {
                                _id: null,
                                totalChanges: { $sum: 1 },
                                totalInbound: { $sum: { $cond: [{ $gt: ['$qtyNorm', 0] }, '$qtyNorm', 0] } },
                                totalOutbound: { $sum: { $cond: [{ $lt: ['$qtyNorm', 0] }, { $multiply: ['$qtyNorm', -1] }, 0] } },
                                netChange: { $sum: '$qtyNorm' }
                            }
                        }
                    ],
                    byType: [
                        { $group: { _id: '$type', count: { $sum: 1 }, totalQty: { $sum: '$qtyNorm' } } },
                        { $sort: { count: -1 } }
                    ],
                    topProducts: [
                        { $group: { _id: '$productId', actions: { $sum: 1 }, qtyChanged: { $sum: '$qtyNorm' } } },
                        { $sort: { actions: -1 } },
                        { $limit: 10 },
                        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
                        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                        { $project: { productId: '$_id', productName: '$product.name', sku: '$product.sku', actions: 1, qtyChanged: 1 } }
                    ],
                    byShop: [
                        { $group: { _id: '$shopId', actions: { $sum: 1 }, qtyChanged: { $sum: '$qtyNorm' } } },
                        { $sort: { actions: -1 } }
                    ],
                    timeSeries: [
                        { $group: { _id: { $dateToString: { format: groupFormat, date: '$createdAt' } }, count: { $sum: 1 }, qty: { $sum: '$qtyNorm' } } },
                        { $sort: { _id: 1 } }
                    ]
                }
            }
        ]).allowDiskUse(true);

        const [changes, total, agg] = await Promise.all([changesPromise, countPromise, aggPromise]);

        const agg0 = agg[0] || {};
        const summary = (agg0.summary && agg0.summary[0]) || { totalChanges: 0, totalInbound: 0, totalOutbound: 0, netChange: 0 };
        const byType = agg0.byType || [];
        const topProducts = agg0.topProducts || [];
        const byShop = agg0.byShop || [];
        const timeSeries = (agg0.timeSeries || []).map(t => ({ period: t._id, count: t.count, qty: t.qty }));

        const insights = {
            busiestShop: byShop.length ? byShop[0]._id : null,
            topChangeTypes: byType.slice(0, 5).map(t => ({ type: t._id, count: t.count, qty: t.totalQty })),
            topProducts: topProducts
        };

        res.json({
            success: true,
            data: {
                summary,
                breakdown: { byType, byShop },
                topProducts,
                timeSeries,
                recentChanges: changes,
                pagination: { page: parseInt(page), limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
                insights
            }
        });
    } catch (err) {
        logger.error('getCompanyStockChanges error', err);
        res.status(500).json({ success: false, message: 'Failed to fetch company stock changes', error: err.message });
    }
});

/**
 * @desc    Get all alerts for a company
 * @route   GET /api/v1/companies/:companyId/alerts
 * @access  Private
 */
const getCompanyAlerts = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { page = 1, limit = 50, type, isResolved } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { companyId };
    if (type) query.type = type;
    if (isResolved !== undefined) query.isResolved = isResolved === 'true';

    const alerts = await Alert.find(query)
        .populate('productId', 'name sku')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Alert.countDocuments(query);

    res.json({
        success: true,
        data: alerts,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
});

/**
 * @desc    Get all inventory adjustments for a company
 * @route   GET /api/v1/companies/:companyId/adjustments
 * @access  Private
 */
const getCompanyAdjustments = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { page = 1, limit = 50, status, adjustmentType } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { companyId };
    if (status) query.status = status;
    if (adjustmentType) query.adjustmentType = adjustmentType;

    const adjustments = await InventoryAdjustment.find(query)
        .populate('productId', 'name sku')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await InventoryAdjustment.countDocuments(query);

    res.json({
        success: true,
        data: adjustments,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
});

/**
 * @desc    Get low-stock products for a company
 * @route   GET /api/v1/companies/:companyId/low-stock
 * @access  Private
 */
const getCompanyLowStockProducts = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { page = 1, limit = 20, shopId } = req.query;

    // Delegate to InventoryAnalyticsService which performs a robust aggregation
    // against productstocks and productvariations and returns low-stock products.
    const allLowStock = await InventoryAnalyticsService.getLowStockProducts(companyId, shopId || null);

    // Simple pagination on the returned array
    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, Math.min(parseInt(limit) || 20, 200));
    const start = (p - 1) * l;
    const paged = Array.isArray(allLowStock) ? allLowStock.slice(start, start + l) : [];

    res.json({
        success: true,
        data: paged,
        pagination: {
            page: p,
            limit: l,
            total: Array.isArray(allLowStock) ? allLowStock.length : 0,
            pages: Array.isArray(allLowStock) ? Math.ceil(allLowStock.length / l) : 0
        }
    });
});

/**
 * @desc    Get inventory summary for a company
 * @route   GET /api/v1/companies/:companyId/inventory-summary
 * @access  Private
 */
const getCompanyInventorySummary = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Use internal helpers which provide robust summaries without relying on virtual fields
    const overview = await getCompanyOverview_Internal(companyId);
    const summary = await getCompanyInventorySummary_Internal(companyId);

    res.json({
        success: true,
        data: {
            overview,
            summary,
            lastUpdated: new Date()
        }
    });
});

/**
 * @desc    Get all shops (warehouses) in a company with inventory stats
 * @route   GET /api/v1/companies/:companyId/shops
 * @access  Private
 */
const getCompanyShops = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Aggregate from ProductStock which stores concrete stock records per product/variation
    const shopStats = await ProductStock.aggregate([
        { $match: { companyId } },
        {
            $group: {
                _id: '$shopId',
                shopId: { $first: '$shopId' },
                productIds: { $addToSet: '$productId' },
                totalStock: { $sum: '$stockQty' },
                totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$avgCost', 0] }] } },
                lowStockCount: { $sum: { $cond: [{ $lte: ['$stockQty', '$lowStockThreshold'] }, 1, 0] } }
            }
        },
        {
            $project: {
                shopId: 1,
                productCount: { $size: '$productIds' },
                totalStock: 1,
                totalValue: 1,
                lowStockCount: 1
            }
        },
        { $sort: { totalValue: -1 } }
    ]).allowDiskUse(true);

    res.json({
        success: true,
        data: {
            companyId,
            shops: shopStats,
            totalShops: shopStats.length,
            lastUpdated: new Date()
        }
    });
});

/**
 * @desc    Get comprehensive reports for a company
 * @route   GET /api/v1/companies/:companyId/reports
 * @access  Private
 */
const getCompanyReports = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { reportType = 'inventory' } = req.query;

    if (reportType === 'inventory') {
        // Inventory health report
        const overview = await getCompanyOverview_Internal(companyId);
        const summary = await getCompanyInventorySummary_Internal(companyId);

        res.json({
            success: true,
            reportType: 'inventory',
            data: {
                overview,
                summary,
                generatedAt: new Date()
            }
        });
    } else if (reportType === 'stock-movement') {
        // Stock movement (last 30 days for better insights)
        if (!shopId) {
            return res.status(400).json({
                success: false,
                message: 'shopId is required for stock-movement report'
            });
        }

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const movement = await StockChange.aggregate([
            {
                $match: {
                    companyId,
                    shopId,
                    createdAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    totalQuantity: { $sum: '$qty' }
                }
            }
        ]);

        // DEAD STOCK: Products with stock > 0 but NO sales in 30 days
        // 1. Get all products with stock > 5 (ignore tiny scraps)
        const stockedProducts = await ProductStock.find({ companyId, shopId, stockQty: { $gt: 5 } }).select('productId stockQty').lean();
        const stockedProductIds = stockedProducts.map(sp => sp.productId);

        // 2. Find which of these had sales
        const soldProductIdsRaw = await StockChange.distinct('productId', {
            companyId,
            shopId,
            type: 'sale',
            createdAt: { $gte: thirtyDaysAgo },
            productId: { $in: stockedProductIds }
        });
        const soldProductIds = new Set(soldProductIdsRaw.map(id => String(id)));

        // 3. Filter for dead stock
        const deadStockItems = stockedProducts.filter(sp => !soldProductIds.has(String(sp.productId))).slice(0, 5); // Limit to top 5

        // Enrich Dead Stock with Names
        const deadStockEnriched = await Product.find({ _id: { $in: deadStockItems.map(d => d.productId) } })
            .select('name sku')
            .lean()
            .then(products => products.map(p => {
                const stock = deadStockItems.find(d => String(d.productId) === String(p._id));
                return { id: p._id, name: p.name, sku: p.sku, dormantStock: stock?.stockQty || 0 };
            }));

        // TOP MOVERS: High velocity items
        const topMovers = await StockChange.aggregate([
            { $match: { companyId, shopId, type: 'sale', createdAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: '$productId', totalSold: { $sum: { $abs: '$qty' } } } },
            { $sort: { totalSold: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $project: { name: '$product.name', sku: '$product.sku', totalSold: 1 } }
        ]);

        // Get shop-specific overview for health score
        const overview = await ProductStock.aggregate([
            {
                $match: {
                    companyId,
                    shopId: shopId
                }
            },
            {
                $group: {
                    _id: null,
                    totalProducts: { $sum: 1 },
                    totalStock: { $sum: { $ifNull: ['$stockQty', 0] } },
                    totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$avgCost', 0] }] } },
                    lowStockCount: {
                        $sum: {
                            $cond: [
                                { $lte: ['$stockQty', '$lowStockThreshold'] },
                                1,
                                0
                            ]
                        }
                    },
                    outOfStockCount: {
                        $sum: {
                            $cond: [
                                { $lte: ['$stockQty', 0] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                companyId,
                shopId,
                overview: overview[0] || { totalProducts: 0, totalStock: 0, totalValue: 0, lowStockCount: 0, outOfStockCount: 0 },
                stockMovement: {
                    period: '30 days',
                    data: movement
                },
                insights: {
                    topMovers,
                    deadStock: deadStockEnriched,
                    healthScore: overview[0] ? Math.min(100, Math.max(0, 100 - (overview[0].outOfStockCount || 0) * 5)) : 100 // Simple heuristic
                },
                generatedAt: new Date()
            }
        });
    } else {
        res.status(400).json({
            success: false,
            message: 'Invalid reportType. Use: inventory, stock-movement'
        });
    }
});

// Internal helper functions
async function getCompanyOverview_Internal(companyId) {
    const totalProducts = await Product.countDocuments({ companyId });
    // Use ProductStock as the single source of truth for stock quantities
    const stockData = await ProductStock.aggregate([
        { $match: { companyId } },
        { $group: { _id: null, totalStock: { $sum: '$stockQty' } } }
    ]).allowDiskUse(true);

    return {
        totalProducts,
        totalStock: stockData[0]?.totalStock || 0
    };
}

async function getCompanyInventorySummary_Internal(companyId) {
    const byCategory = await Product.aggregate([
        { $match: { companyId } },
        {
            $group: {
                _id: '$category',
                productCount: { $sum: 1 }
            }
        }
    ]);

    return { byCategory };
}

// ==================== SHOP LEVEL OPERATIONS ====================

/**
 * @desc    Get all products available for a specific shop
 * @route   GET /api/v1/inventory/shops/:shopId/products
 * @access  Private
 */
const getShopProducts = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const {
        page = 1,
        limit = 20,
        sort = 'sortOrder',
        status = 'active',
        category,
        brand,
        search,
        inStock,
        companyId
    } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query - now using simple shopId field instead of shopAvailability array
    const query = {
        companyId,
        shopId: shopId
    };

    if (status) query.status = status;
    if (category) query.categoryId = category;
    if (brand) query.brand = new RegExp(brand, 'i');
    if (search) {
        query.$text = { $search: search };
    }
    if (inStock === 'true') {
        const inStockProducts = await ProductStock.find({ shopId, stockQty: { $gt: 0 } }).select('productId');
        query._id = { $in: inStockProducts.map(s => s.productId) };
    }

    const products = await Product.find(query)
        .populate('categoryId')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await Product.countDocuments(query);

    // 1. Bulk fetch ProductStock for all products in this page
    const productIds = products.map(p => p._id);
    const stockMap = {};
    const stockList = await ProductStock.find({ productId: { $in: productIds }, shopId: shopId }).lean();
    stockList.forEach(s => { stockMap[String(s.productId)] = s; });

    // 2. Bulk fetch Sales Velocity (last 30 days) for these products
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const salesStats = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                productId: { $in: productIds },
                type: 'sale',
                createdAt: { $gte: thirtyDaysAgo }
            }
        },
        {
            $group: {
                _id: '$productId',
                totalSold: { $sum: { $abs: '$qty' } }
            }
        }
    ]);
    const salesMap = {};
    salesStats.forEach(s => { salesMap[String(s._id)] = s.totalSold; });

    // 3. Transform products with embedded stats
    const shopProducts = products.map((product) => {
        const stock = stockMap[String(product._id)];
        const velocity = salesMap[String(product._id)] || 0;
        const currentQty = stock?.stockQty || 0;
        const lowThreshold = stock?.lowStockThreshold || 10;

        // Determine dynamic stock status
        let stockStatus = 'In Stock';
        if (currentQty <= 0) stockStatus = 'Out of Stock';
        else if (currentQty <= lowThreshold) stockStatus = 'Low Stock';

        return {
            ...product,
            shopInventory: {
                quantity: currentQty,
                lowStockThreshold: lowThreshold,
                effectivePrice: product.pricing?.salePrice || product.pricing?.basePrice,
                status: stockStatus
            },
            statistics: {
                salesVelocity: velocity, // Units sold last 30 days
                turnoverRate: currentQty > 0 ? parseFloat((velocity / currentQty).toFixed(2)) : 0,
                daysOfInventory: velocity > 0 ? parseFloat((currentQty / (velocity / 30)).toFixed(1)) : 999
            }
        };
    });

    res.json({
        success: true,
        data: shopProducts,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
});

/**
 * @desc    Get inventory details for a specific product at a shop
 * @route   GET /api/v1/inventory/shops/:shopId/products/:productId
 * @access  Private
 */
const getShopProductInventory = asyncHandler(async (req, res) => {
    const { shopId, productId } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    validateMongoId(productId);

    const product = await Product.findOne({
        _id: productId,
        companyId,
        shopId: shopId
    }).populate('categoryId');

    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found for this shop'
        });
    }

    const stock = await ProductStock.findOne({ productId: product._id });

    res.json({
        success: true,
        data: {
            productId: product._id,
            name: product.name,
            sku: product.sku,
            category: product.category,
            shopInventory: {
                quantity: stock?.stockQty || 0,
                lowStockThreshold: stock?.lowStockThreshold || 10,
                effectivePrice: product.pricing?.salePrice || product.pricing?.basePrice
            }
        }
    });
});

/**
 * @desc    Allocate inventory to a shop
 * @route   POST /api/v1/inventory/shops/:shopId/allocate
 * @access  Private
 */
const allocateInventoryToShop = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { productId, quantity, companyId, reason, userId } = req.body;

    if (!companyId || !productId || !quantity) {
        return res.status(400).json({
            success: false,
            message: 'companyId, productId, and quantity are required'
        });
    }

    validateMongoId(productId);

    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Quantity must be greater than 0'
        });
    }

    try {
        const product = await Product.findOne({
            _id: productId,
            companyId,
            shopId: shopId
        });

        if (!product) {
            throw new Error('Product not found for this shop');
        }

        // Update ProductStock and create stock change
        const productStock = await ProductStock.findOne({ productId: product._id });
        if (!productStock) throw new Error('Product stock record not found');

        const previous = productStock.stockQty || 0;
        const newStock = previous + quantity;

        productStock.stockQty = newStock;
        await productStock.save();

        // Create stock change record
        const stockChange = new StockChange({
            companyId,
            shopId: shopId,
            productId: product._id,
            userId: userId || 'system',
            type: 'transfer',
            qty: quantity,
            previous: previous,
            reason: reason || `Allocated to shop ${shopId}`
        });

        await stockChange.save();

        logger.info(`✅ Allocated ${quantity} units of product ${productId} to shop ${shopId}`);

        res.json({
            success: true,
            message: 'Inventory allocated successfully',
            data: {
                productId: product._id,
                shopId,
                previousStock: previous,
                newStock,
                quantityAllocated: quantity
            }
        });
    } catch (error) {
        logger.error(`❌ Error allocating inventory: ${error.message}`);
        throw error;
    }
});

/**
 * @desc    Get shop inventory summary
 * @route   GET /api/v1/inventory/shops/:shopId/summary
 * @access  Private
 */
const getShopInventorySummary = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    // Aggregate shop inventory data using ProductStock
    const summary = await ProductStock.aggregate([
        {
            $match: {
                companyId,
                shopId: shopId
            }
        },
        {
            $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalQuantity: { $sum: { $ifNull: ['$stockQty', 0] } },
                lowStockCount: {
                    $sum: {
                        $cond: [
                            { $lte: ['$stockQty', '$lowStockThreshold'] },
                            1,
                            0
                        ]
                    }
                },
                outOfStockCount: {
                    $sum: {
                        $cond: [
                            { $lte: ['$stockQty', 0] },
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ]);

    const result = summary[0] || {
        totalProducts: 0,
        totalQuantity: 0,
        lowStockCount: 0,
        outOfStockCount: 0
    };

    res.json({
        success: true,
        data: {
            shopId,
            ...result,
            lastSynced: new Date()
        }
    });
});

/**
 * @desc    Get shop top-selling products with analytics
 * @route   GET /api/v1/inventory/shops/:shopId/top-sellers
 * @query   companyId (required), period (7,30,90,365), limit (5-50)
 * @access  Private
 */
const getShopTopSellers = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { companyId, period = 30, limit = 10 } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    const data = await AnalyticsService.getShopTopSellers(companyId, shopId, period, limit);

    res.json({
        success: true,
        shopId,
        period: `${period} days`,
        count: data.length,
        data
    });
});

/**
 * @desc    Get shop advanced analytics dashboard
 * @route   GET /api/v1/inventory/shops/:shopId/analytics
 * @query   companyId (required), period (7,30,90,365)
 * @access  Private
 */
const getShopAdvancedAnalytics = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { companyId, period = 30 } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    const analytics = await AnalyticsService.getShopAnalytics(companyId, shopId, period);

    // Add success flag as controller expects
    res.json({
        success: true,
        ...analytics
    });
});

/**
 * @desc    Get product comparisons for shop
 * @route   GET /api/v1/inventory/shops/:shopId/product-comparison
 * @query   companyId (required), productIds (comma-separated), period (30)
 * @access  Private
 */
const getProductComparison = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { companyId, productIds = '', period = 30 } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    const ids = productIds.split(',').map(id => id.trim()).filter(id => id);

    if (ids.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'At least one productId is required'
        });
    }

    // Validate all IDs
    ids.forEach(id => validateMongoId(id));

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period));

    // Get sales comparison
    const salesComparison = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                type: 'sale',
                createdAt: { $gte: fromDate },
                productId: { $in: ids.map(id => mongoose.Types.ObjectId(id)) }
            }
        },
        {
            $lookup: {
                from: 'products',
                localField: 'productId',
                foreignField: '_id',
                as: 'product'
            }
        },
        { $unwind: '$product' },
        {
            $group: {
                _id: '$productId',
                productName: { $first: '$product.name' },
                sku: { $first: '$product.sku' },
                unitsSold: { $sum: { $abs: '$qty' } },
                revenue: { $sum: { $multiply: [{ $abs: '$qty' }, '$product.pricing.basePrice'] } },
                costOfSales: { $sum: { $multiply: [{ $abs: '$qty' }, '$product.pricing.cost'] } },
                transactionCount: { $sum: 1 },
                currentStock: { $first: '$stockQty' }
            }
        }
    ]);

    const comparison = {
        success: true,
        shopId,
        period: `${period} days`,
        productsCompared: salesComparison.length,
        data: salesComparison.map(p => ({
            productId: p._id,
            productName: p.productName,
            sku: p.sku,
            sales: {
                unitsSold: p.unitsSold,
                revenue: parseFloat(p.revenue.toFixed(2)),
                transactionCount: p.transactionCount,
                avgUnitsPerTransaction: parseFloat((p.unitsSold / (p.transactionCount || 1)).toFixed(2))
            },
            profitability: {
                costOfSales: parseFloat(p.costOfSales.toFixed(2)),
                grossProfit: parseFloat((p.revenue - p.costOfSales).toFixed(2)),
                profitMargin: p.revenue > 0 ? parseFloat(((p.revenue - p.costOfSales) / p.revenue * 100).toFixed(2)) : 0
            },
            inventory: {
                currentStock: p.currentStock,
                stockTurnover: p.currentStock > 0 ? parseFloat((p.unitsSold / p.currentStock).toFixed(2)) : 0
            }
        })),
        analysis: {
            topByRevenue: salesComparison.sort((a, b) => b.revenue - a.revenue)[0]?.productName || 'N/A',
            topByProfit: salesComparison.sort((a, b) => (b.revenue - b.costOfSales) - (a.revenue - a.costOfSales))[0]?.productName || 'N/A',
            topByVolume: salesComparison.sort((a, b) => b.unitsSold - a.unitsSold)[0]?.productName || 'N/A'
        }
    };

    res.json(comparison);
});

/**
 * @desc    Get shop performance metrics for dashboard
 * @route   GET /api/v1/inventory/shops/:shopId/performance
 * @query   companyId (required)
 * @access  Private
 */
const getShopPerformanceMetrics = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { companyId } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'companyId is required'
        });
    }

    const metrics = await AnalyticsService.getDailyPerformanceComparison(companyId, shopId);

    const unitGrowth = metrics.growth.units;
    const revenueGrowth = metrics.growth.revenue;

    res.json({
        success: true,
        shopId,
        timestamp: new Date(),
        today: metrics.today,
        yesterday: metrics.yesterday,
        growth: {
            unitGrowth: parseFloat(unitGrowth.toFixed(2)),
            revenueGrowth: parseFloat(revenueGrowth.toFixed(2)),
            unitTrend: unitGrowth > 0 ? '📈 Up' : unitGrowth < 0 ? '📉 Down' : '➡️ Flat',
            revenueTrend: revenueGrowth > 0 ? '📈 Up' : revenueGrowth < 0 ? '📉 Down' : '➡️ Flat'
        }
    });
});

/**
 * @desc    Get shop-specific inventory overview
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/overview
 * @access  Private
 */
const getShopOverview = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.params;
    if (!companyId || !shopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and shopId are required'
        });
    }

    // Total products in shop
    const totalProducts = await Product.countDocuments({ companyId, shopId });

    // Total stock & value from ProductStock
    const stockData = await ProductStock.aggregate([
        { $match: { companyId, shopId } },
        {
            $group: {
                _id: null,
                totalStock: { $sum: '$stockQty' },
                totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$avgCost', 0] }] } }
            }
        }
    ]);

    const { totalStock = 0, totalValue = 0 } = stockData[0] || {};

    // Low stock
    const lowStockCount = await ProductStock.countDocuments({
        companyId,
        shopId,
        $expr: { $lte: ['$stockQty', '$lowStockThreshold'] }
    });

    // Out of stock
    const outOfStockCount = await ProductStock.countDocuments({
        companyId,
        shopId,
        stockQty: 0
    });

    // Active alerts
    const activeAlerts = await Alert.countDocuments({
        companyId,
        shopId,
        isResolved: false
    });

    res.json({
        success: true,
        data: {
            companyId,
            shopId,
            totalProducts,
            totalStock,
            totalValue: parseFloat(totalValue.toFixed(2)),
            lowStockCount,
            outOfStockCount,
            activeAlerts,
            lastUpdated: new Date()
        }
    });
});

/**
 * @desc    Get all stock changes for a shop
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/stock-changes
 * @access  Private
 */
const getShopStockChanges = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.params;
    if (!companyId || !shopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and shopId are required'
        });
    }
    const { page = 1, limit = 50, changeType, startDate, endDate, groupBy = 'day' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    const query = { companyId, shopId };
    if (changeType) query.type = changeType;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const endDateObj = new Date(endDate);
            endDateObj.setHours(23, 59, 59, 999);
            query.createdAt.$lte = endDateObj;
        }
    }

    try {
        const changesPromise = StockChange.find(query)
            .populate('productId', 'name sku brand categoryId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .lean();

        const countPromise = StockChange.countDocuments(query);

        const groupFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-%m-%d' : '%Y-%m-%d';
        const aggPromise = StockChange.aggregate([
            { $match: query },
            { $addFields: { qtyNorm: { $ifNull: ['$qty', '$quantity'] } } },
            {
                $facet: {
                    summary: [
                        { $group: { _id: null, totalChanges: { $sum: 1 }, totalInbound: { $sum: { $cond: [{ $gt: ['$qtyNorm', 0] }, '$qtyNorm', 0] } }, totalOutbound: { $sum: { $cond: [{ $lt: ['$qtyNorm', 0] }, { $multiply: ['$qtyNorm', -1] }, 0] } }, netChange: { $sum: '$qtyNorm' } } }
                    ],
                    byType: [{ $group: { _id: '$type', count: { $sum: 1 }, totalQty: { $sum: '$qtyNorm' } } }, { $sort: { count: -1 } }],
                    byUser: [{ $group: { _id: '$userId', userId: { $first: '$userId' }, actions: { $sum: 1 }, qtyChanged: { $sum: '$qtyNorm' } } }, { $sort: { actions: -1 } }, { $limit: 10 }],
                    topProducts: [{ $group: { _id: '$productId', actions: { $sum: 1 }, qtyChanged: { $sum: '$qtyNorm' } } }, { $sort: { actions: -1 } }, { $limit: 10 }, { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } }, { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }, { $project: { productId: '$_id', productName: '$product.name', sku: '$product.sku', actions: 1, qtyChanged: 1 } }],
                    timeSeries: [{ $group: { _id: { $dateToString: { format: groupFormat, date: '$createdAt' } }, count: { $sum: 1 }, qty: { $sum: '$qtyNorm' } } }, { $sort: { _id: 1 } }]
                }
            }
        ]).allowDiskUse(true);

        const [changes, total, agg] = await Promise.all([changesPromise, countPromise, aggPromise]);

        const agg0 = agg[0] || {};
        const summary = (agg0.summary && agg0.summary[0]) || { totalChanges: 0, totalInbound: 0, totalOutbound: 0, netChange: 0 };
        const byType = agg0.byType || [];
        const byUser = agg0.byUser || [];
        const topProducts = agg0.topProducts || [];
        const timeSeries = (agg0.timeSeries || []).map(t => ({ period: t._id, count: t.count, qty: t.qty }));

        const insights = {
            topUsers: byUser,
            topChangeTypes: byType.slice(0, 5).map(t => ({ type: t._id, count: t.count, qty: t.totalQty })),
            topProducts
        };

        res.json({
            success: true,
            data: {
                summary,
                breakdown: { byType, byUser },
                topProducts,
                timeSeries,
                recentChanges: changes,
                pagination: { page: parseInt(page), limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
                insights
            }
        });
    } catch (err) {
        logger.error('getShopStockChanges error', err);
        res.status(500).json({ success: false, message: 'Failed to fetch shop stock changes', error: err.message });
    }
});

/**
 * @desc    Get all alerts for a shop
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/alerts
 * @access  Private
 */
const getShopAlerts = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.params;
    if (!companyId || !shopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and shopId are required'
        });
    }
    const { page = 1, limit = 50, type, isResolved } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { companyId, shopId };
    if (type) query.type = type;
    if (isResolved !== undefined) query.isResolved = isResolved === 'true';

    const alerts = await Alert.find(query)
        .populate('productId', 'name sku')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Alert.countDocuments(query);

    res.json({
        success: true,
        data: alerts,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
});

/**
 * @desc    Get all adjustments for a shop
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/adjustments
 * @access  Private
 */
const getShopAdjustments = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.params;
    if (!companyId || !shopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and shopId are required'
        });
    }
    const { page = 1, limit = 50, status, adjustmentType } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { companyId, shopId };
    if (status) query.status = status;
    if (adjustmentType) query.adjustmentType = adjustmentType;

    const adjustments = await InventoryAdjustment.find(query)
        .populate('productId', 'name sku')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await InventoryAdjustment.countDocuments(query);

    res.json({
        success: true,
        data: adjustments,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
});

/**
 * @desc    Get low-stock products for a shop
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/low-stock
 * @access  Private
 */
const getShopLowStockProducts = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.params;
    if (!companyId || !shopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and shopId are required'
        });
    }
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {
        companyId,
        shopId
    };

    const lowStockProductIds = await ProductStock.find({
        ...query,
        $expr: { $lte: ['$stockQty', '$lowStockThreshold'] }
    }).select('productId');

    const products = await Product.find({
        _id: { $in: lowStockProductIds.map(s => s.productId) }
    })
        .populate('categoryId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = lowStockProductIds.length;

    res.json({
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

/**
 * @desc    Get detailed report for a shop
 * @route   GET /api/v1/companies/:companyId/shops/:shopId/report
 * @access  Private
 */
const getShopReport = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.params;
    if (!companyId || !shopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and shopId are required'
        });
    }

    // Overview from ProductStock
    const overview = await ProductStock.aggregate([
        { $match: { companyId, shopId } },
        {
            $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalStock: { $sum: '$stockQty' },
                totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$avgCost', 0] }] } }
            }
        }
    ]);

    // Stock movement (last 30 days for better insights)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const movement = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                createdAt: { $gte: thirtyDaysAgo }
            }
        },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
                totalQuantity: { $sum: '$qty' }
            }
        }
    ]);

    // DEAD STOCK: Products with stock > 0 but NO sales in 30 days
    // 1. Get all products with stock > 5 (ignore tiny scraps)
    const stockedProducts = await ProductStock.find({ companyId, shopId, stockQty: { $gt: 5 } }).select('productId stockQty').lean();
    const stockedProductIds = stockedProducts.map(sp => sp.productId);

    // 2. Find which of these had sales
    const soldProductIdsRaw = await StockChange.distinct('productId', {
        companyId,
        shopId,
        type: 'sale',
        createdAt: { $gte: thirtyDaysAgo },
        productId: { $in: stockedProductIds }
    });
    const soldProductIds = new Set(soldProductIdsRaw.map(id => String(id)));

    // 3. Filter for dead stock
    const deadStockItems = stockedProducts.filter(sp => !soldProductIds.has(String(sp.productId))).slice(0, 5); // Limit to top 5

    // Enrich Dead Stock with Names
    const deadStockEnriched = await Product.find({ _id: { $in: deadStockItems.map(d => d.productId) } })
        .select('name sku')
        .lean()
        .then(products => products.map(p => {
            const stock = deadStockItems.find(d => String(d.productId) === String(p._id));
            return { id: p._id, name: p.name, sku: p.sku, dormantStock: stock?.stockQty || 0 };
        }));

    // TOP MOVERS: High velocity items
    const topMovers = await StockChange.aggregate([
        { $match: { companyId, shopId, type: 'sale', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$productId', totalSold: { $sum: { $abs: '$qty' } } } },
        { $sort: { totalSold: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $project: { name: '$product.name', sku: '$product.sku', totalSold: 1 } }
    ]);

    res.json({
        success: true,
        data: {
            companyId,
            shopId,
            overview: overview[0] || { totalProducts: 0, totalStock: 0, totalValue: 0 },
            stockMovement: {
                period: '30 days',
                data: movement
            },
            insights: {
                topMovers,
                deadStock: deadStockEnriched,
                healthScore: overview[0] ? Math.min(100, Math.max(0, 100 - (overview[0].outOfStockCount || 0) * 5)) : 100 // Simple heuristic
            },
            generatedAt: new Date()
        }
    });
});

/**
 * @desc    Get detailed report for a single product (with stock changes and alerts)
 * @route   GET /api/v1/companies/:companyId/products/:productId/report
 * @access  Private
 */
const getProductReport = asyncHandler(async (req, res) => {
    const { companyId, productId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    validateMongoId(productId);

    // product details
    const product = await Product.findOne({ _id: productId, companyId })
        .populate('categoryId', 'name slug')
        .populate('pricingId')
        .lean();

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // current stock from ProductStock (source-of-truth)
    const stockRecord = await ProductStock.findOne({ productId: productId });
    const currentStock = stockRecord?.stockQty || 0;

    // paginated stock change history
    const pg = Math.max(1, parseInt(page));
    const lim = Math.min(Math.max(1, parseInt(limit)), 500);
    const skip = (pg - 1) * lim;

    const [changes, totalChanges] = await Promise.all([
        StockChange.find({ productId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(lim)
            .lean(),
        StockChange.countDocuments({ productId })
    ]);

    // recent alerts for this product
    const recentAlerts = await Alert.find({ productId }).sort({ createdAt: -1 }).limit(10).lean();

    res.json({
        success: true,
        data: {
            product,
            currentStock,
            stockChanges: changes,
            stockChangesPagination: { page: pg, limit: lim, total: totalChanges, pages: Math.ceil(totalChanges / lim) },
            recentAlerts
        }
    });
});

/**
 * @desc    Get aggregated report for a category
 * @route   GET /api/v1/companies/:companyId/categories/:categoryId/report
 * @access  Private
 */
const getCategoryReport = asyncHandler(async (req, res) => {
    const { companyId, categoryId } = req.params;

    validateMongoId(categoryId);

    // total products under category
    const totalProducts = await Product.countDocuments({ companyId, categoryId });

    // aggregate stock & value using ProductStock and pricing join
    const agg = await Product.aggregate([
        { $match: { companyId, categoryId: mongoose.Types.ObjectId(categoryId) } },
        { $lookup: { from: 'productstocks', localField: '_id', foreignField: 'productId', as: 'stocks' } },
        { $lookup: { from: 'productpricings', localField: 'pricingId', foreignField: '_id', as: 'pricing' } },
        { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                productId: '$_id',
                totalStock: { $sum: '$stocks.stockQty' },
                cost: { $ifNull: ['$pricing.cost', 0] },
                lowStockThreshold: { $arrayElemAt: ['$stocks.lowStockThreshold', 0] }
            }
        },
        {
            $group: {
                _id: null,
                totalStock: { $sum: '$totalStock' },
                totalValue: { $sum: { $multiply: ['$totalStock', '$cost'] } },
                lowStockCount: { $sum: { $cond: [{ $lte: ['$totalStock', { $ifNull: ['$lowStockThreshold', 10] }] }, 1, 0] } },
                outOfStockCount: { $sum: { $cond: [{ $lte: ['$totalStock', 0] }, 1, 0] } }
            }
        }
    ]).allowDiskUse(true);

    const summary = agg[0] || { totalStock: 0, totalValue: 0, lowStockCount: 0, outOfStockCount: 0 };

    res.json({ success: true, data: { categoryId, totalProducts, summary } });
});

/**
 * @desc    Get daily report for company (aggregated stock movement and sales)
 * @route   GET /api/v1/companies/:companyId/reports/daily
 * @query   date=YYYY-MM-DD (defaults to today)
 * @access  Private
 */
const getDailyReport = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { date } = req.query;
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);

    // StockChange aggregation by type
    const movement = await StockChange.aggregate([
        { $match: { companyId, createdAt: { $gte: day, $lt: next } } },
        { $group: { _id: '$type', count: { $sum: 1 }, totalQuantity: { $sum: '$qty' } } }
    ]).allowDiskUse(true);

    // Sales revenue and units
    const sales = await StockChange.aggregate([
        { $match: { companyId, type: 'sale', createdAt: { $gte: day, $lt: next } } },
        { $group: { _id: null, unitsSold: { $sum: { $abs: '$qty' } } } }
    ]);

    // Alerts created today
    const alerts = await Alert.find({ companyId, createdAt: { $gte: day, $lt: next } }).lean();

    res.json({ success: true, data: { date: day.toISOString().slice(0, 10), movement, sales: sales[0] || { unitsSold: 0 }, alerts } });
});

/**
 * @desc    Create end-of-day summary alert for company
 * @route   POST /api/v1/companies/:companyId/reports/daily/summary
 * @body    date=YYYY-MM-DD (optional)
 * @access  Private
 */
const createDailySummaryAlert = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { date } = req.body;
    const day = date ? new Date(date) : new Date();
    day.setHours(0, 0, 0, 0);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);

    const movement = await StockChange.aggregate([
        { $match: { companyId, createdAt: { $gte: day, $lt: next } } },
        { $group: { _id: '$type', count: { $sum: 1 }, totalQuantity: { $sum: '$qty' } } }
    ]).allowDiskUse(true);

    const totalAlerts = await Alert.countDocuments({ companyId, createdAt: { $gte: day, $lt: next } });
    const totalAdjustments = await InventoryAdjustment.countDocuments({ companyId, createdAt: { $gte: day, $lt: next } });

    const summaryText = `Daily summary for ${day.toISOString().slice(0, 10)}: movements=${JSON.stringify(movement)}, alerts=${totalAlerts}, adjustments=${totalAdjustments}`;

    const alert = await Alert.create({
        companyId,
        type: 'daily-summary',
        message: summaryText,
        isResolved: false,
        createdAt: new Date()
    });

    res.json({ success: true, data: { alertId: alert._id, message: summaryText } });
});

/**
 * @desc    SMART INTRA-COMPANY TRANSFER - Transfer stock between shops in same company
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/transfer
 * @access  Private
 * 
 * Creates:
 * - StockChange records for both source and destination
 * - ProductTransfer record for complete audit trail
 * - Updates analytics for both shops
 */
const transferStockBetweenShops = asyncHandler(async (req, res) => {
    const { companyId, shopId: sourceShopId } = req.params;
    const {
        productId,
        toShopId: destinationShopId,
        quantity,
        reason,
        userId,
        notes
    } = req.body;

    // Validation
    if (!companyId || !sourceShopId || !destinationShopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId, sourceShopId, and destinationShopId are required'
        });
    }

    if (!productId || !quantity || !userId) {
        return res.status(400).json({
            success: false,
            message: 'productId, quantity, and userId are required'
        });
    }

    if (sourceShopId === destinationShopId) {
        return res.status(400).json({
            success: false,
            message: 'Source and destination shops cannot be the same'
        });
    }

    validateMongoId(productId);

    try {
        const startTime = Date.now();

        // ========== STEP 1: Get source product and verify stock ==========
        logger.info(`🔍 Looking for product: ${productId} (type: ${typeof productId}) in company: ${companyId}`);

        // Try without isDeleted first
        let sourceProduct = await Product.findById(productId);
        logger.info(`📦 Product exists in DB: ${sourceProduct ? 'YES' : 'NO'}`);

        if (sourceProduct) {
            logger.info(`📊 Product details: companyId=${sourceProduct.companyId}, isDeleted=${sourceProduct.isDeleted}`);
        }

        // Now do the full query
        sourceProduct = await Product.findOne({
            _id: productId,
            companyId,
            isDeleted: false
        });

        if (!sourceProduct) {
            logger.error(`❌ Product not found. Query: {_id: ${productId}, companyId: ${companyId}, isDeleted: false}`);
            throw new Error('Product not found in this company');
        }

        logger.info(`✅ Found product: ${sourceProduct.name}`);


        // Get source pricing
        const sourcePricing = await ProductPricing.findOne({
            productId
        });

        if (!sourcePricing) {
            throw new Error('Product pricing not found for source product');
        }

        // Get source stock - ProductStock only has productId + variationId
        const sourceStock = await ProductStock.findOne({
            productId,
            variationId: null  // No variation for simple products
        });

        if (!sourceStock) {
            throw new Error(`No stock record found for product: ${productId}`);
        }

        const sourceStockBefore = sourceStock.stockQty || 0;
        if (sourceStockBefore < quantity) {
            throw new Error(
                `Insufficient stock. Available: ${sourceStockBefore}, Requested: ${quantity}`
            );
        }

        // ========== STEP 2: Create NEW product instance for destination shop ==========
        const destinationProductData = sourceProduct.toObject();
        destinationProductData.companyId = companyId; // Same company
        destinationProductData.shopId = destinationShopId; // Update to destination shop

        // Sanitize fields that may conflict with unique indexes or are shop-specific
        // For intra-company transfers, share supplier name since same company
        sanitizeDestinationProductData(destinationProductData, 'intra_company');

        // Product model will auto-generate new unique codes on save
        const destinationProduct = await Product.create([destinationProductData]);
        const destinationProductId = destinationProduct[0]._id;

        // Verify the product was actually created in the database
        const verifyDest = await Product.findById(destinationProductId);
        if (!verifyDest) {
            throw new Error(`Destination product ${destinationProductId} failed to save to database`);
        }

        logger.info(`✅ Destination product created: ${destinationProductId}, SKU: ${destinationProduct[0].sku}, Shop: ${destinationShopId}`);

        // ========== STEP 3.25: Replicate variations, stocks and specifications ==========
        await replicateVariationsAndStocks(productId, destinationProductId, companyId, destinationShopId, quantity, null);
        await replicateProductSpecs(productId, destinationProductId);
        logger.info(`✓ Replicated variations, stocks and specs for destination product ${destinationProductId}`);

        // ========== STEP 3.5: Generate QR code and barcode images for destination product ==========
        if (process.nextTick) {
            setImmediate(async () => {
                try {
                    const skuValue = destinationProduct[0].sku;
                    if (!skuValue) {
                        logger.warn(`⚠️ Cannot generate QR/Barcode for transferred product ${destinationProductId} - SKU missing`);
                        return;
                    }

                    logger.info(`🔄 Requesting QR/Barcode generation for transferred product SKU: ${skuValue}`);

                    const { requestQRCode, requestBarcode } = require('../utils/events/documentRequests');

                    await Promise.all([
                        requestQRCode(destinationProductId.toString(), skuValue, companyId),
                        requestBarcode(destinationProductId.toString(), skuValue, companyId)
                    ]);

                    logger.info(`✅ QR/Barcode generation requests sent for transferred product SKU: ${skuValue}`);
                } catch (err) {
                    logger.error('Failed to request QR/barcode generation for transferred product:', err);
                }
            });
        }

        // ========== STEP 4: Create pricing for destination product ==========
        // Copy ALL pricing information from source
        const destinationPricing = new ProductPricing({
            productId: destinationProductId,
            basePrice: sourcePricing.basePrice,
            salePrice: sourcePricing.salePrice,
            listPrice: sourcePricing.listPrice,
            cost: sourcePricing.cost,
            currency: sourcePricing.currency || 'RWF',
            priceTiers: sourcePricing.priceTiers || [],
            taxInclusive: sourcePricing.taxInclusive,
            taxRate: sourcePricing.taxRate,
            effectiveFrom: sourcePricing.effectiveFrom,
            effectiveTo: sourcePricing.effectiveTo,
            // Margins will be auto-calculated in pre-save hook
            profitRank: sourcePricing.profitRank || 'medium',
            unitsSoldLastMonth: 0, // Reset for new product
            revenue: 0, // Reset for new product
            profit: 0 // Reset for new product
        });
        await destinationPricing.save();

        // Link pricing to destination product and assert update succeeded
        try {
            const updateRes = await Product.updateOne({ _id: destinationProductId }, { pricingId: destinationPricing._id });
            const modified = updateRes && (updateRes.modifiedCount || updateRes.nModified || 0);
            if (!modified) {
                logger.warn(`Linking pricingId to destination product ${destinationProductId} did not modify document (pricingId: ${destinationPricing._id}). updateResult=${JSON.stringify(updateRes)}`);
            } else {
                logger.info(`✓ Linked pricingId ${destinationPricing._id} to destination product ${destinationProductId}`);
            }
        } catch (err) {
            logger.error('Failed to link destination pricing to product:', err);
        }

        // ========== STEP 4.5: Copy Product Specs (if any) ==========
        try {
            const sourceSpecs = await ProductSpecs.findOne({ productId: productId }) || await ProductSpecs.findById(sourceProduct.specsId);
            if (sourceSpecs) {
                const specsObj = (typeof sourceSpecs.toObject === 'function') ? sourceSpecs.toObject() : JSON.parse(JSON.stringify(sourceSpecs));
                delete specsObj._id;
                specsObj.productId = destinationProductId;
                const newSpecs = await ProductSpecs.create(specsObj);
                const res = await Product.updateOne({ _id: destinationProductId }, { specsId: newSpecs._id });
                const modified = res && (res.modifiedCount || res.nModified || 0);
                if (!modified) {
                    logger.warn(`Linking specsId to destination product ${destinationProductId} did not modify document (specsId: ${newSpecs._id}). updateResult=${JSON.stringify(res)}`);
                } else {
                    logger.info(`✓ Copied ProductSpecs to destination product ${destinationProductId}`);
                }
            }
        } catch (err) {
            logger.error('Failed to copy ProductSpecs for destination product:', err);
        }


        // ========== STEP 5: Create destination stock ==========
        // Transfer ALL stock information except the source stock quantity
        const destinationStock = new ProductStock({
            productId: destinationProductId,
            variationId: null,
            stockQty: quantity,
            reservedQty: 0,
            trackQuantity: sourceStock.trackQuantity !== undefined ? sourceStock.trackQuantity : true,
            allowBackorder: sourceStock.allowBackorder || false,
            lowStockThreshold: sourceStock.lowStockThreshold || 10,
            minReorderQty: sourceStock.minReorderQty || 20,
            safetyStock: sourceStock.safetyStock || 0,
            avgDailySales: 0,
            stockoutRiskDays: 0,
            suggestedReorderQty: sourceStock.minReorderQty || 20,
            lastRestockDate: new Date(),
            supplierLeadDays: sourceStock.supplierLeadDays || 7,
            lastForecastUpdate: new Date(),
            totalUnitsSold: 0,
            totalRevenue: 0,
            avgCost: destinationPricing.cost || 0,
            profitMarginPercent: (destinationPricing.marginPercent || 0)
        });
        await destinationStock.save();

        // ========== STEP 5: Source stock remains UNCHANGED (no deduction) ==========
        // Per business requirement: transfers create new product instances without reducing source stock
        const sourceStockAfter = sourceStockBefore; // No change

        // Destination stock was already created with quantity

        // ========== STEP 6: Create StockChange records (audit trail) ==========
        const destStockAfter = quantity;

        const sourceStockChange = new StockChange({
            companyId,
            shopId: sourceShopId,
            productId,
            type: 'transfer',
            qty: 0, // No deduction from source
            previous: sourceStockBefore,
            new: sourceStockAfter, // Same as before
            reason: reason || `Transferred ${quantity} units to shop ${destinationShopId} (source stock unchanged)`,
            userId: userId,
            metadata: {
                transferType: 'intra_company',
                direction: 'out',
                destinationShop: destinationShopId,
                destinationProductId: destinationProductId,
                transferredQty: quantity,
                note: 'Source stock not deducted per business logic'
            }
        });
        await sourceStockChange.save();

        const destStockChange = new StockChange({
            companyId,
            shopId: destinationShopId,
            productId: destinationProductId,
            type: 'transfer',
            qty: quantity,
            previous: 0,
            new: destStockAfter,
            reason: reason || `Received ${quantity} units from shop ${sourceShopId}`,
            userId: userId,
            metadata: {
                transferType: 'intra_company',
                direction: 'in',
                sourceShop: sourceShopId,
                sourceProductId: productId
            }
        });
        await destStockChange.save();

        // ========== STEP 7: Create ProductTransfer record for complete audit trail ==========
        const transferValue = quantity * (sourcePricing.basePrice || 0);
        const productTransfer = new ProductTransfer({
            transferId: `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            transferType: 'intra_company',
            status: 'completed',

            sourceCompanyId: companyId,
            sourceShopId: sourceShopId,
            sourceShopName: sourceShopId,

            destinationCompanyId: companyId,
            destinationShopId: destinationShopId,
            destinationShopName: destinationShopId,

            productId: productId,
            productName: sourceProduct.name,
            productSku: sourceProduct.sku,

            createdProductId: destinationProductId,

            quantity: quantity,
            reason: reason || 'Intra-company stock redistribution',

            sourceStockBefore: sourceStockBefore,
            sourceStockAfter: sourceStockChange.new,
            destinationStockBefore: 0,
            destinationStockAfter: destStockChange.new,

            transferredProductData: {
                pricing: {
                    cost: destinationPricing.cost,
                    basePrice: destinationPricing.basePrice,
                    salePrice: destinationPricing.salePrice,
                    currency: destinationPricing.currency
                },
                attributes: sourceProduct.metadata,
                images: sourceProduct.images,
                category: sourceProduct.category,
                tags: destinationProduct[0].tags,
                trackQuantity: destinationStock.trackQuantity,
                lowStockThreshold: destinationStock.lowStockThreshold,
                allowBackorder: destinationStock.allowBackorder
            },

            performedBy: {
                userId: userId
            },

            sourceStockChangeId: sourceStockChange._id,
            destinationStockChangeId: destStockChange._id,

            estimatedValue: transferValue,
            actualValue: transferValue,

            notes: notes,

            metadata: {
                isAutomatic: false,
                priority: 'medium',
                triggeredBy: 'manual'
            },

            initiatedAt: new Date(),
            completedAt: new Date()
        });
        await productTransfer.save();

        const duration = Date.now() - startTime;
        logger.info(`✅ Intra-company transfer completed: ${quantity} units of ${sourceProduct.name} from ${sourceShopId} to ${destinationShopId} (${duration}ms)`);

        // Invalidate cache
        setImmediate(() => {
            try {
                delCache(`company:overview:${companyId}`);
                scanDel(`company:products:${companyId}:*`);
                delCache(`product:${productId}`);
                delCache(`product:${destinationProductId}`);
                scanDel(`stock:${productId}:*`);
                scanDel(`stock:${destinationProductId}:*`);
            } catch (err) {
                logger.error('Cache invalidation error after transfer:', err);
            }
        });

        res.json({
            success: true,
            message: 'Product transferred successfully within company - new product instance created',
            data: {
                transferId: productTransfer.transferId,
                sourceProduct: {
                    productId: productId,
                    productName: sourceProduct.name,
                    productSku: sourceProduct.sku,
                    shopId: sourceShopId,
                    stockBefore: sourceStockBefore,
                    stockAfter: sourceStock.stockQty,
                    stockChangeId: sourceStockChange._id
                },
                destinationProduct: {
                    productId: destinationProductId,
                    productName: destinationProduct[0].name,
                    productSku: destinationProduct[0].sku,
                    shopId: destinationShopId,
                    stockBefore: 0,
                    stockAfter: quantity,
                    stockChangeId: destStockChange._id,
                    pricing: {
                        cost: destinationPricing.cost,
                        basePrice: destinationPricing.basePrice
                    }
                },
                quantityTransferred: quantity,
                transferValue: transferValue,
                performedBy: userId,
                completedAt: new Date(),
                duration: `${duration}ms`
            }
        });

    } catch (error) {
        logger.error(`❌ Intra-company transfer error: ${error.message}`);
        throw error;
    } finally {

    }
});

// ==================== CROSS-COMPANY OPERATIONS ====================

/**
 * @desc    Transfer product (with details) from one shop to another shop in DIFFERENT company
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/products/:productId/cross-company-transfer
 * @access  Private
 */
const transferProductCrossCompany = asyncHandler(async (req, res) => {
    const { productId, companyId, shopId } = req.params;
    let {
        fromCompanyId,
        fromShopId,
        toCompanyId,
        toShopId,
        transferQuantity,
        reason,
        userId,
        notes,
        pricingOverride
    } = req.body;

    // Default to params if not provided in body (support new route structure)
    fromCompanyId = fromCompanyId || companyId;
    fromShopId = fromShopId || shopId;

    // Validate required fields
    if (!fromCompanyId || !fromShopId || !toCompanyId || !toShopId || !transferQuantity) {
        return res.status(400).json({
            success: false,
            message: 'fromCompanyId, fromShopId, toCompanyId, toShopId, and transferQuantity are required'
        });
    }

    validateMongoId(productId);

    // Validation: quantity must be positive
    if (transferQuantity <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Transfer quantity must be greater than 0'
        });
    }

    // No transaction session - purely linear execution
    // Logic: If any step fails after source stock is deducted, we must accept manual correction or rely on error handling.
    // However, user requested "normal codes" without transactions.

    try {
        // ========== STEP 1: Get source product ==========
        const sourceProduct = await Product.findOne({
            _id: productId,
            companyId: fromCompanyId
        });

        if (!sourceProduct) {
            throw new Error('Product not found in source company');
        }

        // Get source pricing
        const sourcePricing = await ProductPricing.findOne({
            productId
        });

        if (!sourcePricing) {
            throw new Error('Product pricing not found for source product');
        }

        // Get source stock from ProductStock model - only has productId + variationId
        const sourceStock = await ProductStock.findOne({
            productId,
            variationId: null  // No variation for simple products
        });

        if (!sourceStock) {
            throw new Error('No stock record found for product');
        }

        const currentStock = sourceStock.stockQty || 0;
        if (currentStock < transferQuantity) {
            throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${transferQuantity}`);
        }

        // ========== STEP 2: (NO OP) Do not deduct source stock for cross-company transfers ==========
        // Per requested behavior, we do not modify the source stock quantity here.
        // The system will create a new product & stock in destination without deducting from source.

        // ========== STEP 2.5: Handle Category ==========
        // Ensure category exists in destination company, create if needed
        let destinationCategoryId = null;
        if (sourceProduct.categoryId) {
            destinationCategoryId = await ensureCategoryInDestinationCompany(
                sourceProduct.categoryId,
                toCompanyId
            );
            logger.info(`✓ Category handled for destination company: ${destinationCategoryId || 'none'}`);
        }

        // ========== STEP 3: Create destination product ==========
        const destinationProductData = sourceProduct.toObject();
        destinationProductData.companyId = toCompanyId;
        destinationProductData.shopId = toShopId; // Update to destination shop
        destinationProductData.categoryId = destinationCategoryId; // Use destination category

        // Sanitize fields that may conflict with unique indexes or are company/shop-specific
        // For cross-company transfers, do NOT share supplier name
        sanitizeDestinationProductData(destinationProductData, 'cross_company');

        // Product model will auto-generate new unique codes on save

        const destinationProduct = await Product.create([destinationProductData]); // Returns array
        const destinationProductId = destinationProduct[0]._id;

        // Verify the product was actually created in the database
        const verifyDestProd = await Product.findById(destinationProductId);
        if (!verifyDestProd) {
            throw new Error(`Destination product ${destinationProductId} failed to save to database`);
        }

        logger.info(`✅ Cross-company transfer destination product created: ${destinationProductId}, SKU: ${destinationProduct[0].sku}, Company: ${toCompanyId}`);

        // ========== STEP 3.25: Replicate variations, stocks and specifications ==========
        await replicateVariationsAndStocks(productId, destinationProductId, toCompanyId, toShopId, transferQuantity, null);
        await replicateProductSpecs(productId, destinationProductId);
        logger.info(`✓ Replicated variations, stocks and specs for destination product ${destinationProductId}`);

        // ========== STEP 3.5: Generate QR code and barcode images for destination product ==========
        if (process.nextTick) {
            setImmediate(async () => {
                try {
                    const skuValue = destinationProduct[0].sku;
                    if (!skuValue) {
                        logger.warn(`⚠️ Cannot generate QR/Barcode for cross-company transferred product ${destinationProductId} - SKU missing`);
                        return;
                    }

                    logger.info(`🔄 Requesting QR/Barcode generation for cross-company transferred product SKU: ${skuValue}`);

                    // Request QR/Barcode generation from document-service
                    const { requestQRCode, requestBarcode } = require('../utils/events/documentRequests');

                    await Promise.all([
                        requestQRCode(destinationProductId.toString(), skuValue, toCompanyId),
                        requestBarcode(destinationProductId.toString(), skuValue, toCompanyId)
                    ]);

                    logger.info(`✅ QR/Barcode generation requests sent for cross-company product SKU: ${skuValue}`);
                } catch (err) {
                    logger.error('Failed to request QR/barcode for cross-company transfer:', err);
                }
            });
        }

        // ========== STEP 4: Create pricing for destination product ==========
        // Copy ALL pricing information from source
        const destinationPricing = new ProductPricing({
            productId: destinationProductId,
            basePrice: pricingOverride?.basePrice || sourcePricing.basePrice,
            salePrice: pricingOverride?.salePrice || sourcePricing.salePrice,
            listPrice: pricingOverride?.listPrice || sourcePricing.listPrice,
            cost: pricingOverride?.cost || sourcePricing.cost,
            currency: sourcePricing.currency || 'RWF',
            priceTiers: sourcePricing.priceTiers || [],
            taxInclusive: sourcePricing.taxInclusive,
            taxRate: sourcePricing.taxRate,
            effectiveFrom: sourcePricing.effectiveFrom,
            effectiveTo: sourcePricing.effectiveTo,
            // Margins will be auto-calculated in pre-save hook
            profitRank: sourcePricing.profitRank || 'medium',
            unitsSoldLastMonth: 0,
            revenue: 0,
            profit: 0
        });
        await destinationPricing.save();

        // Link pricing to destination product
        await Product.updateOne({ _id: destinationProductId }, { pricingId: destinationPricing._id });

        // ========== STEP 4.5: Copy Product Specs (if any) ==========
        try {
            const sourceSpecs = await ProductSpecs.findOne({ productId: productId }) || await ProductSpecs.findById(sourceProduct.specsId);
            if (sourceSpecs) {
                const specsObj = (typeof sourceSpecs.toObject === 'function') ? sourceSpecs.toObject() : JSON.parse(JSON.stringify(sourceSpecs));
                delete specsObj._id;
                specsObj.productId = destinationProductId;
                const newSpecs = await ProductSpecs.create(specsObj);
                await Product.updateOne({ _id: destinationProductId }, { specsId: newSpecs._id });
                logger.info(`✓ Copied ProductSpecs to destination product ${destinationProductId}`);
            }
        } catch (err) {
            logger.error('Failed to copy ProductSpecs for destination product:', err);
        }

        // ========== STEP 5: Create destination stock ==========
        // Transfer ALL stock information except the source stock quantity
        // Destination gets only the transferred quantity, not the source's remaining stock
        const destinationStock = new ProductStock({
            productId: destinationProductId,
            shopId: toShopId,
            companyId: toCompanyId,
            variationId: null,
            // Stock quantity is what was transferred, NOT source remaining stock
            stockQty: transferQuantity,
            reservedQty: 0, // Fresh transfer has no reservations
            // Copy tracking settings from source
            trackQuantity: sourceStock.trackQuantity || true,
            allowBackorder: sourceStock.allowBackorder || false,
            lowStockThreshold: sourceStock.lowStockThreshold || 10,
            minReorderQty: sourceStock.minReorderQty || 20,
            safetyStock: sourceStock.safetyStock || 0,
            // Copy forecasting fields (reset analytics to baseline)
            avgDailySales: 0, // Reset - new product starts fresh
            stockoutRiskDays: 0,
            suggestedReorderQty: sourceStock.minReorderQty || 20,
            lastRestockDate: new Date(),
            supplierLeadDays: sourceStock.supplierLeadDays || 7,
            lastForecastUpdate: new Date(),
            // Analytics reset for new product
            totalUnitsSold: 0,
            totalRevenue: 0,
            avgCost: destinationPricing.cost || 0,
            profitMarginPercent: (destinationPricing.marginPercent || 0)
        });
        await destinationStock.save();

        // ========== STEP 6: Create StockChange record for destination only (audit trail) ==========
        // We do not create a negative stock change on the source as source stock is unchanged per request.
        const stockChangeResults = await StockChange.create([
            {
                companyId: toCompanyId,
                productId: destinationProductId,
                shopId: toShopId,
                type: 'transfer',
                qty: transferQuantity,
                previous: 0,
                new: transferQuantity,
                reason: reason || `Cross-company transfer from ${fromCompanyId} shop ${fromShopId}`,
                userId: userId || 'system',
                metadata: {
                    transferType: 'cross_company',
                    direction: 'in',
                    sourceCompany: fromCompanyId,
                    sourceShop: fromShopId,
                    sourceProductId: productId
                }
            }
        ]);

        // ========== STEP 8: Create ProductTransfer record for complete audit ==========
        const transferValue = transferQuantity * (sourcePricing.basePrice || 0);
        const productTransfer = new ProductTransfer({
            transferId: `TRF-CROSS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            transferType: 'cross_company',
            status: 'completed',

            sourceCompanyId: fromCompanyId,
            sourceShopId: fromShopId,
            sourceShopName: fromShopId,

            destinationCompanyId: toCompanyId,
            destinationShopId: toShopId,
            destinationShopName: toShopId,

            productId: productId,
            productName: sourceProduct.name,
            productSku: sourceProduct.sku,

            createdProductId: destinationProductId,

            quantity: transferQuantity,
            reason: reason || 'Cross-company stock transfer (inter-company sale)',

            sourceStockBefore: currentStock,
            sourceStockAfter: currentStock,
            destinationStockBefore: 0,
            destinationStockAfter: transferQuantity,

            transferredProductData: {
                pricing: {
                    cost: destinationPricing.cost,
                    basePrice: destinationPricing.basePrice,
                    salePrice: destinationPricing.salePrice,
                    currency: destinationPricing.currency
                },
                attributes: sourceProduct.metadata,
                images: sourceProduct.images,
                category: sourceProduct.category,
                tags: destinationProduct[0].tags,
                trackQuantity: destinationStock.trackQuantity,
                lowStockThreshold: destinationStock.lowStockThreshold,
                allowBackorder: destinationStock.allowBackorder
            },

            performedBy: {
                userId: userId || 'system'
            },

            sourceStockChangeId: null,
            destinationStockChangeId: stockChangeResults[0]._id,

            estimatedValue: transferValue,
            actualValue: transferValue,

            notes: notes,

            metadata: {
                isAutomatic: false,
                priority: 'high',
                triggeredBy: 'manual',
                tags: ['inter_company_sale']
            },

            initiatedAt: new Date(),
            completedAt: new Date()
        });
        await productTransfer.save();

        logger.info(
            `✅ Cross-company transfer: ${transferQuantity} units of product ${productId} from ${fromCompanyId}:${fromShopId} to ${toCompanyId}:${toShopId}`
        );

        // Invalidate caches (non-blocking)
        setImmediate(() => {
            try {
                delCache(`company:overview:${fromCompanyId}`);
                delCache(`company:overview:${toCompanyId}`);
                scanDel(`company:products:${fromCompanyId}:*`);
                scanDel(`company:products:${toCompanyId}:*`);
                delCache(`product:${productId}`);
                delCache(`product:${destinationProductId}`);
            } catch (err) {
                logger.error('Cache invalidation error after cross-company transfer:', err);
            }
        });

        // Background: update category stats and publish product created event
        setImmediate(async () => {
            try {
                // Update category stats if destination product has a category
                try {
                    const destProd = await Product.findById(destinationProductId).lean();
                    if (destProd && destProd.categoryId) {
                        await Category.updateOne({ _id: destProd.categoryId }, { $inc: { 'statistics.totalProducts': 1 } });
                    }
                } catch (err) {
                    logger.error('Background: category stats update failed for destination product:', err);
                }

                // Publish product.created event (fire-and-forget)
                try {
                    const prodDoc = await Product.findById(destinationProductId).populate('pricingId').lean();
                    if (prodDoc) {
                        await publishProductEvent('inventory.product.created', prodDoc).catch((e) => {
                            logger.error('Background: publishProductEvent failed:', e);
                        });
                    }
                } catch (err) {
                    logger.error('Background: failed to publish inventory.product.created:', err);
                }
            } catch (err) {
                logger.error('Background tasks for destination product failed:', err);
            }
        });

        res.json({
            success: true,
            message: 'Product transferred successfully across companies',
            data: {
                transferId: productTransfer.transferId,
                sourceProduct: {
                    productId: productId,
                    productName: sourceProduct.name,
                    productSku: sourceProduct.sku,
                    companyId: fromCompanyId,
                    shopId: fromShopId,
                    stockBefore: currentStock,
                    stockAfter: currentStock,
                    stockChangeId: null
                },
                destinationProduct: {
                    productId: destinationProductId,
                    productName: destinationProduct[0].name,
                    productSku: destinationProduct[0].sku,
                    companyId: toCompanyId,
                    shopId: toShopId,
                    stockBefore: 0,
                    stockAfter: transferQuantity,
                    stockChangeId: stockChangeResults[0]._id,
                    pricing: {
                        cost: destinationPricing.cost,
                        price: destinationPricing.price
                    }
                },
                quantityTransferred: transferQuantity,
                transferValue: transferValue,
                performedBy: userId,
                completedAt: new Date()
            }
        });
    } catch (error) {

        logger.error(`❌ Cross-company transfer error: ${error.message}`);

        // Return user-friendly error
        if (error.message.includes('Insufficient stock')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        throw error;
    }
});
// ==================== TRANSFER HISTORY OPERATIONS ====================

/**
 * @desc    Get transfer history for a product (all cross-company transfers)
 * @route   GET /api/v1/companies/:companyId/products/:productId/transfer-history
 * @access  Private
 */
const getProductTransferHistory = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    validateMongoId(productId);

    // Get original product
    const originalProduct = await Product.findById(productId);

    if (!originalProduct) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Get all stock changes related to this product (cross-company transfers)
    const transfers = await StockChange.find({
        $or: [
            {
                productId: productId,
                type: 'transfer',
                'metadata.transferType': 'cross_company'
            },
            {
                type: 'transfer',
                'metadata.transferType': 'cross_company'
            }
        ]
    })
        .sort({ timestamp: -1 });

    res.json({
        success: true,
        data: {
            originalProductId: productId,
            originalProductName: originalProduct.name,
            originalProductSku: originalProduct.sku,
            stockChangeRecords: transfers,
            totalTransfers: transfers.length
        }
    });
});

/**
 * @desc    Get all transferred copies of a product across companies
 * @route   GET /api/v1/companies/:companyId/products/:productId/transferred-copies
 * @access  Private
 */
const getTransferredProductCopies = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    validateMongoId(productId);

    // Get original product
    const originalProduct = await Product.findById(productId);

    if (!originalProduct) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Find all stock changes of type "transfer" for this product (outgoing cross-company)
    const outgoingTransfers = await StockChange.find({
        productId: productId,
        type: 'transfer',
        'metadata.transferType': 'cross_company',
        'metadata.direction': 'out'
    });

    // Get the destination product IDs from ProductTransfer records
    const productTransfers = await ProductTransfer.find({
        sourceProductId: productId,
        transferType: 'cross_company'
    }).select('destinationProductId');

    const transferredProductIds = productTransfers.map(t => t.destinationProductId);

    // Fetch all transferred copies
    const transferredProducts = await Product.find({
        _id: { $in: transferredProductIds }
    }).populate('categoryId', 'name');

    // Get current stock for each transferred product
    const productsWithStock = await Promise.all(
        transferredProducts.map(async (p) => {
            const stock = await ProductStock.findOne({ productId: p._id });
            return {
                copyProductId: p._id,
                companyId: p.companyId,
                name: p.name,
                sku: p.sku,
                currentQuantity: stock ? stock.stockQty : 0,
                category: p.category,
                createdAt: p.createdAt
            };
        })
    );

    res.json({
        success: true,
        data: {
            originalProductId: productId,
            originalProductName: originalProduct.name,
            originalProductSku: originalProduct.sku,
            originalCompanyId: originalProduct.companyId,
            transferredCopies: productsWithStock,
            totalCopiesCreated: transferredProducts.length
        }
    });
});

// ==================== HELPER FUNCTIONS ====================

function generateShopRecommendations(lowStockCount, totalProducts, profitMargin, unitsSold) {
    const recommendations = [];

    if (lowStockCount > totalProducts * 0.2) {
        recommendations.push('⚠️ High low-stock items - Schedule urgent replenishment');
    }

    if (profitMargin < 20) {
        recommendations.push('📉 Profit margin below 20% - Review pricing strategy');
    }

    if (unitsSold < 50) {
        recommendations.push('🐌 Low sales velocity - Consider promotions or product mix review');
    }

    if (recommendations.length === 0) {
        recommendations.push('✅ Shop metrics look healthy');
    }

    return recommendations;
}

// ==================== HELPER: CATEGORY AUTO-CREATION ====================

/**
 * Helper function to ensure category exists in destination company
 * If not, creates it with same details but different companyId
 * 
 * IMPORTANT: Only Level 3 categories are company-specific and need replication
 * Level 1 and 2 are global and shared across all companies
 * 
 * @param {ObjectId} sourceCategoryId - Category ID from source product (must be level 3)
 * @param {String} destinationCompanyId - Destination company ID
 * @returns {ObjectId} - Category ID in destination company (existing or newly created)
 */
async function ensureCategoryInDestinationCompany(sourceCategoryId, destinationCompanyId) {
    if (!sourceCategoryId) {
        return null; // No category to replicate
    }

    try {
        // Get source category
        const sourceCategory = await Category.findById(sourceCategoryId);

        if (!sourceCategory) {
            logger.warn(`Source category ${sourceCategoryId} not found`);
            return null;
        }

        // Ensure we replicate a LEVEL 3 category in the destination company.
        // If the source category is not level 3, try to find a level-3 child
        // beneath it (this is the typical case when a product references a
        // non-level-3 category by mistake). If none exists, we'll attach the
        // new level-3 under an appropriate level-2 parent (see below).

        let sourceCatForReplication = sourceCategory;
        if (sourceCategory.level !== 3) {
            const level3Child = await Category.findOne({ parentCategory: sourceCategory._id, level: 3 });
            if (level3Child) {
                sourceCatForReplication = level3Child;
            } else {
                // We'll replicate using the sourceCategory's data but FORCE level 3
                sourceCatForReplication = sourceCategory;
            }
        }

        // Determine parentCategory to use for level-3 in destination.
        const sourceParentLevel2Id = sourceCatForReplication.parentCategory || null;
        if (!sourceParentLevel2Id) {
            logger.warn(`Source category ${sourceCatForReplication._id} has no parentCategory; cannot replicate as level-3 using source L2. Aborting.`);
            return null;
        }

        // Per policy: do NOT create level-1/2 in destination. Reuse the source
        // parent level-2 ObjectId on the new level-3 category in destination.
        const parentForLevel3 = sourceParentLevel2Id;

        logger.info(`Replicating category. source=${sourceCatForReplication._id}, parentLevel2=${parentForLevel3}`);

        // Prepare full copy of the source category document
        const srcObj = (typeof sourceCatForReplication.toObject === 'function')
            ? sourceCatForReplication.toObject()
            : JSON.parse(JSON.stringify(sourceCatForReplication));

        // Remove mongoose-specific/internal fields that should not be copied
        delete srcObj._id;
        delete srcObj.__v;

        // Ensure required fields are set for destination
        srcObj.companyId = destinationCompanyId;
        srcObj.parentCategory = parentForLevel3;
        srcObj.level = 3;

        // Attempt to preserve slug; if duplicate key error occurs, make it unique
        let attempt = 0;
        while (true) {
            try {
                const created = await Category.create(srcObj);
                logger.info(`✓ Created replicated category ${created._id} in company ${destinationCompanyId} using parent ${parentForLevel3}`);
                return created._id;
            } catch (err) {
                // Handle duplicate slug/index conflicts by appending suffix
                if (err && err.code === 11000 && attempt < 5) {
                    attempt++;
                    const suffix = `-${destinationCompanyId.substring(0, 6)}${attempt > 1 ? `-${attempt}` : ''}`;
                    if (srcObj.slug) {
                        srcObj.slug = `${srcObj.slug}${suffix}`;
                    } else if (srcObj.name) {
                        const base = srcObj.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                        srcObj.slug = `${base}${suffix}`;
                    } else {
                        srcObj.slug = `cat${Date.now()}${suffix}`;
                    }
                    continue;
                }

                // Log and return null for other errors
                logger.error('Error creating replicated category in destination:', err);
                return null;
            }
        }

    } catch (error) {
        logger.error('Error ensuring category in destination company:', error);
        return null;
    }
}

/**
 * Ensure we have at least one valid level-3 category for the destination company.
 * If none exists, attempt to create a sensible fallback 'Uncategorized' level-3
 * under an existing level-2 parent. This ensures products with no category or
 * non-replicable categories still get a valid categoryId when transferred.
 * @param {String} destinationCompanyId
 * @returns {ObjectId|null}
 */
async function getOrCreateFallbackCategory(destinationCompanyId) {
    try {
        // 1) Try to find any level-3 category already scoped to the destination company
        const existingLevel3 = await Category.findOne({ companyId: destinationCompanyId, level: 3 });
        if (existingLevel3) return existingLevel3._id;

        // 2) Find a global level-2 parent to attach to (level 2 categories are global)
        let parentLevel2 = await Category.findOne({ level: 2 });

        // 3) If no level-2 exists, we must not create level-1/2 automatically.
        if (!parentLevel2) {
            logger.warn('No level-2 category found; cannot auto-create fallback level-3 without a parent.');
            return null;
        }

        // 4) Create a level-3 'Uncategorized' category for the destination company
        const uncategorizedName = 'Uncategorized';
        const newCat = await Category.create({
            name: uncategorizedName,
            description: 'Auto-created fallback category for cross-company transfers',
            level: 3,
            parentCategory: parentLevel2._id,
            companyId: destinationCompanyId,
            isActive: true
        });

        logger.info(`✓ Created fallback category for company ${destinationCompanyId}: ${newCat._id}`);
        return newCat._id;
    } catch (err) {
        logger.error('Error creating fallback category for destination company:', err);
        return null;
    }
}

/**
 * Ensure the source parent chain (level-1 -> level-2) exists in the current
 * database. Replicates level-1 and level-2 categories by name if they do not
 * exist and returns the destination level-2 _id to be used as parent for a
 * level-3 category. Returns null on failure.
 *
 * @param {ObjectId} sourceLevel2Id
 * @returns {ObjectId|null}
 */
async function ensureParentChainInDestination(sourceLevel2Id) {
    try {
        if (!sourceLevel2Id) return null;

        // Load source level-2 category (or its ancestor) and validate it exists.
        let sourceLevel2 = await Category.findById(sourceLevel2Id);
        if (!sourceLevel2) {
            logger.warn(`Source level-2 category ${sourceLevel2Id} not found`);
            return null;
        }

        if (sourceLevel2.level !== 2) {
            // try to find its level-2 ancestor
            let ancestor = await Category.findById(sourceLevel2.parentCategory);
            while (ancestor && ancestor.level !== 2) {
                ancestor = await Category.findById(ancestor.parentCategory);
            }
            if (!ancestor) {
                logger.warn(`No level-2 ancestor found for category ${sourceLevel2Id}`);
                return null;
            }
            sourceLevel2 = ancestor;
        }

        // Instead of creating new level-1/level-2 entries in destination, reuse
        // the exact parent level-2 ObjectId from source. Caller must accept that
        // this parent id may belong to a global level-2 category.
        logger.info(`Re-using source level-2 parent id ${sourceLevel2._id} (name=${sourceLevel2.name}) for replication`);
        return sourceLevel2._id;
    } catch (err) {
        logger.error('Error ensuring parent chain in destination:', err);
        return null;
    }
}

// ==================== BULK TRANSFER OPERATIONS ====================

/**
 * @desc    Bulk transfer multiple products between shops in same company
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/bulk-transfer
 * @access  Private
 */
const bulkTransferIntraCompany = asyncHandler(async (req, res) => {
    const { companyId, shopId: sourceShopId } = req.params;
    const { transfers, toShopId: destinationShopId, reason, userId, notes } = req.body;

    // Input Validation
    if (!Array.isArray(transfers) || transfers.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'transfers must be a non-empty array'
        });
    }

    const results = {
        successful: [],
        failed: [],
        totalRequested: transfers.length
    };

    try {
        for (const transfer of transfers) {
            const { productId, quantity } = transfer;

            try {
                // Get source product
                const sourceProduct = await Product.findOne({
                    _id: productId,
                    companyId,
                    isDeleted: false
                });

                if (!sourceProduct) {
                    throw new Error('Product not found');
                }

                // Get source stock - ProductStock only has productId + variationId
                // First find the source product to ensure it exists
                const sourceStock = await ProductStock.findOne({
                    productId,
                    variationId: null  // No variation for simple products
                });

                if (!sourceStock || sourceStock.stockQty < quantity) {
                    throw new Error(`Insufficient stock. Available: ${sourceStock?.stockQty || 0}`);
                }

                // Get pricing
                const sourcePricing = await ProductPricing.findOne({ productId });
                if (!sourcePricing) {
                    throw new Error('Product pricing not found');
                }

                // Create destination product instance
                const destinationProductData = sourceProduct.toObject();
                destinationProductData.shopId = destinationShopId;

                // Sanitize product data before creating destination product
                sanitizeDestinationProductData(destinationProductData);

                const destinationProduct = await Product.create(destinationProductData);
                const destinationProductId = destinationProduct._id;

                // Verify product was created
                const verifyBulkIntra = await Product.findById(destinationProductId);
                if (!verifyBulkIntra) {
                    throw new Error(`Bulk transfer destination product ${destinationProductId} failed to save`);
                }

                logger.info(`✅ Bulk intra-company destination product created: ${destinationProductId}, SKU: ${destinationProduct.sku}`);

                // Create destination pricing with full metadata
                const destinationPricing = await ProductPricing.create({
                    productId: destinationProductId,
                    basePrice: sourcePricing.basePrice,
                    salePrice: sourcePricing.salePrice,
                    listPrice: sourcePricing.listPrice,
                    cost: sourcePricing.cost,
                    currency: sourcePricing.currency || 'RWF',
                    priceTiers: sourcePricing.priceTiers || [],
                    taxInclusive: sourcePricing.taxInclusive,
                    taxRate: sourcePricing.taxRate,
                    effectiveFrom: sourcePricing.effectiveFrom,
                    effectiveTo: sourcePricing.effectiveTo,
                    profitRank: sourcePricing.profitRank || 'medium'
                });

                // Link pricing to destination product
                await Product.updateOne({ _id: destinationProductId }, { pricingId: destinationPricing._id });

                // Create destination stock with full metadata
                await ProductStock.create({
                    productId: destinationProductId,
                    variationId: null,
                    stockQty: quantity,
                    reservedQty: 0,
                    trackQuantity: sourceStock.trackQuantity !== undefined ? sourceStock.trackQuantity : true,
                    allowBackorder: sourceStock.allowBackorder || false,
                    lowStockThreshold: sourceStock.lowStockThreshold || 10,
                    minReorderQty: sourceStock.minReorderQty || 20,
                    safetyStock: sourceStock.safetyStock || 0,
                    supplierLeadDays: sourceStock.supplierLeadDays || 7,
                    suggestedReorderQty: sourceStock.minReorderQty || 20
                });

                // Replicate product specifications
                await replicateProductSpecs(productId, destinationProductId);

                // ========== Source stock remains UNCHANGED (no deduction) ==========
                const sourceStockBefore = sourceStock.stockQty;
                // sourceStock.stockQty -= quantity;  // Removed: source stock not deducted
                // await sourceStock.save();
                const sourceStockAfter = sourceStockBefore; // No change

                // Create stock change records
                await StockChange.insertMany([
                    {
                        companyId,
                        shopId: sourceShopId,
                        productId,
                        type: 'transfer',
                        qty: 0, // No deduction from source
                        previous: sourceStockBefore,
                        new: sourceStockAfter, // Same as before
                        reason: reason || `Bulk transfer to ${destinationShopId} (source stock unchanged)`,
                        userId,
                        metadata: {
                            transferType: 'intra_company_bulk',
                            transferredQty: quantity,
                            note: 'Source stock not deducted per business logic'
                        }
                    },
                    {
                        companyId,
                        shopId: destinationShopId,
                        productId: destinationProductId,
                        type: 'transfer',
                        qty: quantity,
                        previous: 0,
                        new: quantity,
                        reason: reason || `Bulk transfer from ${sourceShopId}`,
                        userId
                    }
                ]);

                // Create transfer record
                const transferIdIntra = `TRF-INTRA-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

                await ProductTransfer.create({
                    transferId: transferIdIntra,
                    transferType: 'intra_company',
                    status: 'completed',
                    sourceCompanyId: companyId,
                    sourceShopId: sourceShopId,
                    destinationCompanyId: companyId,
                    destinationShopId: destinationShopId,
                    productId: productId,
                    productName: sourceProduct.name,
                    productSku: sourceProduct.sku,
                    createdProductId: destinationProductId,
                    quantity: quantity,
                    reason: reason || `Bulk intra-company transfer`,
                    sourceStockBefore: sourceStockBefore,
                    sourceStockAfter: sourceStock.stockQty,
                    destinationStockBefore: 0,
                    destinationStockAfter: quantity,
                    performedBy: { userId },
                    notes: notes,
                    initiatedAt: new Date(),
                    completedAt: new Date()
                });

                // Trigger document generation (QR/Barcode)
                // Use setImmediate to avoid blocking the bulk loop
                setImmediate(async () => {
                    try {
                        const { requestQRCode, requestBarcode } = require('../utils/events/documentRequests');
                        await Promise.all([
                            requestQRCode(destinationProductId.toString(), destinationProduct.sku, companyId),
                            requestBarcode(destinationProductId.toString(), destinationProduct.sku, companyId)
                        ]).catch(err => logger.warn(`BulkIntra: doc gen error for ${destinationProductId}`, err));
                    } catch (e) {
                        logger.warn('BulkIntra: failed to init doc gen', e);
                    }
                });

                results.successful.push({
                    productId,
                    productName: sourceProduct.name,
                    quantity,
                    newProductId: destinationProductId
                });

            } catch (error) {
                logger.error(`Transfer failed for product ${transfer.productId}: ${error.message}`);
                results.failed.push({
                    productId: transfer.productId,
                    quantity: transfer.quantity,
                    error: error.message
                });
            }
        }

        const successCount = results.successful.length;
        const failureCount = results.failed.length;

        logger.info(`✅ Bulk intra-company transfer completed: ${successCount}/${results.totalRequested} successful, ${failureCount} failed`);

        // Return success even if some items failed (partial success)
        const statusCode = failureCount > 0 ? 207 : 200;

        res.status(statusCode).json({
            success: successCount > 0,
            message: `Bulk transfer completed: ${successCount}/${results.totalRequested} successful${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
            data: results
        });

    } catch (error) {
        logger.error('Bulk transfer error:', error);
        throw error;
    }
});

/**
 * @desc    Bulk transfer multiple products across companies with automatic category creation
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/bulk-cross-company-transfer
 * @access  Private
 */
const bulkTransferCrossCompany = asyncHandler(async (req, res) => {
    const { companyId: sourceCompanyId, shopId: sourceShopId } = req.params;
    const { transfers, toCompanyId, toShopId, reason, userId, notes } = req.body;

    // Input Validation
    if (!Array.isArray(transfers) || transfers.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'transfers array is required and must contain at least one item'
        });
    }

    if (!toCompanyId || !toShopId || !userId) {
        return res.status(400).json({
            success: false,
            message: 'toCompanyId, toShopId, and userId are required'
        });
    }

    if (sourceCompanyId === toCompanyId) {
        return res.status(400).json({
            success: false,
            message: 'Use bulk-transfer endpoint for intra-company transfers'
        });
    }

    // Validate all product IDs upfront
    for (const transfer of transfers) {
        if (!transfer.productId || !transfer.quantity) {
            return res.status(400).json({
                success: false,
                message: 'Each transfer must have productId and quantity'
            });
        }
        if (transfer.quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be greater than 0'
            });
        }
        try {
            validateMongoId(transfer.productId);
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: `Invalid product ID format: ${transfer.productId}`
            });
        }
    }

    const results = {
        successful: [],
        failed: [],
        categoriesCreated: [],
        totalRequested: transfers.length
    };

    try {
        // Group products by category to optimize category creation
        const categoryMap = new Map(); // sourceCategoryId -> destinationCategoryId

        for (const transfer of transfers) {
            const { productId, quantity, pricingOverride } = transfer;

            try {
                // Get source product
                const sourceProduct = await Product.findOne({
                    _id: productId,
                    companyId: sourceCompanyId,
                    isDeleted: false
                });

                if (!sourceProduct) {
                    throw new Error('Product not found');
                }

                // Get source stock - ProductStock only has productId + variationId
                const sourceStock = await ProductStock.findOne({
                    productId,
                    variationId: null  // No variation for simple products
                });

                if (!sourceStock || sourceStock.stockQty < quantity) {
                    throw new Error(`Insufficient stock. Available: ${sourceStock?.stockQty || 0}`);
                }

                // Get pricing
                const sourcePricing = await ProductPricing.findOne({ productId });
                if (!sourcePricing) {
                    throw new Error('Product pricing not found');
                }

                // ========== HANDLE CATEGORY ==========
                let destinationCategoryId = null;

                if (sourceProduct.categoryId) {
                    const sourceCatId = sourceProduct.categoryId.toString();

                    // Check if we've already processed this category
                    if (categoryMap.has(sourceCatId)) {
                        destinationCategoryId = categoryMap.get(sourceCatId);
                    } else {
                        // Ensure category exists in destination company
                        destinationCategoryId = await ensureCategoryInDestinationCompany(
                            sourceProduct.categoryId,
                            toCompanyId
                        );

                        if (destinationCategoryId) {
                            categoryMap.set(sourceCatId, destinationCategoryId);

                            // Check if this is a newly created category
                            const isNew = !results.categoriesCreated.find(c => c.categoryId === destinationCategoryId.toString());
                            if (isNew && destinationCategoryId.toString() !== sourceCatId) {
                                const destCat = await Category.findById(destinationCategoryId);
                                results.categoriesCreated.push({
                                    categoryId: destinationCategoryId.toString(),
                                    categoryName: destCat?.name || 'Unknown',
                                    sourceCategory: sourceCatId
                                });
                            }
                        }
                    }
                }

                // Create destination product instance
                const destinationProductData = sourceProduct.toObject();
                destinationProductData.companyId = toCompanyId;
                destinationProductData.shopId = toShopId;
                // If category mapping failed or source product had no category,
                // ensure we have a valid categoryId for destination product.
                if (!destinationCategoryId) {
                    // Try to obtain or create a fallback level-3 category scoped to destination company
                    destinationCategoryId = await getOrCreateFallbackCategory(toCompanyId);
                    if (destinationCategoryId) {
                        // Record that we created/mapped a category for reporting
                        const isNew = !results.categoriesCreated.find(c => c.categoryId === destinationCategoryId.toString());
                        if (isNew) {
                            const destCat = await Category.findById(destinationCategoryId);
                            results.categoriesCreated.push({
                                categoryId: destinationCategoryId.toString(),
                                categoryName: destCat?.name || 'Uncategorized',
                                sourceCategory: sourceProduct.categoryId ? sourceProduct.categoryId.toString() : null
                            });
                        }
                    }
                }

                // If after attempts we still don't have a category mapping, abort this product
                if (!destinationCategoryId) {
                    throw new Error('Unable to map or create a level-3 category in destination company; no suitable level-2 parent available');
                }

                destinationProductData.categoryId = destinationCategoryId;

                // Sanitize product data before creating destination product
                sanitizeDestinationProductData(destinationProductData);

                const destinationProduct = await Product.create(destinationProductData);
                const destinationProductId = destinationProduct._id;

                // Verify product was created
                const verifyBulkCross = await Product.findById(destinationProductId);
                if (!verifyBulkCross) {
                    throw new Error(`Bulk cross-company transfer destination product ${destinationProductId} failed to save`);
                }

                logger.info(`✅ Bulk cross-company destination product created: ${destinationProductId}, SKU: ${destinationProduct.sku}`);

                // Create destination pricing with full metadata
                const destinationPricing = await ProductPricing.create({
                    productId: destinationProductId,
                    basePrice: pricingOverride?.basePrice || sourcePricing.basePrice,
                    salePrice: pricingOverride?.salePrice || sourcePricing.salePrice,
                    listPrice: pricingOverride?.listPrice || sourcePricing.listPrice,
                    cost: pricingOverride?.cost || sourcePricing.cost,
                    currency: sourcePricing.currency || 'RWF',
                    priceTiers: sourcePricing.priceTiers || [],
                    taxInclusive: sourcePricing.taxInclusive,
                    taxRate: sourcePricing.taxRate,
                    effectiveFrom: sourcePricing.effectiveFrom,
                    effectiveTo: sourcePricing.effectiveTo,
                    profitRank: sourcePricing.profitRank || 'medium'
                });

                // Link pricing to destination product
                await Product.updateOne({ _id: destinationProductId }, { pricingId: destinationPricing._id });

                // Create destination stock with full metadata
                await ProductStock.create({
                    productId: destinationProductId,
                    variationId: null,
                    stockQty: quantity,
                    reservedQty: 0,
                    trackQuantity: sourceStock.trackQuantity !== undefined ? sourceStock.trackQuantity : true,
                    allowBackorder: sourceStock.allowBackorder || false,
                    lowStockThreshold: sourceStock.lowStockThreshold || 10,
                    minReorderQty: sourceStock.minReorderQty || 20,
                    safetyStock: sourceStock.safetyStock || 0,
                    supplierLeadDays: sourceStock.supplierLeadDays || 7,
                    suggestedReorderQty: sourceStock.minReorderQty || 20
                });

                // Replicate product specifications
                await replicateProductSpecs(productId, destinationProductId);

                // ========== Source stock remains UNCHANGED (no deduction) ==========
                const sourceStockBefore = sourceStock.stockQty;
                // sourceStock.stockQty -= quantity;  // Removed: source stock not deducted
                // await sourceStock.save();
                const sourceStockAfter = sourceStockBefore; // No change

                // Create stock change records
                await StockChange.insertMany([
                    {
                        companyId: sourceCompanyId,
                        shopId: sourceShopId,
                        productId,
                        type: 'transfer',
                        qty: 0, // No deduction from source
                        previous: sourceStockBefore,
                        new: sourceStockAfter, // Same as before
                        reason: reason || `Cross-company bulk transfer to ${toCompanyId} (source stock unchanged)`,
                        userId,
                        metadata: {
                            transferType: 'cross_company_bulk',
                            transferredQty: quantity,
                            note: 'Source stock not deducted per business logic'
                        }
                    },
                    {
                        companyId: toCompanyId,
                        shopId: toShopId,
                        productId: destinationProductId,
                        type: 'transfer',
                        qty: quantity,
                        previous: 0,
                        new: quantity,
                        reason: reason || `Bulk cross-company transfer from ${sourceCompanyId}`,
                        userId,
                        metadata: { transferType: 'cross_company', direction: 'in' }
                    }
                ]);

                // Create transfer record
                const transferIdCross = `TRF-CROSS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

                await ProductTransfer.create({
                    transferId: transferIdCross,
                    transferType: 'cross_company',
                    status: 'completed',
                    sourceCompanyId,
                    sourceShopId,
                    destinationCompanyId: toCompanyId,
                    destinationShopId: toShopId,
                    productId: productId,
                    productName: sourceProduct.name,
                    productSku: sourceProduct.sku,
                    createdProductId: destinationProductId,
                    quantity: quantity,
                    reason: reason || 'Bulk cross-company transfer',
                    sourceStockBefore: sourceStockBefore,
                    sourceStockAfter: sourceStock.stockQty,
                    destinationStockBefore: 0,
                    destinationStockAfter: quantity,
                    performedBy: { userId },
                    notes: notes,
                    initiatedAt: new Date(),
                    completedAt: new Date()
                });

                // Trigger document generation (QR/Barcode)
                // Use setImmediate to avoid blocking the bulk loop
                setImmediate(async () => {
                    try {
                        const { requestQRCode, requestBarcode } = require('../utils/events/documentRequests');
                        await Promise.all([
                            requestQRCode(destinationProductId.toString(), destinationProduct.sku, toCompanyId),
                            requestBarcode(destinationProductId.toString(), destinationProduct.sku, toCompanyId)
                        ]).catch(err => logger.warn(`BulkCross: doc gen error for ${destinationProductId}`, err));
                    } catch (e) {
                        logger.warn('BulkCross: failed to init doc gen', e);
                    }
                });

                results.successful.push({
                    productId,
                    productName: sourceProduct.name,
                    quantity,
                    newProductId: destinationProductId,
                    categoryMapped: !!destinationCategoryId
                });

            } catch (error) {
                logger.error(`Cross-company transfer failed for product ${transfer.productId}: ${error.message}`);
                results.failed.push({
                    productId: transfer.productId,
                    quantity: transfer.quantity,
                    error: error.message
                });
            }
        }

        const successCount = results.successful.length;
        const failureCount = results.failed.length;

        logger.info(`✅ Bulk cross-company transfer completed: ${successCount}/${results.totalRequested} successful, ${failureCount} failed`);
        logger.info(`✅ Categories created/mapped: ${results.categoriesCreated.length}`);

        // Return success even if some items failed (partial success)
        const statusCode = failureCount > 0 ? 207 : 200;

        res.status(statusCode).json({
            success: successCount > 0,
            message: `Bulk cross-company transfer completed: ${successCount}/${results.totalRequested} successful${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
            data: results
        });

    } catch (error) {
        logger.error('Bulk cross-company transfer error:', error);
        throw error;
    }
});

// ==================== EXPORTS ====================

module.exports = {
    // Company Level
    getCompanyOverview,
    getCompanyProducts,
    getCompanyStockChanges,
    getCompanyAlerts,
    getCompanyAdjustments,
    getCompanyReports,
    getProductReport,
    getCategoryReport,
    getDailyReport,
    createDailySummaryAlert,
    getCompanyLowStockProducts,
    getCompanyInventorySummary,
    getCompanyShops,
    getProductBySku,

    // Shop Level
    getShopOverview,
    getShopProducts,
    getShopProductInventory,
    getShopStockChanges,
    getShopAlerts,
    getShopAdjustments,
    getShopInventorySummary,
    getShopLowStockProducts,
    getShopReport,
    getShopTopSellers,
    getShopAdvancedAnalytics,
    getProductComparison,
    getShopPerformanceMetrics,
    allocateInventoryToShop,
    transferStockBetweenShops,

    // Cross-Company
    transferProductCrossCompany,
    getProductTransferHistory,
    getTransferredProductCopies,

    // Bulk Transfers
    bulkTransferIntraCompany,
    bulkTransferCrossCompany
};