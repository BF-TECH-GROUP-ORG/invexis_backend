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
const ProductStock = require('../models/ProductStock');
const ProductPricing = require('../models/ProductPricing');
const ProductTransfer = require('../models/ProductTransfer');
const { formatEnrichedProduct } = require('../utils/productFormatter');
const ProductSpecs = require('../models/productSpecs');
// Helper: sanitize product data before creating destination product copies
function sanitizeDestinationProductData(data) {
    const fieldsToRemove = [
        '_id',
        'sku',
        'barcode',
        'scanId',
        'barcodePayload',
        'qrPayload',
        'qrCode',
        'asin',
        'upc',
        'slug',
        'pricingId',
        'scanCode',
        'externalId',
        'ean',
        'jan',
        'gtin'
    ];
    fieldsToRemove.forEach((f) => { if (f in data) delete data[f]; });
    return data;
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

    // Total products
    const totalProducts = await Product.countDocuments({ companyId });

    // Total stock and value using ProductStock joined to Product and pricing
    const stockAgg = await ProductStock.aggregate([
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.companyId': companyId } },
        { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
        { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
        { $group: { _id: null, totalStock: { $sum: '$stockQty' }, totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$avgCost', { $ifNull: ['$pricing.cost', 0] }] }] } } } }
    ]);

    const { totalStock = 0, totalValue = 0 } = stockAgg[0] || {};

    // Low stock and out-of-stock counts using ProductStock
    const lowStockAgg = await ProductStock.aggregate([
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.companyId': companyId } },
        { $match: { isLowStock: true } },
        { $count: 'lowCount' }
    ]);

    const lowStockCount = (lowStockAgg[0] && lowStockAgg[0].lowCount) || 0;

    const outOfStockAgg = await ProductStock.aggregate([
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.companyId': companyId } },
        { $match: { inStock: false } },
        { $count: 'outCount' }
    ]);

    const outOfStockCount = (outOfStockAgg[0] && outOfStockAgg[0].outCount) || 0;

    // Active alerts
    const activeAlerts = await Alert.countDocuments({ companyId, isResolved: false });

    // Pending adjustments
    const pendingAdjustments = await InventoryAdjustment.countDocuments({ companyId, status: 'pending' });

    const response = {
        companyId,
        totalProducts,
        totalStock,
        totalValue: totalValue.toFixed(2),
        lowStockCount,
        outOfStockCount,
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
 * @desc    Get all stock changes for a company (audit trail)
 * @route   GET /api/v1/companies/:companyId/stock-changes
 * @access  Private
 */
const getCompanyStockChanges = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { page = 1, limit = 50, changeType, startDate, endDate } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { companyId };
    if (changeType) query.changeType = changeType;
    if (startDate || endDate) {
        query.changeDate = {};
        if (startDate) query.changeDate.$gte = new Date(startDate);
        if (endDate) query.changeDate.$lte = new Date(endDate);
    }

    const changes = await StockChange.find(query)
        .populate('productId', 'name sku')
        .sort({ changeDate: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await StockChange.countDocuments(query);

    res.json({
        success: true,
        data: changes,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
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

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {
        companyId,
        $expr: {
            $lte: [
                {
                    $cond: [
                        { $gt: [{ $size: '$variations' }, 0] },
                        { $sum: '$variations.stockQty' },
                        '$inventory.quantity'
                    ]
                },
                '$inventory.lowStockThreshold'
            ]
        }
    };

    if (shopId) query.shopId = shopId;

    const products = await Product.find(query)
        .populate('categoryId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

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
 * @desc    Get inventory summary for a company
 * @route   GET /api/v1/companies/:companyId/inventory-summary
 * @access  Private
 */
const getCompanyInventorySummary = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // By category
    const byCategoryData = await Product.aggregate([
        { $match: { companyId } },
        {
            $lookup: {
                from: 'categories',
                localField: 'category',
                foreignField: '_id',
                as: 'categoryInfo'
            }
        },
        {
            $group: {
                _id: '$category',
                categoryName: { $first: { $arrayElemAt: ['$categoryInfo.name', 0] } },
                productCount: { $sum: 1 },
                totalStock: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $size: '$variations' }, 0] },
                            { $sum: '$variations.stockQty' },
                            '$inventory.quantity'
                        ]
                    }
                },
                totalValue: {
                    $sum: {
                        $multiply: [
                            {
                                $cond: [
                                    { $gt: [{ $size: '$variations' }, 0] },
                                    { $sum: '$variations.stockQty' },
                                    '$inventory.quantity'
                                ]
                            },
                            { $ifNull: ['$pricing.cost', 0] }
                        ]
                    }
                }
            }
        },
        { $sort: { totalValue: -1 } }
    ]);

    // By shop
    const byShopData = await Product.aggregate([
        { $match: { companyId } },
        {
            $group: {
                _id: '$shopId',
                shopId: { $first: '$shopId' },
                productCount: { $sum: 1 },
                totalStock: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $size: '$variations' }, 0] },
                            { $sum: '$variations.stockQty' },
                            '$inventory.quantity'
                        ]
                    }
                },
                totalValue: {
                    $sum: {
                        $multiply: [
                            {
                                $cond: [
                                    { $gt: [{ $size: '$variations' }, 0] },
                                    { $sum: '$variations.stockQty' },
                                    '$inventory.quantity'
                                ]
                            },
                            { $ifNull: ['$pricing.cost', 0] }
                        ]
                    }
                }
            }
        },
        { $sort: { totalValue: -1 } }
    ]);

    res.json({
        success: true,
        data: {
            byCategory: byCategoryData,
            byShop: byShopData,
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

    const shopStats = await Product.aggregate([
        { $match: { companyId } },
        {
            $group: {
                _id: '$shopId',
                shopId: { $first: '$shopId' },
                productCount: { $sum: 1 },
                totalStock: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $size: '$variations' }, 0] },
                            { $sum: '$variations.stockQty' },
                            '$inventory.quantity'
                        ]
                    }
                },
                totalValue: {
                    $sum: {
                        $multiply: [
                            {
                                $cond: [
                                    { $gt: [{ $size: '$variations' }, 0] },
                                    { $sum: '$variations.stockQty' },
                                    '$inventory.quantity'
                                ]
                            },
                            { $ifNull: ['$pricing.cost', 0] }
                        ]
                    }
                },
                lowStockCount: {
                    $sum: {
                        $cond: [
                            {
                                $lte: [
                                    {
                                        $cond: [
                                            { $gt: [{ $size: '$variations' }, 0] },
                                            { $sum: '$variations.stockQty' },
                                            '$inventory.quantity'
                                        ]
                                    },
                                    '$inventory.lowStockThreshold'
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        { $sort: { totalValue: -1 } }
    ]);

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
        // Stock movement report (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const movement = await StockChange.aggregate([
            {
                $match: {
                    companyId,
                    changeDate: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: '$changeType',
                    count: { $sum: 1 },
                    totalQuantity: { $sum: '$quantity' }
                }
            }
        ]);

        res.json({
            success: true,
            reportType: 'stock-movement',
            data: {
                period: '30 days',
                movement,
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
    const stockData = await Product.aggregate([
        { $match: { companyId } },
        {
            $group: {
                _id: null,
                totalStock: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $size: '$variations' }, 0] },
                            { $sum: '$variations.stockQty' },
                            '$inventory.quantity'
                        ]
                    }
                }
            }
        }
    ]);

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
        query['inventory.quantity'] = { $gt: 0 };
    }

    const products = await Product.find(query)
        .populate('categoryId')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await Product.countDocuments(query);

    // Transform products to include shop-specific inventory
    const shopProducts = products.map(product => {
        return {
            ...product,
            shopInventory: {
                quantity: product.inventory.quantity || 0,
                lowStockThreshold: product.inventory.lowStockThreshold,
                effectivePrice: product.pricing.salePrice || product.pricing.basePrice
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

    res.json({
        success: true,
        data: {
            productId: product._id,
            name: product.name,
            sku: product.sku,
            category: product.category,
            shopInventory: {
                quantity: product.inventory.quantity || 0,
                lowStockThreshold: product.inventory.lowStockThreshold,
                effectivePrice: product.pricing.salePrice || product.pricing.basePrice
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

        // Update product-level inventory and create stock change
        const previous = product.inventory.quantity || 0;
        const newStock = previous + quantity;
        product.inventory.quantity = newStock;

        await product.save();

        // Create stock change record (no warehouse model; warehouseId left null)
        const stockChange = new StockChange({
            companyId,
            productId: product._id,
            warehouseId: null,
            shopId: shopId,
            changeType: 'transfer',
            quantity,
            previousStock: previous,
            newStock,
            reason: reason || `Allocated to shop ${shopId}`,
            changedBy: userId || 'system'
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

    // Aggregate shop inventory data - now using simple shopId field
    const summary = await Product.aggregate([
        {
            $match: {
                companyId,
                shopId: shopId
            }
        },
        {
            $project: {
                quantity: '$inventory.quantity',
                lowStockThreshold: '$inventory.lowStockThreshold'
            }
        },
        {
            $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalQuantity: { $sum: { $ifNull: ['$quantity', 0] } },
                lowStockCount: {
                    $sum: {
                        $cond: [
                            { $lte: ['$quantity', '$lowStockThreshold'] },
                            1,
                            0
                        ]
                    }
                },
                outOfStockCount: {
                    $sum: {
                        $cond: [
                            { $lte: ['$quantity', 0] },
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

    const limitNum = Math.min(parseInt(limit), 50);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period));

    // Get top-selling products for this shop in the period
    const topSellers = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                changeType: 'sale',
                changeDate: { $gte: fromDate }
            }
        },
        {
            $group: {
                _id: '$productId',
                unitsSold: { $sum: { $abs: '$quantity' } },
                transactionCount: { $sum: 1 },
                lastSaleDate: { $max: '$changeDate' }
            }
        },
        { $sort: { unitsSold: -1 } },
        { $limit: limitNum },
        {
            $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'product'
            }
        },
        { $unwind: '$product' },
        {
            $project: {
                productId: '$_id',
                name: '$product.name',
                sku: '$product.sku',
                brand: '$product.brand',
                category: '$product.category',
                unitsSold: 1,
                transactionCount: 1,
                lastSaleDate: 1,
                currentStock: '$product.inventory.quantity',
                basePrice: '$product.pricing.basePrice',
                costPrice: '$product.pricing.cost',
                revenue: { $multiply: ['$unitsSold', '$product.pricing.basePrice'] },
                profitMargin: {
                    $multiply: [
                        {
                            $divide: [
                                { $subtract: ['$product.pricing.basePrice', '$product.pricing.cost'] },
                                '$product.pricing.basePrice'
                            ]
                        },
                        100
                    ]
                },
                daysToStockOut: {
                    $cond: [
                        { $gt: ['$unitsSold', 0] },
                        {
                            $divide: [
                                '$product.inventory.quantity',
                                { $divide: ['$unitsSold', parseInt(period)] }
                            ]
                        },
                        999
                    ]
                },
                velocityPerDay: {
                    $divide: ['$unitsSold', parseInt(period)]
                }
            }
        }
    ]);

    res.json({
        success: true,
        shopId,
        period: `${period} days`,
        count: topSellers.length,
        data: topSellers.map(product => ({
            productId: product.productId,
            name: product.name,
            sku: product.sku,
            brand: product.brand,
            sales: {
                unitsSold: product.unitsSold,
                transactionCount: product.transactionCount,
                totalRevenue: parseFloat(product.revenue.toFixed(2)),
                velocityPerDay: parseFloat(product.velocityPerDay.toFixed(2))
            },
            inventory: {
                currentStock: product.currentStock,
                daysToStockOut: product.daysToStockOut > 998 ? 'N/A' : Math.round(product.daysToStockOut),
                lowStockAlert: product.currentStock < 10
            },
            pricing: {
                basePrice: product.basePrice,
                costPrice: product.costPrice,
                profitMargin: parseFloat(product.profitMargin.toFixed(2))
            },
            lastSaleDate: product.lastSaleDate
        }))
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

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(period));

    // 1. Sales Performance
    const salesData = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                changeType: 'sale',
                changeDate: { $gte: fromDate }
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
                _id: null,
                totalUnitsSold: { $sum: { $abs: '$quantity' } },
                totalRevenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } },
                totalCost: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.cost'] } },
                transactionCount: { $sum: 1 }
            }
        }
    ]);

    // 2. Inventory Health
    const inventoryHealth = await Product.aggregate([
        { $match: { companyId, shopId } },
        {
            $facet: {
                summary: [
                    {
                        $group: {
                            _id: null,
                            totalProducts: { $sum: 1 },
                            totalStock: { $sum: '$inventory.quantity' },
                            inventoryValue: { $sum: { $multiply: ['$inventory.quantity', '$pricing.cost'] } },
                            avgStockPerProduct: { $avg: '$inventory.quantity' }
                        }
                    }
                ],
                health: [
                    {
                        $project: {
                            status: {
                                $cond: [
                                    { $eq: ['$inventory.quantity', 0] },
                                    'outOfStock',
                                    {
                                        $cond: [
                                            { $lte: ['$inventory.quantity', { $ifNull: ['$inventory.lowStockThreshold', 10] }] },
                                            'lowStock',
                                            'healthy'
                                        ]
                                    }
                                ]
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]
            }
        }
    ]);

    // 3. Category Performance
    const categoryPerformance = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                changeType: 'sale',
                changeDate: { $gte: fromDate }
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
            $lookup: {
                from: 'categories',
                localField: 'product.category',
                foreignField: '_id',
                as: 'category'
            }
        },
        {
            $group: {
                _id: '$category.name',
                unitsSold: { $sum: { $abs: '$quantity' } },
                revenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } },
                products: { $sum: 1 }
            }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 }
    ]);

    // 4. Stock Movement Patterns
    const stockMovement = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                changeDate: { $gte: fromDate }
            }
        },
        {
            $group: {
                _id: '$changeType',
                count: { $sum: 1 },
                totalQuantity: { $sum: { $abs: '$quantity' } }
            }
        }
    ]);

    // 5. Active Alerts
    const activeAlerts = await Alert.countDocuments({
        companyId,
        shopId,
        isResolved: false
    });

    // 6. Recent Adjustments
    const recentAdjustments = await InventoryAdjustment.find({
        companyId,
        shopId
    }).sort({ createdAt: -1 }).limit(5).lean();

    const sales = salesData[0] || {
        totalUnitsSold: 0,
        totalRevenue: 0,
        totalCost: 0,
        transactionCount: 0
    };

    const inventory = inventoryHealth[0]?.summary[0] || {
        totalProducts: 0,
        totalStock: 0,
        inventoryValue: 0,
        avgStockPerProduct: 0
    };

    const health = inventoryHealth[0]?.health || [];
    const healthMap = {};
    health.forEach(h => {
        healthMap[h._id] = h.count;
    });

    const grossProfit = sales.totalRevenue - sales.totalCost;
    const profitMargin = sales.totalRevenue > 0 ? ((grossProfit / sales.totalRevenue) * 100) : 0;

    const analytics = {
        success: true,
        shopId,
        period: `${period} days`,
        timestamp: new Date(),

        // Sales Performance
        sales: {
            totalUnits: sales.totalUnitsSold,
            totalRevenue: parseFloat(sales.totalRevenue.toFixed(2)),
            totalCost: parseFloat(sales.totalCost.toFixed(2)),
            grossProfit: parseFloat(grossProfit.toFixed(2)),
            profitMargin: parseFloat(profitMargin.toFixed(2)),
            avgTransactionValue: sales.transactionCount > 0 ? parseFloat((sales.totalRevenue / sales.transactionCount).toFixed(2)) : 0,
            avgUnitsPerTransaction: sales.transactionCount > 0 ? parseFloat((sales.totalUnitsSold / sales.transactionCount).toFixed(2)) : 0,
            transactionCount: sales.transactionCount,
            dailyAvgRevenue: parseFloat((sales.totalRevenue / parseInt(period)).toFixed(2))
        },

        // Inventory Health
        inventory: {
            totalProducts: inventory.totalProducts,
            totalStock: inventory.totalStock,
            inventoryValue: parseFloat(inventory.inventoryValue.toFixed(2)),
            avgStockPerProduct: parseFloat(inventory.avgStockPerProduct.toFixed(2)),
            status: {
                healthy: healthMap.healthy || 0,
                lowStock: healthMap.lowStock || 0,
                outOfStock: healthMap.outOfStock || 0,
                healthScore: inventory.totalProducts > 0
                    ? parseFloat((((healthMap.healthy || 0) / inventory.totalProducts) * 100).toFixed(2))
                    : 0
            }
        },

        // Category Performance
        categoryBreakdown: categoryPerformance.map(cat => ({
            category: cat._id || 'Uncategorized',
            unitsSold: cat.unitsSold,
            revenue: parseFloat(cat.revenue.toFixed(2)),
            productsInvolved: cat.products,
            revenueShare: sales.totalRevenue > 0 ? parseFloat((cat.revenue / sales.totalRevenue * 100).toFixed(2)) : 0
        })),

        // Stock Movement
        stockMovement: stockMovement.map(move => ({
            type: move._id,
            count: move.count,
            totalQuantity: move.totalQuantity,
            percentOfTotal: stockMovement.reduce((sum, m) => sum + m.count, 0) > 0
                ? parseFloat((move.count / stockMovement.reduce((sum, m) => sum + m.count, 0) * 100).toFixed(2))
                : 0
        })),

        // Operational Metrics
        operations: {
            activeAlerts,
            recentAdjustments: recentAdjustments.map(adj => ({
                id: adj._id,
                type: adj.adjustmentType,
                quantity: adj.quantity,
                reason: adj.reason,
                status: adj.status,
                createdAt: adj.createdAt
            }))
        },

        // KPI Summary
        kpis: {
            healthStatus: healthMap.healthy / inventory.totalProducts > 0.9 ? '✅ Excellent' :
                healthMap.healthy / inventory.totalProducts > 0.7 ? '⚠️ Good' : '❌ Needs Attention',
            profitabilityTrend: profitMargin >= 25 ? '📈 Healthy' : '📉 Below Target',
            velocityStatus: sales.totalUnitsSold > 100 ? '🚀 High Velocity' : '🐌 Moderate Velocity',
            recommendations: generateShopRecommendations(
                healthMap.lowStock,
                inventory.totalProducts,
                profitMargin,
                sales.totalUnitsSold
            )
        }
    };

    res.json(analytics);
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
                changeType: 'sale',
                changeDate: { $gte: fromDate },
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
                unitsSold: { $sum: { $abs: '$quantity' } },
                revenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } },
                costOfSales: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.cost'] } },
                transactionCount: { $sum: 1 },
                currentStock: { $first: '$product.inventory.quantity' }
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

    // Today vs Yesterday comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todaySales = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                changeType: 'sale',
                changeDate: { $gte: today, $lt: tomorrow }
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
                _id: null,
                units: { $sum: { $abs: '$quantity' } },
                revenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } }
            }
        }
    ]);

    const yesterdaySales = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                changeType: 'sale',
                changeDate: { $gte: yesterday, $lt: today }
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
                _id: null,
                units: { $sum: { $abs: '$quantity' } },
                revenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } }
            }
        }
    ]);

    const today_data = todaySales[0] || { units: 0, revenue: 0 };
    const yesterday_data = yesterdaySales[0] || { units: 0, revenue: 0 };

    const unitGrowth = yesterday_data.units > 0 ? ((today_data.units - yesterday_data.units) / yesterday_data.units * 100) : 0;
    const revenueGrowth = yesterday_data.revenue > 0 ? ((today_data.revenue - yesterday_data.revenue) / yesterday_data.revenue * 100) : 0;

    const metrics = {
        success: true,
        shopId,
        timestamp: new Date(),
        today: {
            units: today_data.units,
            revenue: parseFloat(today_data.revenue.toFixed(2))
        },
        yesterday: {
            units: yesterday_data.units,
            revenue: parseFloat(yesterday_data.revenue.toFixed(2))
        },
        growth: {
            unitGrowth: parseFloat(unitGrowth.toFixed(2)),
            revenueGrowth: parseFloat(revenueGrowth.toFixed(2)),
            unitTrend: unitGrowth > 0 ? '📈 Up' : unitGrowth < 0 ? '📉 Down' : '➡️ Flat',
            revenueTrend: revenueGrowth > 0 ? '📈 Up' : revenueGrowth < 0 ? '📉 Down' : '➡️ Flat'
        }
    };

    res.json(metrics);
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

    // Total stock & value
    const stockData = await Product.aggregate([
        { $match: { companyId, shopId } },
        {
            $group: {
                _id: null,
                totalStock: { $sum: '$inventory.quantity' },
                totalValue: { $sum: { $multiply: ['$inventory.quantity', '$pricing.cost'] } }
            }
        }
    ]);

    const { totalStock = 0, totalValue = 0 } = stockData[0] || {};

    // Low stock
    const lowStockCount = await Product.countDocuments({
        companyId,
        shopId,
        $expr: { $lte: ['$inventory.quantity', '$inventory.lowStockThreshold'] }
    });

    // Out of stock
    const outOfStockCount = await Product.countDocuments({
        companyId,
        shopId,
        'inventory.quantity': 0
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
    const { page = 1, limit = 50, changeType, startDate, endDate } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { companyId, shopId };
    if (changeType) query.changeType = changeType;
    if (startDate || endDate) {
        query.changeDate = {};
        if (startDate) query.changeDate.$gte = new Date(startDate);
        if (endDate) query.changeDate.$lte = new Date(endDate);
    }

    const changes = await StockChange.find(query)
        .populate('productId', 'name sku')
        .sort({ changeDate: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await StockChange.countDocuments(query);

    res.json({
        success: true,
        data: changes,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
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
        shopId,
        $expr: { $lte: ['$inventory.quantity', '$inventory.lowStockThreshold'] }
    };

    const products = await Product.find(query)
        .populate('categoryId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

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

    // Overview
    const overview = await Product.aggregate([
        { $match: { companyId, shopId } },
        {
            $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalStock: { $sum: '$inventory.quantity' },
                totalValue: { $sum: { $multiply: ['$inventory.quantity', '$pricing.cost'] } }
            }
        }
    ]);

    // Stock movement (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const movement = await StockChange.aggregate([
        {
            $match: {
                companyId,
                shopId,
                changeDate: { $gte: sevenDaysAgo }
            }
        },
        {
            $group: {
                _id: '$changeType',
                count: { $sum: 1 },
                totalQuantity: { $sum: '$quantity' }
            }
        }
    ]);

    res.json({
        success: true,
        data: {
            companyId,
            shopId,
            overview: overview[0] || { totalProducts: 0, totalStock: 0, totalValue: 0 },
            stockMovement: {
                period: '7 days',
                data: movement
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

    // current stock from variations (source-of-truth)
    const pvAgg = await ProductVariation.aggregate([
        { $match: { productId: mongoose.Types.ObjectId(productId) } },
        { $group: { _id: '$productId', currentStock: { $sum: '$stockQty' } } }
    ]);
    const currentStock = pvAgg[0]?.currentStock ?? (product.inventory?.quantity ?? 0);

    // paginated stock change history
    const pg = Math.max(1, parseInt(page));
    const lim = Math.min(Math.max(1, parseInt(limit)), 500);
    const skip = (pg - 1) * lim;

    const [changes, totalChanges] = await Promise.all([
        StockChange.find({ productId })
            .sort({ changeDate: -1 })
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

    // aggregate stock & value using ProductVariation and pricing join
    const agg = await Product.aggregate([
        { $match: { companyId, categoryId: mongoose.Types.ObjectId(categoryId) } },
        { $lookup: { from: 'productvariations', localField: '_id', foreignField: 'productId', as: 'variations' } },
        { $lookup: { from: 'productpricings', localField: 'pricingId', foreignField: '_id', as: 'pricing' } },
        { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                productId: '$_id',
                totalStock: { $sum: { $map: { input: '$variations', as: 'v', in: { $ifNull: ['$$v.stockQty', 0] } } } },
                cost: { $ifNull: ['$pricing.cost', 0] },
                lowStockThreshold: '$inventory.lowStockThreshold',
                qty: '$inventory.quantity'
            }
        },
        {
            $group: {
                _id: null,
                totalStock: { $sum: '$totalStock' },
                totalValue: { $sum: { $multiply: ['$totalStock', '$cost'] } },
                lowStockCount: { $sum: { $cond: [{ $lte: ['$totalStock', '$lowStockThreshold'] }, 1, 0] } },
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
        { $match: { companyId, changeDate: { $gte: day, $lt: next } } },
        { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
    ]).allowDiskUse(true);

    // Sales revenue and units
    const sales = await StockChange.aggregate([
        { $match: { companyId, changeType: 'sale', changeDate: { $gte: day, $lt: next } } },
        { $group: { _id: null, unitsSold: { $sum: { $abs: '$quantity' } } } }
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
        { $match: { companyId, changeDate: { $gte: day, $lt: next } } },
        { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
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
        sanitizeDestinationProductData(destinationProductData);

        // Product model will auto-generate new unique codes on save

        const destinationProduct = await Product.create([destinationProductData]);
        const destinationProductId = destinationProduct[0]._id;

        // ========== STEP 3.5: Generate QR code and barcode images for destination product ==========
        setImmediate(async () => {
            try {
                const { generateQRCodeBuffer, generateBarcodeBuffer } = require('../utils/imageGenerator');
                const { uploadBuffer } = require('../utils/uploadUtil');

                const skuValue = destinationProduct[0].sku;
                if (!skuValue) {
                    logger.warn(`⚠️ Cannot generate QR/Barcode for transferred product ${destinationProductId} - SKU missing`);
                    return;
                }

                logger.info(`🔄 Generating QR/Barcode for transferred product SKU: ${skuValue}`);
                const [qrBuffer, barcodeBuffer] = await Promise.all([
                    generateQRCodeBuffer(skuValue),
                    generateBarcodeBuffer(skuValue)
                ]);

                const [qrUpload, barcodeUpload] = await Promise.all([
                    uploadBuffer(qrBuffer, `QrBar_Codes/${destinationProductId}`, `qr_${skuValue}`),
                    uploadBuffer(barcodeBuffer, `QrBar_Codes/${destinationProductId}`, `bar_${skuValue}`)
                ]);

                await Product.updateOne(
                    { _id: destinationProductId },
                    {
                        qrCodeUrl: qrUpload.secure_url,
                        barcodeUrl: barcodeUpload.secure_url,
                        qrCloudinaryId: qrUpload.public_id,
                        barcodeCloudinaryId: barcodeUpload.public_id
                    }
                );

                logger.info(`✅ QR/Barcode generated for transferred product SKU: ${skuValue}`);
            } catch (err) {
                logger.error('Failed to generate QR/barcode for transferred product:', err);
            }
        });

        // ========== STEP 4: Create pricing for destination product ==========
        const destinationPricing = new ProductPricing({
            productId: destinationProductId,
            cost: sourcePricing.cost,
            price: sourcePricing.price,
            basePrice: sourcePricing.basePrice,
            compareAtPrice: sourcePricing.compareAtPrice,
            taxable: sourcePricing.taxable,
            taxCode: sourcePricing.taxCode,
            currency: sourcePricing.currency || 'USD'
        });
        await destinationPricing.save();

        // ========== STEP 5: Create destination stock ==========
        const destinationStock = new ProductStock({
            productId: destinationProductId,
            shopId: destinationShopId,
            companyId: companyId,
            stockQty: quantity,
            trackQuantity: sourceStock.trackQuantity,
            lowStockThreshold: sourceStock.lowStockThreshold || 5,
            allowBackorder: sourceStock.allowBackorder || false
        });
        await destinationStock.save();

        // ========== STEP 5: Update ProductStock records manually ==========
        // For transfers, we handle stock updates manually (StockChange pre-save hook is skipped for transfers)
        const sourceStockAfter = sourceStockBefore - quantity;
        sourceStock.stockQty = sourceStockAfter;
        await sourceStock.save();

        // Destination stock was already created with quantity

        // ========== STEP 6: Create StockChange records (audit trail) ==========
        const destStockAfter = quantity;

        const sourceStockChange = new StockChange({
            companyId,
            shopId: sourceShopId,
            productId,
            type: 'transfer',
            qty: -quantity,
            previous: sourceStockBefore,
            new: sourceStockAfter,
            reason: reason || `Transferred ${quantity} units to shop ${destinationShopId}`,
            userId: userId,
            metadata: {
                transferType: 'intra_company',
                direction: 'out',
                destinationShop: destinationShopId,
                destinationProductId: destinationProductId
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
        const transferValue = quantity * (sourcePricing.price || 0);
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
                    price: destinationPricing.price,
                    compareAtPrice: destinationPricing.compareAtPrice,
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
                        price: destinationPricing.price
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

        // ========== STEP 2: Update source stock ==========
        sourceStock.stockQty = currentStock - transferQuantity;
        await sourceStock.save();

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
        sanitizeDestinationProductData(destinationProductData);

        // Product model will auto-generate new unique codes on save

        const destinationProduct = await Product.create([destinationProductData]); // Returns array
        const destinationProductId = destinationProduct[0]._id;

        // ========== STEP 3.5: Generate QR code and barcode images for destination product ==========
        setImmediate(async () => {
            try {
                const { generateQRCodeBuffer, generateBarcodeBuffer } = require('../utils/imageGenerator');
                const { uploadBuffer } = require('../utils/uploadUtil');

                const skuValue = destinationProduct[0].sku;
                if (!skuValue) {
                    logger.warn(`⚠️ Cannot generate QR/Barcode for cross-company transferred product ${destinationProductId} - SKU missing`);
                    return;
                }

                logger.info(`🔄 Generating QR/Barcode for cross-company transferred product SKU: ${skuValue}`);
                const [qrBuffer, barcodeBuffer] = await Promise.all([
                    generateQRCodeBuffer(skuValue),
                    generateBarcodeBuffer(skuValue)
                ]);

                const [qrUpload, barcodeUpload] = await Promise.all([
                    uploadBuffer(qrBuffer, `QrBar_Codes/${destinationProductId}`, `qr_${skuValue}`),
                    uploadBuffer(barcodeBuffer, `QrBar_Codes/${destinationProductId}`, `bar_${skuValue}`)
                ]);

                await Product.updateOne(
                    { _id: destinationProductId },
                    {
                        qrCodeUrl: qrUpload.secure_url,
                        barcodeUrl: barcodeUpload.secure_url,
                        qrCloudinaryId: qrUpload.public_id,
                        barcodeCloudinaryId: barcodeUpload.public_id
                    }
                );

                logger.info(`✅ QR/Barcode generated for cross-company transferred product SKU: ${skuValue}`);
            } catch (err) {
                logger.error('Failed to generate QR/barcode for cross-company transferred product:', err);
            }
        });

        // ========== STEP 4: Create pricing for destination product ==========
        const destinationPricing = new ProductPricing({
            productId: destinationProductId,
            cost: pricingOverride?.cost || sourcePricing.cost,
            price: pricingOverride?.price || sourcePricing.price,
            basePrice: pricingOverride?.basePrice || sourcePricing.basePrice,
            compareAtPrice: pricingOverride?.compareAtPrice || sourcePricing.compareAtPrice,
            taxable: sourcePricing.taxable,
            taxCode: sourcePricing.taxCode,
            currency: sourcePricing.currency || 'USD'
        });
        await destinationPricing.save();

        // ========== STEP 5: Create destination stock ==========
        const destinationStock = new ProductStock({
            productId: destinationProductId,
            shopId: toShopId,
            companyId: toCompanyId,
            stockQty: transferQuantity,
            trackQuantity: sourceStock.trackQuantity,
            lowStockThreshold: sourceStock.lowStockThreshold || 5,
            allowBackorder: sourceStock.allowBackorder || false
        });
        await destinationStock.save();

        // ========== STEP 6: Create StockChange records (audit trail) ==========
        const stockChangeResults = await StockChange.create(
            [
                {
                    companyId: fromCompanyId,
                    productId: productId,
                    shopId: fromShopId,
                    type: 'transfer',
                    qty: -transferQuantity,
                    previous: currentStock,
                    new: sourceStock.stockQty,
                    reason: reason || `Cross-company transfer to ${toCompanyId} shop ${toShopId}`,
                    userId: userId || 'system',
                    metadata: {
                        transferType: 'cross_company',
                        direction: 'out',
                        destinationCompany: toCompanyId,
                        destinationShop: toShopId,
                        destinationProductId: destinationProductId
                    }
                },
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
            ]
        );

        // ========== STEP 8: Create ProductTransfer record for complete audit ==========
        const transferValue = transferQuantity * (sourcePricing.price || 0);
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
            sourceStockAfter: sourceStock.stockQty,
            destinationStockBefore: 0,
            destinationStockAfter: transferQuantity,

            transferredProductData: {
                pricing: {
                    cost: destinationPricing.cost,
                    price: destinationPricing.price,
                    compareAtPrice: destinationPricing.compareAtPrice,
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

            sourceStockChangeId: stockChangeResults[0]._id,
            destinationStockChangeId: stockChangeResults[1]._id,

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
                    stockAfter: sourceStock.stockQty,
                    stockChangeId: stockChangeResults[0]._id
                },
                destinationProduct: {
                    productId: destinationProductId,
                    productName: destinationProduct[0].name,
                    productSku: destinationProduct[0].sku,
                    companyId: toCompanyId,
                    shopId: toShopId,
                    stockBefore: 0,
                    stockAfter: transferQuantity,
                    stockChangeId: stockChangeResults[1]._id,
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

        // Only level 3 categories need company-specific replication
        if (sourceCategory.level !== 3) {
            logger.warn(`Category is level ${sourceCategory.level}, expected level 3. Cannot replicate.`);
            return null;
        }

        if (!sourceCategory.parentCategory) {
            logger.error(`Level 3 category ${sourceCategoryId} has no parent! Data inconsistency.`);
            return null;
        }

        // Check if equivalent category already exists in destination company
        // Match by: same name, same parent (level 2), destination companyId
        const existingCategory = await Category.findOne({
            name: sourceCategory.name,
            parentCategory: sourceCategory.parentCategory, // Same level 2 parent
            companyId: destinationCompanyId,
            level: 3
        });

        if (existingCategory) {
            logger.info(`✓ Category already exists in destination company: ${existingCategory.name} (${existingCategory._id})`);
            return existingCategory._id;
        }

        // Create new level 3 category in destination company
        const newCategoryData = {
            name: sourceCategory.name,
            description: sourceCategory.description,
            level: 3,
            parentCategory: sourceCategory.parentCategory, // Keep same level 2 parent (global)
            companyId: destinationCompanyId, // Assign to destination company
            isActive: sourceCategory.isActive,
            sortOrder: sourceCategory.sortOrder,
            image: sourceCategory.image,
            seo: sourceCategory.seo,
            attributes: sourceCategory.attributes
        };

        // Generate unique slug for destination company
        const baseSlug = sourceCategory.name
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        let uniqueSlug = `${baseSlug}-${destinationCompanyId.substring(0, 8)}`;
        let counter = 1;

        // Ensure slug is unique
        while (await Category.findOne({ slug: uniqueSlug })) {
            uniqueSlug = `${baseSlug}-${destinationCompanyId.substring(0, 8)}-${counter}`;
            counter++;
        }

        newCategoryData.slug = uniqueSlug;

        const newCategory = await Category.create(newCategoryData);
        logger.info(`✓ Created new level 3 category in destination company: ${newCategory.name} (${newCategory._id}) with parent ${newCategory.parentCategory}`);

        return newCategory._id;

    } catch (error) {
        logger.error('Error ensuring category in destination company:', error);
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
            message: 'transfers array is required and must contain at least one item'
        });
    }

    if (!destinationShopId || !userId) {
        return res.status(400).json({
            success: false,
            message: 'toShopId and userId are required'
        });
    }

    if (sourceShopId === destinationShopId) {
        return res.status(400).json({
            success: false,
            message: 'Source and destination shops cannot be the same'
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

                // Create destination pricing
                await ProductPricing.create({
                    productId: destinationProductId,
                    cost: sourcePricing.cost,
                    price: sourcePricing.price,
                    basePrice: sourcePricing.basePrice,
                    currency: sourcePricing.currency || 'USD'
                });

                // Create destination stock
                await ProductStock.create({
                    productId: destinationProductId,
                    shopId: destinationShopId,
                    companyId: companyId,
                    stockQty: quantity,
                    trackQuantity: sourceStock.trackQuantity
                });

                // Update source stock
                const sourceStockBefore = sourceStock.stockQty;
                sourceStock.stockQty -= quantity;
                await sourceStock.save();

                // Create stock change records
                await StockChange.insertMany([
                    {
                        companyId,
                        shopId: sourceShopId,
                        productId,
                        type: 'transfer',
                        qty: -quantity,
                        previous: sourceStockBefore,
                        new: sourceStock.stockQty,
                        reason: reason || `Bulk transfer to ${destinationShopId}`,
                        userId
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
                destinationProductData.categoryId = destinationCategoryId;

                // Sanitize product data before creating destination product
                sanitizeDestinationProductData(destinationProductData);

                const destinationProduct = await Product.create(destinationProductData);
                const destinationProductId = destinationProduct._id;

                // Create destination pricing
                await ProductPricing.create({
                    productId: destinationProductId,
                    cost: pricingOverride?.cost || sourcePricing.cost,
                    price: pricingOverride?.price || sourcePricing.price,
                    basePrice: pricingOverride?.basePrice || sourcePricing.basePrice,
                    currency: sourcePricing.currency || 'USD'
                });

                // Create destination stock
                await ProductStock.create({
                    productId: destinationProductId,
                    shopId: toShopId,
                    companyId: toCompanyId,
                    stockQty: quantity,
                    trackQuantity: sourceStock.trackQuantity
                });

                // Update source stock
                const sourceStockBefore = sourceStock.stockQty;
                sourceStock.stockQty -= quantity;
                await sourceStock.save();

                // Create stock change records
                await StockChange.insertMany([
                    {
                        companyId: sourceCompanyId,
                        shopId: sourceShopId,
                        productId,
                        type: 'transfer',
                        qty: -quantity,
                        previous: sourceStockBefore,
                        new: sourceStock.stockQty,
                        reason: reason || `Bulk cross-company transfer to ${toCompanyId}`,
                        userId,
                        metadata: { transferType: 'cross_company', direction: 'out' }
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