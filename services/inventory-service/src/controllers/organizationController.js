const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const Alert = require('../models/Alert');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const Category = require('../models/Category');
const { validateMongoId } = require('../utils/validateMongoId');
const { logger } = require('../utils/logger');
const { getCache, setCache, scanDel, delCache } = require('../utils/redisHelper');
const ProductVariation = require('../models/ProductVariation');
const ProductStock = require('../models/ProductStock');
const ProductPricing = require('../models/ProductPricing');

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

    // Total stock and value using ProductVariation joined to Product and pricing
    const stockAgg = await ProductVariation.aggregate([
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.companyId': mongoose.Types.ObjectId(companyId) } },
        { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
        { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
        { $group: { _id: null, totalStock: { $sum: '$stockQty' }, totalValue: { $sum: { $multiply: ['$stockQty', { $ifNull: ['$cost', { $ifNull: ['$pricing.cost', 0] }] }] } } } }
    ]);

    const { totalStock = 0, totalValue = 0 } = stockAgg[0] || {};

    // Low stock and out-of-stock counts per product using ProductVariation aggregates and ProductStock thresholds
    const lowStockAgg = await ProductVariation.aggregate([
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.companyId': mongoose.Types.ObjectId(companyId) } },
        { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' }, productId: { $first: '$product._id' } } },
        { $lookup: { from: 'productstocks', localField: 'productId', foreignField: 'productId', as: 'stockConfig' } },
        { $unwind: { path: '$stockConfig', preserveNullAndEmptyArrays: true } },
        { $match: { $expr: { $lte: ['$totalQty', { $ifNull: ['$stockConfig.lowStockThreshold', 0] }] } } },
        { $count: 'lowCount' }
    ]);

    const lowStockCount = (lowStockAgg[0] && lowStockAgg[0].lowCount) || 0;

    const outOfStockAgg = await ProductVariation.aggregate([
        { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.companyId': mongoose.Types.ObjectId(companyId) } },
        { $group: { _id: '$productId', totalQty: { $sum: '$stockQty' } } },
        { $match: { totalQty: { $lte: 0 } } },
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
    const { companyId } = req.params;
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
    if (category) query.category = category;
    if (brand) query.brand = new RegExp(brand, 'i');
    if (search) query.$text = { $search: search };

    const products = await Product.find(query)
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await Product.countDocuments(query);

    const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
    };

    // Cache page for a short TTL
        setCache(cacheKey, { data: products, pagination }, 60).catch(() => { logger.error('Failed to set cache for company products'); });

    res.json({ success: true, data: products, pagination });
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
           .populate('category', 'name')
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
    if (category) query.category = category;
    if (brand) query.brand = new RegExp(brand, 'i');
    if (search) {
        query.$text = { $search: search };
    }
    if (inStock === 'true') {
        query['inventory.quantity'] = { $gt: 0 };
    }

    const products = await Product.find(query)
        .populate('category')
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
    }).populate('category');

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

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const product = await Product.findOne({
            _id: productId,
            companyId,
            shopId: shopId
        }).session(session);

        if (!product) {
            throw new Error('Product not found for this shop');
        }

        // Update product-level inventory and create stock change
        const previous = product.inventory.quantity || 0;
        const newStock = previous + quantity;
        product.inventory.quantity = newStock;

        await product.save({ session });

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

        await stockChange.save({ session });

        await session.commitTransaction();

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
        await session.abortTransaction();
        logger.error(`❌ Error allocating inventory: ${error.message}`);
        throw error;
    } finally {
        session.endSession();
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
        .populate('category', 'name')
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
        .populate('category', 'name slug')
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
            recentAlerts,
            auditTrail: product.auditTrail || []
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
        { $project: {
            productId: '$_id',
            totalStock: { $sum: { $map: { input: '$variations', as: 'v', in: { $ifNull: ['$$v.stockQty', 0] } } } },
            cost: { $ifNull: ['$pricing.cost', 0] },
            lowStockThreshold: '$inventory.lowStockThreshold',
            qty: '$inventory.quantity'
        } },
        { $group: {
            _id: null,
            totalStock: { $sum: '$totalStock' },
            totalValue: { $sum: { $multiply: ['$totalStock', '$cost'] } },
            lowStockCount: { $sum: { $cond: [{ $lte: ['$totalStock', '$lowStockThreshold'] }, 1, 0] } },
            outOfStockCount: { $sum: { $cond: [{ $lte: ['$totalStock', 0] }, 1, 0] } }
        } }
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
    day.setHours(0,0,0,0);
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

    res.json({ success: true, data: { date: day.toISOString().slice(0,10), movement, sales: sales[0] || { unitsSold: 0 }, alerts } });
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
    day.setHours(0,0,0,0);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);

    const movement = await StockChange.aggregate([
        { $match: { companyId, changeDate: { $gte: day, $lt: next } } },
        { $group: { _id: '$changeType', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
    ]).allowDiskUse(true);

    const totalAlerts = await Alert.countDocuments({ companyId, createdAt: { $gte: day, $lt: next } });
    const totalAdjustments = await InventoryAdjustment.countDocuments({ companyId, createdAt: { $gte: day, $lt: next } });

    const summaryText = `Daily summary for ${day.toISOString().slice(0,10)}: movements=${JSON.stringify(movement)}, alerts=${totalAlerts}, adjustments=${totalAdjustments}`;

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
 * @desc    Transfer stock between shops
 * @route   POST /api/v1/companies/:companyId/shops/:shopId/transfer
 * @access  Private
 */
const transferStockBetweenShops = asyncHandler(async (req, res) => {
    const { companyId, shopId: fromShopId } = req.params;
    if (!companyId || !fromShopId) {
        return res.status(400).json({
            success: false,
            message: 'companyId and shopId are required'
        });
    }
    const { productId, toShopId, quantity, reason, userId, variationTransfers } = req.body;

    if (!productId || !toShopId || !quantity) {
        return res.status(400).json({
            success: false,
            message: 'productId, toShopId, and quantity are required'
        });
    }

    validateMongoId(productId);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Deduct from source shop
        const fromProduct = await Product.findOne({
            _id: productId,
            companyId,
            shopId: fromShopId
        }).session(session);

        if (!fromProduct) {
            throw new Error('Product not found in source shop');
        }

        // Support variation-level transfers if provided
        let fromCurrentStock = fromProduct.inventory.quantity || 0;
        if (Array.isArray(variationTransfers) && variationTransfers.length > 0) {
            // variationTransfers: [{ variationId, quantity }]
            let totalRequested = 0;
            for (const vt of variationTransfers) totalRequested += Number(vt.quantity || 0);
            if (totalRequested !== Number(quantity)) {
                throw new Error('Sum of variationTransfers quantities must equal quantity');
            }

            // Reduce specified variations on the source product
            for (const vt of variationTransfers) {
                const vid = vt.variationId;
                const qtyToReduce = Number(vt.quantity || 0);
                const variation = fromProduct.variations.find(v => String(v._id) === String(vid) || v._id == vid);
                if (!variation) throw new Error(`Variation ${vid} not found on source product`);
                const avail = variation.stockQty || 0;
                if (avail < qtyToReduce) throw new Error(`Insufficient stock in variation ${vid}`);
                variation.stockQty = avail - qtyToReduce;
            }
            // Recalculate total
            fromCurrentStock = fromProduct.variations.reduce((s, v) => s + (v.stockQty || 0), 0);
        } else {
            fromCurrentStock = fromProduct.inventory.quantity || 0;
            if (fromCurrentStock < quantity) {
                throw new Error('Insufficient stock in source shop');
            }
            fromProduct.inventory.quantity = fromCurrentStock - quantity;
        }

        await fromProduct.save({ session });

        // Add to destination shop — create a minimal safe copy if it doesn't already exist
        let toProduct = await Product.findOne({
            _id: productId,
            companyId,
            shopId: toShopId
        }).session(session);

        if (!toProduct) {
            // Create a minimal destination product by copying source but removing unique identifiers
            const destData = fromProduct.toObject();
            delete destData._id;
            destData.shopId = toShopId;
            destData.companyId = companyId;

            // Set only the transferred quantity for the destination product
            if (Array.isArray(variationTransfers) && variationTransfers.length > 0) {
                // Build destination variations only containing transferred variation quantities
                destData.variations = [];
                for (const vt of variationTransfers) {
                    const variation = fromProduct.variations.find(v => String(v._id) === String(vt.variationId) || v._id == vt.variationId);
                    if (!variation) throw new Error(`Variation ${vt.variationId} not found on source product`);
                    destData.variations.push({
                        name: variation.name,
                        sku: undefined,
                        stockQty: Number(vt.quantity || 0),
                        attributes: variation.attributes || []
                    });
                }
            } else if (Array.isArray(destData.variations) && destData.variations.length > 0) {
                // Zero out variation quantities then add proportional quantity to first variation
                const total = destData.variations.reduce((s, v) => s + (v.stockQty || 0), 0) || 0;
                if (total > 0) {
                    const ratio = quantity / total;
                    destData.variations.forEach(v => { v.stockQty = Math.max(0, Math.round((v.stockQty || 0) * ratio)); });
                } else {
                    // fallback: create a single default variation
                    destData.variations = [{ sku: undefined, stockQty: quantity }];
                }
            } else {
                destData.inventory = destData.inventory || {};
                destData.inventory.quantity = quantity;
            }

            // Remove globally-unique identifiers so pre-save generates new ones (safe copy)
            delete destData.sku;
            delete destData.barcode;
            delete destData.scanId;
            delete destData.barcodePayload;
            delete destData.qrPayload;

            // Add audit entry for received transfer
            destData.auditTrail = destData.auditTrail || [];
            destData.auditTrail.push({
                action: 'transfer_received',
                changedBy: userId || 'system',
                sourceCompanyId: companyId,
                sourceShopId: fromShopId,
                sourceProductId: productId,
                transferredQuantity: quantity,
                timestamp: new Date()
            });

            const created = await Product.create([destData], { session });
            toProduct = created[0];
        } else {
            const toCurrentStock = toProduct.inventory.quantity || 0;
            toProduct.inventory.quantity = toCurrentStock + quantity;
            await toProduct.save({ session });
        }

        // Create StockChange records for both shops
        const transferReason = reason || `Transferred from shop ${fromShopId} to shop ${toShopId}`;

        await StockChange.create(
            [
                {
                    companyId,
                    productId,
                    shopId: fromShopId,
                    changeType: 'transfer',
                    quantity: -quantity,
                    previousStock: fromCurrentStock,
                    newStock: fromCurrentStock - quantity,
                    reason: transferReason,
                    changedBy: userId || 'system'
                },
                {
                    companyId,
                    productId,
                    shopId: toShopId,
                    changeType: 'transfer',
                    quantity: quantity,
                    previousStock: (toProduct.inventory && toProduct.inventory.quantity) ? (toProduct.inventory.quantity - quantity) : 0,
                    newStock: (toProduct.inventory && toProduct.inventory.quantity) ? toProduct.inventory.quantity : quantity,
                    reason: transferReason,
                    changedBy: userId || 'system'
                }
            ],
            { session }
        );

        await session.commitTransaction();
        logger.info(`✅ Transferred ${quantity} units from shop ${fromShopId} to shop ${toShopId}`);

        // Invalidate related cache entries (best-effort, non-blocking)
        setImmediate(() => {
            try {
                delCache(`company:overview:${companyId}`);
                scanDel(`company:products:${companyId}:*`);
                delCache(`product:${productId}`);
                if (toProduct && toProduct._id) delCache(`product:${toProduct._id}`);
                scanDel(`products:*"${companyId}"*`);
            } catch (err) {
                logger.error('Cache invalidation error after shop transfer:', err);
            }
        });

        res.json({
            success: true,
            message: 'Stock transferred successfully',
            data: {
                productId,
                fromShopId,
                toShopId,
                quantityTransferred: quantity,
                destinationProductId: toProduct ? toProduct._id : null
            }
        });
    } catch (error) {
        await session.abortTransaction();
        logger.error(`❌ Transfer error: ${error.message}`);
        throw error;
    } finally {
        session.endSession();
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
        variationTransfers,
        preserveSku = false
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

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // ========== STEP 1: Get source product ==========
        const sourceProduct = await Product.findOne({
            _id: productId,
            companyId: fromCompanyId,
            shopId: fromShopId
        }).session(session);

        if (!sourceProduct) {
            throw new Error('Product not found in source shop/company');
        }

        // Calculate current stock and support variationTransfers
        let currentStock = sourceProduct.inventory.quantity || 0;
        if (sourceProduct.variations && sourceProduct.variations.length > 0) {
            currentStock = sourceProduct.variations.reduce((sum, v) => sum + (v.stockQty || 0), 0);
        }

        if (Array.isArray(variationTransfers) && variationTransfers.length > 0) {
            // variationTransfers: [{ variationId, quantity }]
            let totalRequested = 0;
            for (const vt of variationTransfers) totalRequested += Number(vt.quantity || 0);
            if (totalRequested !== Number(transferQuantity)) {
                throw new Error('Sum of variationTransfers quantities must equal transferQuantity');
            }

            // Reduce specified variations
            for (const vt of variationTransfers) {
                const variation = sourceProduct.variations.find(v => String(v._id) === String(vt.variationId) || v._id == vt.variationId);
                if (!variation) throw new Error(`Variation ${vt.variationId} not found on source product`);
                const avail = variation.stockQty || 0;
                const qtyToReduce = Number(vt.quantity || 0);
                if (avail < qtyToReduce) throw new Error(`Insufficient stock in variation ${vt.variationId}`);
                variation.stockQty = avail - qtyToReduce;
            }
        } else {
            // No per-variation transfers: check total
            if (currentStock < transferQuantity) {
                throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${transferQuantity}`);
            }

            // Default reduction: proportional across variations or product inventory
            if (sourceProduct.variations && sourceProduct.variations.length > 0) {
                let remaining = transferQuantity;
                for (let variation of sourceProduct.variations) {
                    if (remaining <= 0) break;
                    const variationStock = variation.stockQty || 0;
                    const reduce = Math.min(variationStock, remaining);
                    variation.stockQty = variationStock - reduce;
                    remaining -= reduce;
                }
            } else {
                sourceProduct.inventory.quantity = (sourceProduct.inventory.quantity || 0) - transferQuantity;
            }
        }

        const newSourceStock = sourceProduct.variations && sourceProduct.variations.length > 0
            ? sourceProduct.variations.reduce((s, v) => s + (v.stockQty || 0), 0)
            : sourceProduct.inventory.quantity || 0;

        await sourceProduct.save({ session });

        // ========== STEP 3: Create destination product (copy with transferred quantity) ==========
        const destinationProductData = sourceProduct.toObject();
        delete destinationProductData._id; // Remove source ID, let MongoDB generate new one
        destinationProductData.companyId = toCompanyId;
        destinationProductData.shopId = toShopId;

        // Set quantity to transferred amount only (support variationTransfers)
        if (Array.isArray(variationTransfers) && variationTransfers.length > 0) {
            destinationProductData.variations = [];
            for (const vt of variationTransfers) {
                const variation = sourceProduct.variations.find(v => String(v._id) === String(vt.variationId) || v._id == vt.variationId);
                if (!variation) throw new Error(`Variation ${vt.variationId} not found on source product`);
                destinationProductData.variations.push({
                    name: variation.name,
                    sku: undefined,
                    stockQty: Number(vt.quantity || 0),
                    attributes: variation.attributes || []
                });
            }
        } else if (destinationProductData.variations && destinationProductData.variations.length > 0) {
            // For variations: scale them proportionally based on what was transferred
            const sourceVariationTotal = destinationProductData.variations.reduce((sum, v) => sum + (v.stockQty || 0), 0);
            if (sourceVariationTotal > 0) {
                const ratio = transferQuantity / sourceVariationTotal;
                destinationProductData.variations.forEach(v => {
                    v.stockQty = Math.round((v.stockQty || 0) * ratio);
                });
            }
        } else {
            destinationProductData.inventory.quantity = transferQuantity;
        }

        // Clear auditTrail and start fresh for destination
        destinationProductData.auditTrail = [
            {
                action: 'cross_company_transfer_received',
                changedBy: userId || 'system',
                sourceCompanyId: fromCompanyId,
                sourceShopId: fromShopId,
                sourceProductId: productId,
                transferredQuantity: transferQuantity,
                timestamp: new Date()
            }
        ];

        // SKU handling: optionally preserve SKU if requested, else remove to allow pre-save generation
        const sourceSku = sourceProduct.sku;
        if (preserveSku && sourceSku) {
            // Check if SKU is available in destination company/shop
            const exists = await Product.countDocuments({ sku: sourceSku }).session(session);
            if (!exists) {
                destinationProductData.sku = sourceSku;
                destinationProductData.barcode = sourceProduct.barcode || sourceSku;
            } else {
                // Make a safe fallback SKU to avoid collisions
                destinationProductData.sku = `${(sourceSku || 'SKU')}-COPY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                destinationProductData.barcode = destinationProductData.sku;
            }
        } else {
            delete destinationProductData.sku;
            delete destinationProductData.barcode;
        }
        delete destinationProductData.scanId;
        delete destinationProductData.barcodePayload;
        delete destinationProductData.qrPayload;
        delete destinationProductData.asin;
        delete destinationProductData.upc;

        // Ensure variation quantities sum exactly to transferQuantity (fix rounding)
        if (destinationProductData.variations && destinationProductData.variations.length > 0) {
            let totalAssigned = destinationProductData.variations.reduce((s, v) => s + (v.stockQty || 0), 0);
            if (totalAssigned !== transferQuantity) {
                const diff = transferQuantity - totalAssigned;
                destinationProductData.variations[0].stockQty = (destinationProductData.variations[0].stockQty || 0) + diff;
            }
        }

        const destinationProduct = await Product.create([destinationProductData], { session });

        // ========== STEP 4: Add transfer record to source product auditTrail ==========
        sourceProduct.auditTrail.push({
            action: 'cross_company_transfer_sent',
            changedBy: userId || 'system',
            destinationCompanyId: toCompanyId,
            destinationShopId: toShopId,
            destinationProductId: destinationProduct[0]._id,
            transferredQuantity: transferQuantity,
            newQuantity: newSourceStock,
            reason: reason || 'Cross-company product transfer',
            timestamp: new Date()
        });

        await sourceProduct.save({ session });

        // ========== STEP 5: Create StockChange records (audit trail) ==========
        await StockChange.create(
            [
                {
                    companyId: fromCompanyId,
                    productId: productId,
                    shopId: fromShopId,
                    changeType: 'cross_company_transfer_out',
                    quantity: -transferQuantity,
                    previousStock: currentStock,
                    newStock: newSourceStock,
                    reason: reason || `Cross-company transfer to ${toCompanyId} shop ${toShopId}`,
                    userId: userId || 'system'
                },
                {
                    companyId: toCompanyId,
                    productId: destinationProduct[0]._id,
                    shopId: toShopId,
                    changeType: 'cross_company_transfer_in',
                    quantity: transferQuantity,
                    previousStock: 0,
                    newStock: transferQuantity,
                    reason: reason || `Cross-company transfer from ${fromCompanyId} shop ${fromShopId}`,
                    userId: userId || 'system'
                }
            ],
            { session }
        );

        // ========== STEP 6: Commit transaction ==========
        await session.commitTransaction();
        logger.info(
            `✅ Cross-company transfer: ${transferQuantity} units of product ${productId} from ${fromCompanyId}:${fromShopId} to ${toCompanyId}:${toShopId}`
        );

        // Invalidate caches related to source and destination companies/products (synchronous best-effort)
        try {
            await delCache(`company:overview:${fromCompanyId}`);
            await delCache(`company:overview:${toCompanyId}`);
            await scanDel(`company:products:${fromCompanyId}:*`);
            await scanDel(`company:products:${toCompanyId}:*`);
            await delCache(`product:${productId}`);
            if (destinationProduct && destinationProduct[0] && destinationProduct[0]._id) await delCache(`product:${destinationProduct[0]._id}`);
            await scanDel(`products:*"${fromCompanyId}"*`);
            await scanDel(`products:*"${toCompanyId}"*`);
        } catch (err) {
            logger.error('Cache invalidation error after cross-company transfer:', err);
        }

        res.json({
            success: true,
            message: 'Product transferred successfully across companies',
            data: {
                sourceProductId: productId,
                sourceCompanyId: fromCompanyId,
                sourceShopId: fromShopId,
                sourceRemainingQuantity: newSourceStock,
                destinationProductId: destinationProduct[0]._id,
                destinationCompanyId: toCompanyId,
                destinationShopId: toShopId,
                destinationReceivedQuantity: transferQuantity,
                productName: sourceProduct.name,
                productSku: sourceProduct.sku,
                transferredAt: new Date()
            }
        });
    } catch (error) {
        await session.abortTransaction();
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
    } finally {
        session.endSession();
    }
});

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
                changeType: 'cross_company_transfer_out'
            },
            {
                changeType: 'cross_company_transfer_in'
            }
        ]
    })
        .populate('productId', 'name sku')
        .sort({ changeDate: -1 });

    // Get audit trail from original product
    const auditTrail = originalProduct.auditTrail.filter(
        entry => entry.action === 'cross_company_transfer_sent' || entry.action === 'cross_company_transfer_received'
    );

    res.json({
        success: true,
        data: {
            originalProductId: productId,
            originalProductName: originalProduct.name,
            originalProductSku: originalProduct.sku,
            auditTrail: auditTrail,
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

    // Find all stock changes of type "cross_company_transfer_out" for this product
    const outgoingTransfers = await StockChange.find({
        productId: productId,
        changeType: 'cross_company_transfer_out'
    });

    // Get the destination product IDs from audit trail
    const transferredProductIds = originalProduct.auditTrail
        .filter(entry => entry.action === 'cross_company_transfer_sent')
        .map(entry => entry.destinationProductId);

    // Fetch all transferred copies
    const transferredProducts = await Product.find({
        _id: { $in: transferredProductIds }
    }).populate('category', 'name');

    res.json({
        success: true,
        data: {
            originalProductId: productId,
            originalProductName: originalProduct.name,
            originalProductSku: originalProduct.sku,
            originalCompanyId: originalProduct.companyId,
            originalShopId: originalProduct.shopId,
            transferredCopies: transferredProducts.map(p => ({
                copyProductId: p._id,
                companyId: p.companyId,
                shopId: p.shopId,
                name: p.name,
                sku: p.sku,
                currentQuantity: p.inventory.quantity,
                category: p.category,
                createdAt: p.createdAt
            })),
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
        recommendations.push('✅ Shop operating optimally - Continue current strategy');
    }

    return recommendations;
}

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
    getShopProducts,
    getShopProductInventory,
    allocateInventoryToShop,
    getShopInventorySummary,
    getShopTopSellers,
    getShopAdvancedAnalytics,
    getProductComparison,
    getShopPerformanceMetrics,
    getShopOverview,
    getShopStockChanges,
    getShopAlerts,
    getShopAdjustments,
    getShopLowStockProducts,
    getShopReport,
    transferStockBetweenShops,

    // Cross-Company
    transferProductCrossCompany,
    getProductTransferHistory,
    getTransferredProductCopies
};
