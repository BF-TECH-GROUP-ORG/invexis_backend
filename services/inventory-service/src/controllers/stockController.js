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
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const { validateMongoId } = require('../utils/validateMongoId');
const { publishProductEvent } = require('../events/productEvents');
const redis = require('/app/shared/redis');
const { scanDel } = require('../utils/redisHelper');
const ProductStock = require('../models/ProductStock');
const StockMonitoringService = require('../services/stockMonitoringService');
const logger = require('../utils/logger');

const getProductByScan = asyncHandler(async (req, res) => {
    const { productId } = req.body;

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    validateMongoId(productId);
    const product = await Product.findById(productId).populate('categoryId', 'name slug').populate('pricingId');

    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Get stock from ProductStock
    const stockRecord = await ProductStock.findOne({ productId: product._id }).lean();

    const responseData = {
        id: product._id,
        name: product.name,
        sku: product.sku,
        price: product.pricingId?.basePrice || null,
        currency: product.pricingId?.currency || null,
        images: product.images,
        qrCodeUrl: product.qrCodeUrl,
        barcodeUrl: product.barcodeUrl,
        currentStock: stockRecord?.stockQty || 0,
        lowStockThreshold: stockRecord?.lowStockThreshold ?? 5,
        allowBackorder: stockRecord?.allowBackorder ?? false
    };

    const currentStock = responseData.currentStock;
    const lowThresh = responseData.lowStockThreshold;
    const allowBackorder = responseData.allowBackorder;

    responseData.stockStatus = currentStock <= 0
        ? (allowBackorder ? 'backorder' : 'out-of-stock')
        : (currentStock <= lowThresh ? 'low-stock' : 'in-stock');

    res.status(200).json({ success: true, product: responseData, stock: stockRecord });
});

/**
 * Stock In - Add inventory (restocking)
 * POST /v1/stock-operations/stock-in
 */
const stockIn = asyncHandler(async (req, res) => {
    const { productId, quantity, userId, companyId, shopId, reason = 'Stock In' } = req.body;

    // Validation
    if (!productId || !quantity) {
        return res.status(400).json({ success: false, message: 'Product ID and quantity are required' });
    }
    if (!companyId) {
        return res.status(400).json({ success: false, message: 'Company ID is required' });
    }
    if (!shopId) {
        return res.status(400).json({ success: false, message: 'Shop ID is required' });
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    // Resolve product
    validateMongoId(productId);
    const product = await Product.findById(productId);

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Validate company ownership
    if (product.companyId.toString() !== companyId.toString()) {
        return res.status(403).json({ success: false, message: 'Product does not belong to the specified company' });
    }

    // Get current stock from ProductStock
    const stockRecord = await ProductStock.findOne({ productId: product._id });

    if (!stockRecord) return res.status(404).json({ success: false, message: 'Stock record not found' });
    const previous = stockRecord.stockQty || 0;

    // Build StockChange payload (StockChange pre-save will apply atomic update)
    const scPayload = {
        companyId: product.companyId,
        shopId: shopId,
        productId: product._id,
        variationId: null,
        type: 'restock',
        qty: Math.abs(Number(quantity)),
        previous: previous,
        reason: reason,
        userId: userId || 'system',
        meta: {
            productName: product.name,
            categoryId: product.categoryId,
            unitCost: product.pricingId?.cost || 0
        }
    };

    try {
        await StockChange.create(scPayload);
    } catch (err) {
        logger.error('StockChange.create error (stockIn):', err.message || err);
        throw err;
    }

    // Get updated stock
    const updatedStock = await ProductStock.findOne({ productId: product._id });
    const totalAfter = updatedStock?.stockQty || 0;

    // Persist audit
    try {
        await require('../models/ProductAudit').create({
            productId: product._id,
            action: 'stock_change',
            changedBy: userId || 'system',
            oldValue: { quantity: previous },
            newValue: { quantity: totalAfter, operation: 'stock-in' },
            timestamp: new Date()
        });
    } catch (e) {
        logger.warn('Failed to persist ProductAudit (stockIn):', e.message || e);
    }

    // Invalidate caches & emit event
    await redis.del(`product:${product._id}`);
    await redis.del(`product:slug:${product.slug}`);
    await scanDel('products:*');
    await publishProductEvent('inventory.stock.updated', {
        productId: product._id,
        productName: product.name,
        companyId: product.companyId,
        shopId: shopId || product.shopId,
        previous,
        current: totalAfter,
        change: Number(quantity),
        type: 'restock'
    });

    // Trigger stock monitoring to check for low stock or backorder fulfillment
    try {
        StockMonitoringService.recordStockChange(product._id, 'received', Number(quantity), {
            companyId: product.companyId,
            shopId: shopId || product.shopId,
            reference: 'stockIn',
            reason: reason || 'Stock in operation',
            performedBy: userId || 'system'
        }).catch(err => logger.error('Failed to record stock change:', err));

        // Check if this replenishment can fulfill any backorders
        await StockMonitoringService.monitorBackorders(product.companyId, shopId || product.shopId).catch(err =>
            logger.error('Backorder monitoring failed:', err)
        );
    } catch (error) {
        logger.error('Stock monitoring error:', error.message);
        // Don't fail the request if monitoring fails
    }

    res.status(200).json({ success: true, message: 'Stock added successfully', previous, newTotal: totalAfter, data: { productId: product._id, productName: product.name, sku: product.sku, previousStock: previous, newStock: totalAfter, quantityAdded: Number(quantity), operation: 'stock-in' } });
});

/**
 * Stock Out - Remove inventory (sales, damage, etc.)
 * POST /v1/stock-operations/stock-out
 */
const stockOut = asyncHandler(async (req, res) => {
    const { productId, quantity, userId, companyId, shopId, reason = 'Stock Out', changeType = 'sale' } = req.body;

    // Validation
    if (!productId || !quantity) return res.status(400).json({ success: false, message: 'Product ID and quantity are required' });
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
    if (!shopId) return res.status(400).json({ success: false, message: 'Shop ID is required' });
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });

    // Resolve product
    validateMongoId(productId);
    const product = await Product.findById(productId);

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Validate company ownership
    if (product.companyId.toString() !== companyId.toString()) {
        return res.status(403).json({ success: false, message: 'Product does not belong to the specified company' });
    }

    // Get current stock from ProductStock
    const stockRecord = await ProductStock.findOne({ productId: product._id });

    if (!stockRecord) return res.status(404).json({ success: false, message: 'Stock record not found' });
    const previous = stockRecord.stockQty || 0;

    // Check stock availability (respect backorder settings)
    if (previous < Number(quantity) && !stockRecord.allowBackorder) {
        return res.status(400).json({ success: false, message: `Insufficient stock. Available: ${previous}, Requested: ${quantity}` });
    }

    const scPayload = {
        companyId: product.companyId,
        shopId: shopId,
        productId: product._id,
        variationId: null,
        type: changeType === 'sale' ? 'sale' : 'adjustment',
        qty: -Math.abs(Number(quantity)),
        previous: previous,
        reason: reason,
        userId: userId || 'system',
        meta: {
            productName: product.name,
            categoryId: product.categoryId,
            unitCost: product.pricingId?.cost || 0
        }
    };

    try {
        await StockChange.create(scPayload);
    } catch (err) {
        logger.error('StockChange.create error (stockOut):', err.message || err);
        throw err;
    }

    // Get updated stock
    const updatedStock = await ProductStock.findOne({ productId: product._id });
    const totalAfter = updatedStock?.stockQty || 0;

    // Persist audit
    try {
        await require('../models/ProductAudit').create({
            productId: product._id,
            action: 'stock_change',
            changedBy: userId || 'system',
            oldValue: { quantity: previous },
            newValue: { quantity: totalAfter, operation: 'stock-out' },
            timestamp: new Date()
        });
    } catch (e) {
        logger.warn('Failed to persist ProductAudit (stockOut):', e.message || e);
    }

    // Trigger low stock alert
    let lowStockAlert = false;
    try {
        const lowThresh = stockRecord?.lowStockThreshold ?? 5;
        if (totalAfter <= lowThresh) {
            lowStockAlert = true;
            const Alert = require('../models/Alert');
            const scope = product.shopId ? 'shop' : 'company';
            await Alert.createOrUpdate({ companyId: product.companyId, scope, shopId: product.shopId || null, type: 'low_stock', productId: product._id, threshold: lowThresh, message: `Stock for product ${product.name} is low: ${totalAfter}`, data: { currentStock: totalAfter } });
        }
    } catch (e) {
        logger.warn('Low stock alert check failed (stockOut):', e.message || e);
    }

    // Invalidate caches & emit event
    await redis.del(`product:${product._id}`);
    await redis.del(`product:slug:${product.slug}`);
    await scanDel('products:*');
    await publishProductEvent('inventory.stock.updated', {
        productId: product._id,
        productName: product.name,
        companyId: product.companyId,
        shopId: shopId || product.shopId,
        previous,
        current: totalAfter,
        change: -Math.abs(Number(quantity)),
        type: changeType === 'sale' ? 'sale' : 'removal'
    });

    // Record stock change and trigger monitoring for low stock/out of stock
    try {
        const changeType_enum = changeType === 'sale' ? 'sale' : 'adjustment';
        StockMonitoringService.recordStockChange(product._id, changeType_enum, Number(quantity), {
            companyId: product.companyId,
            shopId: shopId || product.shopId,
            reference: 'stockOut',
            reason: reason || `Stock out - ${changeType}`,
            performedBy: userId || 'system',
            unitPrice: stockRecord?.avgCost || 0
        }).catch(err => logger.error('Failed to record stock change:', err));

        // Trigger monitoring to check for low stock or out of stock alerts
        await StockMonitoringService.monitorLowStock(product.companyId, shopId || product.shopId).catch(err =>
            logger.error('Low stock monitoring failed:', err)
        );
    } catch (error) {
        logger.error('Stock monitoring error:', error.message);
        // Don't fail the request if monitoring fails
    }

    res.status(200).json({ success: true, message: 'Stock removed successfully', previous, newTotal: totalAfter, data: { productId: product._id, productName: product.name, sku: product.sku, previousStock: previous, newStock: totalAfter, quantityRemoved: Number(quantity), operation: 'stock-out', stockStatus: totalAfter <= 0 ? 'out-of-stock' : (totalAfter <= (stockRecord?.lowStockThreshold ?? 5) ? 'low-stock' : 'in-stock'), lowStockAlert } });
});

/**
 * Bulk Stock In - Add inventory for multiple products
 * POST /v1/stock-operations/bulk-stock-in
 */
const bulkStockIn = asyncHandler(async (req, res) => {
    const { items, userId, companyId, shopId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Items array is required'
        });
    }
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'Company ID is required'
        });
    }
    if (!shopId) {
        return res.status(400).json({
            success: false,
            message: 'Shop ID is required'
        });
    }

    const results = {
        successful: [],
        failed: []
    };

    for (const item of items) {
        try {
            const { productId: itemProductId, quantity, reason = 'Stock In' } = item;

            if (!itemProductId || !quantity || Number(quantity) <= 0) {
                results.failed.push({ productId: item.productId, error: 'Invalid product ID or quantity' });
                continue;
            }

            // Resolve product
            validateMongoId(itemProductId);
            const product = await Product.findById(itemProductId);

            if (!product) {
                results.failed.push({ productId: item.productId, error: 'Product not found' });
                continue;
            }

            if (companyId && product.companyId !== companyId) {
                results.failed.push({ productId: item.productId, productName: product.name, error: 'Product does not belong to this company' });
                continue;
            }

            // Get stock from ProductStock
            const stockRecord = await ProductStock.findOne({ productId: product._id }).lean();
            const previous = stockRecord?.stockQty || 0;

            // Create stock change
            const scPayload = {
                companyId: product.companyId,
                shopId: shopId,
                productId: product._id,
                variationId: null,
                type: 'restock',
                qty: Math.abs(Number(quantity)),
                previous: previous,
                reason: reason,
                userId: userId || 'system',
                meta: {
                    productName: product.name,
                    categoryId: product.categoryId,
                    unitCost: product.pricingId?.cost || 0
                }
            };

            try {
                await StockChange.create(scPayload);
            } catch (err) {
                results.failed.push({ productId: item.productId, error: err.message || String(err) });
                continue;
            }

            // Get updated stock
            const updatedStock = await ProductStock.findOne({ productId: product._id }).lean();
            const totalAfter = updatedStock?.stockQty || 0;

            // Audit
            try {
                await require('../models/ProductAudit').create({
                    productId: product._id,
                    action: 'stock_change',
                    changedBy: userId || 'system',
                    oldValue: { quantity: previous },
                    newValue: { quantity: totalAfter, operation: 'bulk-stock-in' }
                });
            } catch (e) { }

            // Invalidate cache
            await redis.del(`product:${product._id}`);
            await redis.del(`product:slug:${product.slug}`);

            results.successful.push({ productId: product._id, productName: product.name, sku: product.sku, previousStock: previous, newStock: totalAfter, quantityAdded: Number(quantity) });

        } catch (err) {
            results.failed.push({ productId: item.productId, error: err.message });
        }
    }

    // Invalidate list caches
    await scanDel('products:*');

    // Emit bulk event
    await publishProductEvent('inventory.bulk.stock_in', {
        companyId,
        shopId,
        userId,
        items: results.successful,
        failedCount: results.failed.length,
        totalRequested: items.length,
        timestamp: new Date().toISOString()
    });

    res.status(200).json({
        success: true,
        message: `Bulk stock in completed. ${results.successful.length} successful, ${results.failed.length} failed`,
        data: results
    });
});

/**
 * Bulk Stock Out - Remove inventory for multiple products
 * POST /v1/stock-operations/bulk-stock-out
 */
const bulkStockOut = asyncHandler(async (req, res) => {
    const { items, userId, companyId, shopId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Items array is required'
        });
    }
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: 'Company ID is required'
        });
    }
    if (!shopId) {
        return res.status(400).json({
            success: false,
            message: 'Shop ID is required'
        });
    }

    const results = {
        successful: [],
        failed: []
    };

    for (const item of items) {
        try {
            const { productId: itemProductId, quantity, reason = 'Stock Out', changeType = 'sale' } = item;

            if (!itemProductId || !quantity || Number(quantity) <= 0) {
                results.failed.push({ productId: item.productId, error: 'Invalid product ID or quantity' });
                continue;
            }

            // Resolve product
            validateMongoId(itemProductId);
            const product = await Product.findById(itemProductId);

            if (!product) {
                results.failed.push({ productId: item.productId, error: 'Product not found' });
                continue;
            }

            if (companyId && product.companyId !== companyId) {
                results.failed.push({ productId: item.productId, productName: product.name, error: 'Product does not belong to this company' });
                continue;
            }

            // Get stock from ProductStock
            const stockRecord = await ProductStock.findOne({ productId: product._id }).lean();
            const previous = stockRecord?.stockQty || 0;

            // Check sufficient stock
            if (previous < Number(quantity) && !(stockRecord?.allowBackorder)) {
                results.failed.push({ productId: item.productId, productName: product.name, error: `Insufficient stock. Available: ${previous}, Requested: ${quantity}` });
                continue;
            }

            // Create stock change
            const scPayload = {
                companyId: product.companyId,
                shopId: shopId,
                productId: product._id,
                variationId: null,
                type: changeType === 'sale' ? 'sale' : 'adjustment',
                qty: -Math.abs(Number(quantity)),
                previous: previous,
                reason: reason,
                userId: userId || 'system',
                meta: {
                    productName: product.name,
                    categoryId: product.categoryId,
                    unitCost: product.pricingId?.cost || 0
                }
            };

            try {
                await StockChange.create(scPayload);
            } catch (err) {
                results.failed.push({ productId: item.productId, error: err.message || String(err) });
                continue;
            }

            // Get updated stock
            const updatedStock = await ProductStock.findOne({ productId: product._id }).lean();
            const totalAfter = updatedStock?.stockQty || 0;

            // Low stock alert
            let lowStockAlert = false;
            try {
                const lowThresh = stockRecord?.lowStockThreshold ?? 5;
                if (totalAfter <= lowThresh) {
                    lowStockAlert = true;
                    const Alert = require('../models/Alert');
                    const scope = product.shopId ? 'shop' : 'company';
                    await Alert.createOrUpdate({ companyId: product.companyId, scope, shopId: product.shopId || null, type: 'low_stock', productId: product._id, threshold: lowThresh, message: `Stock for product ${product.name} is low: ${totalAfter}`, data: { currentStock: totalAfter } });
                }
            } catch (e) { }

            // Invalidate cache
            await redis.del(`product:${product._id}`);
            await redis.del(`product:slug:${product.slug}`);

            results.successful.push({ productId: product._id, productName: product.name, sku: product.sku, previousStock: previous, newStock: totalAfter, quantityRemoved: Number(quantity), lowStockAlert });

        } catch (err) {
            results.failed.push({ productId: item.productId, error: err.message });
        }
    }

    // Invalidate list caches
    await scanDel('products:*');

    // Emit bulk event
    await publishProductEvent('inventory.bulk.stock_out', {
        companyId,
        shopId,
        userId,
        items: results.successful,
        failedCount: results.failed.length,
        totalRequested: items.length,
        timestamp: new Date().toISOString()
    });

    res.status(200).json({
        success: true,
        message: `Bulk stock out completed. ${results.successful.length} successful, ${results.failed.length} failed`,
        data: results
    });
});

// ==================== STOCK CHANGE HISTORY & CRUD ====================


const getStockChangeById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateMongoId(id);

    const stockChange = await StockChange.findById(id)
        .populate('productId', 'name slug');

    if (!stockChange) {
        return res.status(404).json({ success: false, message: 'Stock change not found' });
    }

    res.status(200).json({ success: true, data: stockChange });
});

const createStockChange = asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
    }

    const stockChange = new StockChange({
        ...req.body,
        companyId: req.user.companyId,
        userId: req.user.id
    });
    await stockChange.save();

    res.status(201).json({ success: true, message: 'Stock change recorded successfully', data: stockChange });
});

const getStockHistory = asyncHandler(async (req, res) => {
    const {
        productId,
        variationId,
        shopId,
        startDate,
        endDate,
        changeType,
        page = 1,
        limit = 50,
        groupBy = 'day' // optional: 'day'|'week'|'month'
    } = req.query;

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }
    validateMongoId(productId);
    if (variationId) validateMongoId(variationId);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    // Build query
    const query = { productId };
    if (variationId) query.variationId = variationId;
    if (shopId) query.shopId = shopId;
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

    // Resolve product and current stock snapshot in parallel
    const [product, stockRecord] = await Promise.all([
        Product.findById(productId).select('name sku brand images companyId').lean(),
        ProductStock.findOne({ productId, ...(shopId ? { shopId } : {}) }).lean()
    ]);

    // Recent changes (paginated) - include product info for context
    const changesPromise = StockChange.find(query)
        .populate('productId', 'name sku brand categoryId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean();

    const countPromise = StockChange.countDocuments(query);

    // Aggregation: overall summary, type breakdown, top users, time-series
    const groupFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-%m-%d' : '%Y-%m-%d';

    const aggPromise = StockChange.aggregate([
        { $match: query },
        {
            $facet: {
                overall: [
                    {
                        $group: {
                            _id: null,
                            totalChanges: { $sum: 1 },
                            totalInbound: { $sum: { $cond: [{ $gt: ['$qty', 0] }, '$qty', 0] } },
                            totalOutbound: { $sum: { $cond: [{ $lt: ['$qty', 0] }, { $multiply: ['$qty', -1] }, 0] } },
                            netChange: { $sum: '$qty' },
                            avgQtyPerTransaction: { $avg: { $abs: '$qty' } }
                        }
                    }
                ],
                byType: [
                    { $group: { _id: '$type', count: { $sum: 1 }, totalQty: { $sum: '$qty' } } },
                    { $sort: { count: -1 } }
                ],
                byUser: [
                    { $group: { _id: '$userId', userId: { $first: '$userId' }, transactionCount: { $sum: 1 }, totalQtyChanged: { $sum: { $abs: '$qty' } } } },
                    { $sort: { transactionCount: -1 } },
                    { $limit: 10 }
                ],
                timeSeries: [
                    {
                        $group: {
                            _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
                            count: { $sum: 1 },
                            qty: { $sum: '$qty' }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]
            }
        }
    ]);

    const [changes, total, agg] = await Promise.all([changesPromise, countPromise, aggPromise]);

    const agg0 = (agg && agg[0]) || {};
    const overall = (agg0.overall && agg0.overall[0]) || { totalChanges: 0, totalInbound: 0, totalOutbound: 0, netChange: 0, avgQtyPerTransaction: 0 };
    const byType = agg0.byType || [];
    const byUser = agg0.byUser || [];
    const timeSeries = (agg0.timeSeries || []).map(item => ({ period: item._id, count: item.count, qty: item.qty }));

    // Enrich some quick insights
    const insights = {
        product: product ? { id: product._id, name: product.name, sku: product.sku, brand: product.brand } : null,
        currentStock: stockRecord ? stockRecord.stockQty || 0 : null,
        lowStockThreshold: stockRecord ? stockRecord.lowStockThreshold ?? null : null,
        topChangeTypes: byType.slice(0, 5).map(t => ({ type: t._id, count: t.count, qty: t.totalQty })),
        topUsers: byUser.map(u => ({ userId: u.userId, transactions: u.transactionCount, totalQtyChanged: u.totalQtyChanged })),
        timeSeries
    };

    res.status(200).json({
        success: true,
        data: {
            productSnapshot: insights.product,
            stockSnapshot: {
                currentStock: insights.currentStock,
                lowStockThreshold: insights.lowStockThreshold
            },
            summary: overall,
            breakdown: {
                byType,
                byUser
            },
            recentChanges: changes,
            pagination: {
                page: parseInt(page),
                limit: safeLimit,
                total,
                pages: Math.ceil(total / safeLimit)
            },
            insights: {
                topChangeTypes: insights.topChangeTypes,
                topUsers: insights.topUsers
            }
        }
    });
});

/**
 * Get stock changes per User, Company, and Shop
 * GET /v1/stock-operations/user-changes
 * 
 * Allows control and management of all stock changes made by specific users
 * in specific companies and shops
 * 
 * Query params:
 * - userId (required): The user who made the stock changes
 * - companyId (required): The company context
 * - shopId (optional): Filter by specific shop
 * - changeType (optional): 'sale', 'restock', 'return', 'adjustment', 'damage', 'transfer'
 * - startDate (optional): ISO date string
 * - endDate (optional): ISO date string
 * - page (optional): Page number (default 1)
 * - limit (optional): Items per page (default 20, max 100)
 */
const getStockChangesByUser = asyncHandler(async (req, res) => {
    const { userId, companyId, shopId, changeType, startDate, endDate, page = 1, limit = 20 } = req.body || req.body || req.params;

    // Validation
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    if (!companyId) {
        return res.status(400).json({ success: false, message: 'Company ID is required' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const safeLimitr = Math.min(parseInt(limit) || 20, 100); // Max 100 per page

    // Build query with required filters
    const query = {
        userId: userId,
        companyId: companyId
    };

    // Optional filters
    if (shopId) {
        query.shopId = shopId;
    }
    if (changeType) {
        query.type = changeType;
    }

    // Date range filter
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
            query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
            const endDateObj = new Date(endDate);
            endDateObj.setHours(23, 59, 59, 999); // Include entire end day
            query.createdAt.$lte = endDateObj;
        }
    }

    try {
        // Get stock changes with product information
        const changes = await StockChange.find(query)
            .populate('productId', 'name sku brand categoryId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimitr)
            .lean();

        // Get total count for pagination
        const total = await StockChange.countDocuments(query);

        // Calculate statistics
        const stats = await StockChange.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalChanges: { $sum: 1 },
                    totalQtyIn: {
                        $sum: {
                            $cond: [{ $gt: ['$qty', 0] }, '$qty', 0]
                        }
                    },
                    totalQtyOut: {
                        $sum: {
                            $cond: [{ $lt: ['$qty', 0] }, { $multiply: ['$qty', -1] }, 0]
                        }
                    },
                    byType: {
                        $push: '$type'
                    }
                }
            },
            {
                $addFields: {
                    typeBreakdown: {
                        $reduce: {
                            input: '$byType',
                            initialValue: {},
                            in: {
                                $mergeObjects: [
                                    '$$value',
                                    {
                                        $cond: [
                                            { $eq: ['$$this', 'sale'] },
                                            { sale: { $add: [{ $ifNull: ['$$value.sale', 0] }, 1] } },
                                            {
                                                $cond: [
                                                    { $eq: ['$$this', 'restock'] },
                                                    { restock: { $add: [{ $ifNull: ['$$value.restock', 0] }, 1] } },
                                                    {
                                                        $cond: [
                                                            { $eq: ['$$this', 'return'] },
                                                            { return: { $add: [{ $ifNull: ['$$value.return', 0] }, 1] } },
                                                            {
                                                                $cond: [
                                                                    { $eq: ['$$this', 'adjustment'] },
                                                                    { adjustment: { $add: [{ $ifNull: ['$$value.adjustment', 0] }, 1] } },
                                                                    '$$value'
                                                                ]
                                                            }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalChanges: 1,
                    totalQtyIn: 1,
                    totalQtyOut: 1,
                    typeBreakdown: 1,
                    netChange: { $subtract: ['$totalQtyIn', '$totalQtyOut'] }
                }
            }
        ]);

        const summary = stats[0] || {
            totalChanges: 0,
            totalQtyIn: 0,
            totalQtyOut: 0,
            netChange: 0,
            typeBreakdown: {}
        };

        res.status(200).json({
            success: true,
            data: {
                changes,
                summary,
                pagination: {
                    page: parseInt(page),
                    limit: safeLimitr,
                    total,
                    pages: Math.ceil(total / safeLimitr)
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching stock changes by user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch stock changes',
            error: error.message
        });
    }
});

/**
 * Get stock changes summary by user and company
 * GET /v1/stock-operations/user-summary
 * 
 * Shows high-level stats about user activity in company/shop
 */
const getStockChangesSummaryByUser = asyncHandler(async (req, res) => {
    const { userId, companyId, shopId, startDate, endDate } = req.body || req.body || req.params;;

    if (!userId || !companyId) {
        return res.status(400).json({
            success: false,
            message: 'User ID and Company ID are required'
        });
    }

    const query = {
        userId,
        companyId
    };

    if (shopId) query.shopId = shopId;

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
        const summary = await StockChange.aggregate([
            { $match: query },
            {
                $facet: {
                    overall: [
                        {
                            $group: {
                                _id: null,
                                totalTransactions: { $sum: 1 },
                                totalInbound: { $sum: { $cond: [{ $gt: ['$qty', 0] }, '$qty', 0] } },
                                totalOutbound: { $sum: { $cond: [{ $lt: ['$qty', 0] }, { $multiply: ['$qty', -1] }, 0] } },
                                firstTransaction: { $min: '$createdAt' },
                                lastTransaction: { $max: '$createdAt' }
                            }
                        }
                    ],
                    byType: [
                        {
                            $group: {
                                _id: '$type',
                                count: { $sum: 1 },
                                totalQty: { $sum: '$qty' }
                            }
                        },
                        { $sort: { count: -1 } }
                    ],
                    byProduct: [
                        {
                            $group: {
                                _id: '$productId',
                                productName: { $first: '$productId' },
                                transactionCount: { $sum: 1 },
                                totalQtyChanged: { $sum: '$qty' }
                            }
                        },
                        { $sort: { transactionCount: -1 } },
                        { $limit: 10 } // Top 10 products
                    ]
                }
            },
            {
                $addFields: {
                    details: {
                        userId: userId,
                        companyId: companyId,
                        shopId: shopId || 'all',
                        generatedAt: new Date()
                    }
                }
            }
        ]);

        const data = summary[0] || {
            overall: [],
            byType: [],
            byProduct: [],
            details: {}
        };

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        logger.error('Error generating stock changes summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate summary',
            error: error.message
        });
    }
});

/**
 * Get all stock changes for an entire company
 * GET /v1/stock-operations/company-changes
 * 
 * Shows all stock changes across entire company (all shops, all users)
 * with complete information for management and analysis
 */
const getCompanyStockChanges = asyncHandler(async (req, res) => {
    const { companyId, changeType, startDate, endDate, page = 1, limit = 20 } = req.query || req.body || req.params;

    if (!companyId) {
        return res.status(400).json({ success: false, message: 'Company ID is required' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const safeLimit = Math.min(parseInt(limit) || 20, 100);

    // Build query
    const query = { companyId };

    if (changeType) {
        query.type = changeType;
    }

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
        // Get stock changes with full information
        const changes = await StockChange.find(query)
            .populate('productId', 'name sku brand categoryId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .lean();

        // Get total count
        const total = await StockChange.countDocuments(query);

        // Calculate company-wide statistics
        const stats = await StockChange.aggregate([
            { $match: query },
            {
                $facet: {
                    summary: [
                        {
                            $group: {
                                _id: null,
                                totalChanges: { $sum: 1 },
                                totalInbound: { $sum: { $cond: [{ $gt: ['$qty', 0] }, '$qty', 0] } },
                                totalOutbound: { $sum: { $cond: [{ $lt: ['$qty', 0] }, { $multiply: ['$qty', -1] }, 0] } },
                                avgQtyPerTransaction: { $avg: { $abs: '$qty' } },
                                minValue: { $min: '$qty' },
                                maxValue: { $max: '$qty' }
                            }
                        }
                    ],
                    byType: [
                        {
                            $group: {
                                _id: '$type',
                                count: { $sum: 1 },
                                totalQty: { $sum: '$qty' }
                            }
                        },
                        { $sort: { count: -1 } }
                    ],
                    byShop: [
                        {
                            $group: {
                                _id: '$shopId',
                                shopId: { $first: '$shopId' },
                                transactionCount: { $sum: 1 },
                                totalInbound: { $sum: { $cond: [{ $gt: ['$qty', 0] }, '$qty', 0] } },
                                totalOutbound: { $sum: { $cond: [{ $lt: ['$qty', 0] }, { $multiply: ['$qty', -1] }, 0] } }
                            }
                        },
                        { $sort: { transactionCount: -1 } }
                    ],
                    byUser: [
                        {
                            $group: {
                                _id: '$userId',
                                userId: { $first: '$userId' },
                                transactionCount: { $sum: 1 },
                                totalQtyChanged: { $sum: { $abs: '$qty' } }
                            }
                        },
                        { $sort: { transactionCount: -1 } },
                        { $limit: 10 } // Top 10 users
                    ]
                }
            }
        ]);

        const statsData = stats[0] || {
            summary: [],
            byType: [],
            byShop: [],
            byUser: []
        };

        res.status(200).json({
            success: true,
            data: {
                changes,
                statistics: {
                    summary: statsData.summary[0] || {},
                    byType: statsData.byType,
                    byShop: statsData.byShop,
                    topUsers: statsData.byUser
                },
                pagination: {
                    page: parseInt(page),
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit)
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching company stock changes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch company stock changes',
            error: error.message
        });
    }
});

/**
 * Get all stock changes for a specific shop
 * GET /v1/stock-operations/shop-changes
 * 
 * Shows all stock changes for a specific shop across all users
 * with complete information for shop management and analysis
 */
const getShopStockChanges = asyncHandler(async (req, res) => {
    const { companyId, shopId, changeType, userId, startDate, endDate, page = 1, limit = 20 } = req.query || req.body || req.params;

    if (!companyId || !shopId) {
        return res.status(400).json({
            success: false,
            message: 'Company ID and Shop ID are required'
        });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const safeLimit = Math.min(parseInt(limit) || 20, 100);

    // Build query
    const query = { companyId, shopId };

    if (changeType) {
        query.type = changeType;
    }

    if (userId) {
        query.userId = userId;
    }

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
        // Get stock changes with full information
        const changes = await StockChange.find(query)
            .populate('productId', 'name sku brand categoryId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .lean();

        // Get total count
        const total = await StockChange.countDocuments(query);

        // Calculate shop-wide statistics
        const stats = await StockChange.aggregate([
            { $match: query },
            {
                $facet: {
                    summary: [
                        {
                            $group: {
                                _id: null,
                                totalChanges: { $sum: 1 },
                                totalInbound: { $sum: { $cond: [{ $gt: ['$qty', 0] }, '$qty', 0] } },
                                totalOutbound: { $sum: { $cond: [{ $lt: ['$qty', 0] }, { $multiply: ['$qty', -1] }, 0] } },
                                netChange: { $sum: '$qty' },
                                avgQtyPerTransaction: { $avg: { $abs: '$qty' } },
                                firstChange: { $min: '$createdAt' },
                                lastChange: { $max: '$createdAt' }
                            }
                        }
                    ],
                    byType: [
                        {
                            $group: {
                                _id: '$type',
                                count: { $sum: 1 },
                                totalQty: { $sum: '$qty' }
                            }
                        },
                        { $sort: { count: -1 } }
                    ],
                    byUser: [
                        {
                            $group: {
                                _id: '$userId',
                                userId: { $first: '$userId' },
                                transactionCount: { $sum: 1 },
                                totalInbound: { $sum: { $cond: [{ $gt: ['$qty', 0] }, '$qty', 0] } },
                                totalOutbound: { $sum: { $cond: [{ $lt: ['$qty', 0] }, { $multiply: ['$qty', -1] }, 0] } }
                            }
                        },
                        { $sort: { transactionCount: -1 } }
                    ],
                    byProduct: [
                        {
                            $group: {
                                _id: '$productId',
                                productName: { $first: '$productId' },
                                transactionCount: { $sum: 1 },
                                totalQtyChanged: { $sum: '$qty' }
                            }
                        },
                        { $sort: { transactionCount: -1 } },
                        { $limit: 10 } // Top 10 products
                    ]
                }
            }
        ]);

        const statsData = stats[0] || {
            summary: [],
            byType: [],
            byUser: [],
            byProduct: []
        };

        res.status(200).json({
            success: true,
            data: {
                shopId,
                changes,
                statistics: {
                    summary: statsData.summary[0] || {},
                    byType: statsData.byType,
                    byUser: statsData.byUser,
                    topProducts: statsData.byProduct
                },
                pagination: {
                    page: parseInt(page),
                    limit: safeLimit,
                    total,
                    pages: Math.ceil(total / safeLimit)
                }
            }
        });
    } catch (error) {
        logger.error('Error fetching shop stock changes:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch shop stock changes',
            error: error.message
        });
    }
});

/**
 * Get Stock Daily Summary - Summary of today's stock movements, revenue, and health
 * GET /v1/stock/daily-summary
 */
const getStockDailySummary = asyncHandler(async (req, res) => {
    const { companyId, shopId } = req.query;

    if (!companyId) {
        return res.status(400).json({ success: false, message: 'Company ID is required' });
    }

    // Set "today" range
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const query = {
        companyId,
        ...(shopId ? { shopId } : {}),
        createdAt: { $gte: startOfToday, $lte: endOfToday }
    };

    // 1. Stock Transitions (Ins and Outs)
    const movements = await StockChange.aggregate([
        { $match: query },
        {
            $facet: {
                stockIn: [
                    { $match: { type: { $in: ['restock', 'return', 'stockin'] } } },
                    { $group: { _id: null, count: { $sum: { $abs: '$qty' } }, list: { $push: '$$ROOT' } } }
                ],
                stockOut: [
                    { $match: { type: { $in: ['sale', 'damage', 'adjustment'] } } },
                    {
                        $group: {
                            _id: null,
                            count: { $sum: { $abs: '$qty' } },
                            revenue: { $sum: { $multiply: [{ $abs: '$qty' }, { $ifNull: ['$meta.unitPrice', 0] }] } },
                            list: { $push: '$$ROOT' }
                        }
                    }
                ]
            }
        }
    ]);

    const stockInData = movements[0]?.stockIn[0] || { count: 0, list: [] };
    const stockOutData = movements[0]?.stockOut[0] || { count: 0, revenue: 0, list: [] };

    // 2. Inventory Health (Low Stock & Totals)
    const stockStatus = await ProductStock.aggregate([
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
            $match: {
                'product.companyId': companyId,
                'product.isDeleted': false,
                ...(shopId ? { 'product.shopId': shopId } : {})
            }
        },
        {
            $facet: {
                totalProducts: [{ $count: 'count' }],
                lowStock: [
                    { $match: { isLowStock: true } },
                    { $project: { productId: 1, productName: '$product.name', stockQty: 1, lowStockThreshold: 1, sku: '$product.sku' } }
                ]
            }
        }
    ]);

    const totalProducts = stockStatus[0]?.totalProducts[0]?.count || 0;
    const lowStockItems = stockStatus[0]?.lowStock || [];

    res.status(200).json({
        success: true,
        data: {
            today: {
                date: startOfToday.toISOString().split('T')[0],
                stockIn: {
                    totalItems: stockInData.count,
                    activities: stockInData.list
                },
                stockOut: {
                    totalItems: stockOutData.count,
                    revenue: stockOutData.revenue.toFixed(2),
                    activities: stockOutData.list
                }
            },
            inventory: {
                totalUniqueProducts: totalProducts,
                lowStock: {
                    count: lowStockItems.length,
                    items: lowStockItems
                }
            }
        }
    });
});

module.exports = {
    getProductByScan,
    stockIn,
    stockOut,
    bulkStockIn,
    bulkStockOut,
    getStockChangeById,
    createStockChange,
    getStockHistory,
    getStockChangesByUser,
    getStockChangesSummaryByUser,
    getCompanyStockChanges,
    getShopStockChanges,
    getStockDailySummary
};
