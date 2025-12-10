const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const Alert = require('../models/Alert');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const Category = require('../models/Category');
const { validateMongoId } = require('../utils/validateMongoId');
const { logger } = require('../utils/logger');

// ==================== COMPANY LEVEL OPERATIONS ====================

/**
 * @desc    Get company-wide inventory overview
 * @route   GET /api/v1/companies/:companyId/overview
 * @access  Private
 */
const getCompanyOverview = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    // Total products
    const totalProducts = await Product.countDocuments({ companyId });

    // Total stock (sum of all variations or product inventory)
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
        }
    ]);

    const { totalStock = 0, totalValue = 0 } = stockData[0] || {};

    // Low stock count
    const lowStockCount = await Product.countDocuments({
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
    });

    // Out of stock count
    const outOfStockCount = await Product.countDocuments({
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
                0
            ]
        }
    });

    // Active alerts
    const activeAlerts = await Alert.countDocuments({
        companyId,
        isResolved: false
    });

    // Pending adjustments
    const pendingAdjustments = await InventoryAdjustment.countDocuments({
        companyId,
        status: 'pending'
    });

    res.json({
        success: true,
        data: {
            companyId,
            totalProducts,
            totalStock,
            totalValue: totalValue.toFixed(2),
            lowStockCount,
            outOfStockCount,
            activeAlerts,
            pendingAdjustments,
            lastUpdated: new Date()
        }
    });
});

/**
 * @desc    Get all products for a company
 * @route   GET /api/v1/companies/:companyId/products
 * @access  Private
 */
const getCompanyProducts = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { page = 1, limit = 20, status, visibility, category, brand, search } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

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
    const { productId, toShopId, quantity, reason, userId } = req.body;

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

        const fromCurrentStock = fromProduct.inventory.quantity || 0;
        if (fromCurrentStock < quantity) {
            throw new Error('Insufficient stock in source shop');
        }

        fromProduct.inventory.quantity = fromCurrentStock - quantity;
        await fromProduct.save({ session });

        // Add to destination shop
        const toProduct = await Product.findOne({
            _id: productId,
            companyId,
            shopId: toShopId
        }).session(session);

        if (!toProduct) {
            throw new Error('Product not found in destination shop');
        }

        const toCurrentStock = toProduct.inventory.quantity || 0;
        toProduct.inventory.quantity = toCurrentStock + quantity;
        await toProduct.save({ session });

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
                    previousStock: toCurrentStock,
                    newStock: toCurrentStock + quantity,
                    reason: transferReason,
                    changedBy: userId || 'system'
                }
            ],
            { session }
        );

        await session.commitTransaction();
        logger.info(`✅ Transferred ${quantity} units from shop ${fromShopId} to shop ${toShopId}`);

        res.json({
            success: true,
            message: 'Stock transferred successfully',
            data: {
                productId,
                fromShopId,
                toShopId,
                quantityTransferred: quantity
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
        userId
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

        // Calculate current stock (handle variations)
        let currentStock = sourceProduct.inventory.quantity || 0;
        if (sourceProduct.variations && sourceProduct.variations.length > 0) {
            currentStock = sourceProduct.variations.reduce((sum, v) => sum + (v.stockQty || 0), 0);
        }

        // Check if sufficient stock to transfer
        if (currentStock < transferQuantity) {
            throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${transferQuantity}`);
        }

        // ========== STEP 2: Update source product (reduce quantity) ==========
        const newSourceStock = currentStock - transferQuantity;

        if (sourceProduct.variations && sourceProduct.variations.length > 0) {
            // If product has variations, reduce from total variation stock
            let remaining = transferQuantity;
            for (let variation of sourceProduct.variations) {
                if (remaining <= 0) break;
                const variationStock = variation.stockQty || 0;
                const reduce = Math.min(variationStock, remaining);
                variation.stockQty = variationStock - reduce;
                remaining -= reduce;
            }
        } else {
            // Simple product - just reduce inventory.quantity
            sourceProduct.inventory.quantity = newSourceStock;
        }

        await sourceProduct.save({ session });

        // ========== STEP 3: Create destination product (copy with transferred quantity) ==========
        const destinationProductData = sourceProduct.toObject();
        delete destinationProductData._id; // Remove source ID, let MongoDB generate new one
        destinationProductData.companyId = toCompanyId;
        destinationProductData.shopId = toShopId;

        // Set quantity to transferred amount only
        if (destinationProductData.variations && destinationProductData.variations.length > 0) {
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
