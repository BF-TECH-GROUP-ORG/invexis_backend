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
const ProductVariation = require('../models/ProductVariation');
const ProductStock = require('../models/ProductStock');
const StockMonitoringService = require('../services/stockMonitoringService');
const logger = require('../utils/logger');

const getProductByScan = asyncHandler(async (req, res) => {
    const { scanData, productId } = req.body;

    if (!scanData && !productId) {
        return res.status(400).json({ success: false, message: 'Scan data is required' });
    }

    // Allow direct productId input or scanData (sku / id)
    let product;
    if (productId) {
        validateMongoId(productId);
        product = await Product.findById(productId).populate('categoryId', 'name slug').populate('pricingId');
    } else if (scanData) {
        if (scanData.id) {
            validateMongoId(scanData.id);
            product = await Product.findById(scanData.id).populate('categoryId', 'name slug').populate('pricingId');
        } else if (scanData.sku) {
            product = await Product.findOne({ sku: scanData.sku }).populate('categoryId', 'name slug').populate('pricingId');
        }
    }

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
    const { scanData, productId, quantity, reason, userId, companyId, shopId } = req.body;

    // Validation
    if ((!scanData && !productId) || !quantity) {
        return res.status(400).json({ success: false, message: 'Either scan data or productId and quantity are required' });
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    // Resolve product
    let product = null;
    if (productId) {
        validateMongoId(productId);
        product = await Product.findById(productId);
    } else if (scanData) {
        if (scanData.id) {
            validateMongoId(scanData.id);
            product = await Product.findById(scanData.id);
        } else if (scanData.sku) {
            product = await Product.findOne({ sku: scanData.sku });
        }
    }

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (companyId && product.companyId !== companyId) return res.status(403).json({ success: false, message: 'Product does not belong to this company' });

    // Get current stock from ProductStock
    const stockRecord = await ProductStock.findOne({ productId: product._id });
    
    if (!stockRecord) return res.status(404).json({ success: false, message: 'Stock record not found' });
    const previous = stockRecord.stockQty || 0;

    // Build StockChange payload (StockChange pre-save will apply atomic update)
    const scPayload = {
        companyId: product.companyId,
        shopId: shopId || product.shopId || 'default',
        productId: product._id,
        variationId: null,
        type: 'restock',
        qty: Math.abs(Number(quantity)),
        previous: previous,
        reason: reason || 'Stock in operation',
        userId: userId || 'system'
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
    await publishProductEvent('inventory.product.updated', { productId: product._id, previous, current: totalAfter });

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
    const { scanData, productId, quantity, reason = "sold", changeType = 'sale', userId, companyId, shopId } = req.body;

    // Validation
    if ((!scanData && !productId) || !quantity) return res.status(400).json({ success: false, message: 'Either scan data or productId and quantity are required' });
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });

    // Resolve product
    let product = null;
    if (productId) {
        validateMongoId(productId);
        product = await Product.findById(productId);
    } else if (scanData) {
        if (scanData.id) {
            validateMongoId(scanData.id);
            product = await Product.findById(scanData.id);
        } else if (scanData.sku) {
            product = await Product.findOne({ sku: scanData.sku });
        }
    }

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (companyId && product.companyId !== companyId) return res.status(403).json({ success: false, message: 'Product does not belong to this company' });

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
        shopId: shopId || product.shopId || 'default',
        productId: product._id,
        variationId: null,
        type: changeType === 'sale' ? 'sale' : 'adjustment',
        qty: -Math.abs(Number(quantity)),
        previous: previous,
        reason: reason || `Stock out - ${changeType}`,
        userId: userId || 'system'
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
    await publishProductEvent('inventory.product.updated', { productId: product._id, previous, current: totalAfter });

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

    const results = {
        successful: [],
        failed: []
    };

    for (const item of items) {
        try {
            const { scanData, productId: itemProductId, quantity, reason } = item;

            if ((!scanData && !itemProductId) || !quantity || Number(quantity) <= 0) {
                results.failed.push({ scanData: item.scanData, error: 'Invalid scan data or quantity' });
                continue;
            }

            // Resolve product & variation
            let product = null;
            let variation = null;
            if (itemProductId) {
                validateMongoId(itemProductId);
                product = await Product.findById(itemProductId);
            } else if (scanData) {
                if (scanData.id) {
                    validateMongoId(scanData.id);
                    product = await Product.findById(scanData.id);
                } else if (scanData.sku) {
                    variation = await ProductVariation.findOne({ sku: scanData.sku }).lean();
                    if (variation) {
                        product = await Product.findById(variation.productId);
                    } else {
                        product = await Product.findOne({ sku: scanData.sku });
                    }
                }
            }

            if (!product) {
                results.failed.push({ scanData: item.scanData, error: 'Product not found' });
                continue;
            }

            if (companyId && product.companyId !== companyId) {
                results.failed.push({ scanData: item.scanData, productName: product.name, error: 'Product does not belong to this company' });
                continue;
            }

            // Compute previous
            const prevAgg = variation
                ? { total: variation.stockQty || 0 }
                : (await ProductVariation.aggregate([{ $match: { productId: product._id } }, { $group: { _id: null, total: { $sum: '$stockQty' } } }]))[0] || { total: 0 };
            const previous = prevAgg.total || 0;

            // Create stock change (let StockChange pre-save update variation atomically)
            const scPayload = {
                companyId: product.companyId,
                shopId: shopId || product.shopId || 'default',
                productId: product._id,
                variationId: variation ? variation._id : null,
                type: 'restock',
                qty: Math.abs(Number(quantity)),
                previous: previous,
                reason: reason || 'Bulk stock in operation',
                userId: userId || 'system'
            };

            try {
                await StockChange.create(scPayload);
            } catch (err) {
                results.failed.push({ scanData: item.scanData, error: err.message || String(err) });
                continue;
            }

            // Recompute totals
            const aggAfter = await ProductVariation.aggregate([{ $match: { productId: product._id } }, { $group: { _id: null, total: { $sum: '$stockQty' } } }]);
            const totalAfter = aggAfter[0]?.total || 0;

            // Audit
            try { await require('../models/ProductAudit').create({ productId: product._id, action: 'stock_change', changedBy: userId || 'system', oldValue: variation ? { sku: variation.sku, quantity: previous } : { quantity: previous }, newValue: variation ? { sku: variation.sku, quantity: undefined, operation: 'bulk-stock-in' } : { quantity: totalAfter, operation: 'bulk-stock-in' } }); } catch (e) {}

            // Invalidate cache
            await redis.del(`product:${product._id}`);
            await redis.del(`product:slug:${product.slug}`);

            results.successful.push({ productId: product._id, productName: product.name, sku: variation ? variation.sku : product.sku, previousStock: previous, newStock: totalAfter, quantityAdded: Number(quantity) });

        } catch (err) {
            results.failed.push({ scanData: item.scanData, error: err.message });
        }
    }

    // Invalidate list caches
    await scanDel('products:*');

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

    const results = {
        successful: [],
        failed: []
    };

    for (const item of items) {
        try {
            const { scanData, productId: itemProductId, quantity, reason, changeType = 'sale' } = item;

            if ((!scanData && !itemProductId) || !quantity || Number(quantity) <= 0) {
                results.failed.push({ scanData: item.scanData, error: 'Invalid scan data or quantity' });
                continue;
            }

            // Resolve product & variation
            let product = null;
            let variation = null;
            if (itemProductId) {
                validateMongoId(itemProductId);
                product = await Product.findById(itemProductId);
            } else if (scanData) {
                if (scanData.id) {
                    validateMongoId(scanData.id);
                    product = await Product.findById(scanData.id);
                } else if (scanData.sku) {
                    variation = await ProductVariation.findOne({ sku: scanData.sku }).lean();
                    if (variation) {
                        product = await Product.findById(variation.productId);
                    } else {
                        product = await Product.findOne({ sku: scanData.sku });
                    }
                }
            }

            if (!product) {
                results.failed.push({ scanData: item.scanData, error: 'Product not found' });
                continue;
            }

            if (companyId && product.companyId !== companyId) {
                results.failed.push({ scanData: item.scanData, productName: product.name, error: 'Product does not belong to this company' });
                continue;
            }

            // Compute previous
            const prevAgg = variation
                ? { total: variation.stockQty || 0 }
                : (await ProductVariation.aggregate([{ $match: { productId: product._id } }, { $group: { _id: null, total: { $sum: '$stockQty' } } }]))[0] || { total: 0 };
            const previous = prevAgg.total || 0;

            // Check sufficient stock
            const stockSettings = await ProductStock.findOne({ productId: product._id }).lean();
            if (previous < Number(quantity) && !(stockSettings?.allowBackorder)) {
                results.failed.push({ scanData: item.scanData, productName: product.name, error: `Insufficient stock. Available: ${previous}, Requested: ${quantity}` });
                continue;
            }

            // Create stock change
            const scPayload = {
                companyId: product.companyId,
                shopId: shopId || product.shopId || 'default',
                productId: product._id,
                variationId: variation ? variation._id : null,
                type: changeType === 'sale' ? 'sale' : 'adjustment',
                qty: -Math.abs(Number(quantity)),
                previous: previous,
                reason: reason || `Bulk stock out - ${changeType}`,
                userId: userId || 'system'
            };

            try {
                await StockChange.create(scPayload);
            } catch (err) {
                results.failed.push({ scanData: item.scanData, error: err.message || String(err) });
                continue;
            }

            // Recompute totals
            const aggAfter = await ProductVariation.aggregate([{ $match: { productId: product._id } }, { $group: { _id: null, total: { $sum: '$stockQty' } } }]);
            const totalAfter = aggAfter[0]?.total || 0;

            // Low stock alert
            let lowStockAlert = false;
            try {
                const lowThresh = stockSettings?.lowStockThreshold ?? 5;
                if (totalAfter <= lowThresh) {
                    lowStockAlert = true;
                    const Alert = require('../models/Alert');
                    const scope = product.shopId ? 'shop' : 'company';
                    await Alert.createOrUpdate({ companyId: product.companyId, scope, shopId: product.shopId || null, type: 'low_stock', productId: product._id, threshold: lowThresh, message: `Stock for product ${product.name} is low: ${totalAfter}`, data: { currentStock: totalAfter } });
                }
            } catch (e) {}

            // Invalidate cache
            await redis.del(`product:${product._id}`);
            await redis.del(`product:slug:${product.slug}`);

            results.successful.push({ productId: product._id, productName: product.name, sku: variation ? variation.sku : product.sku, previousStock: previous, newStock: totalAfter, quantityRemoved: Number(quantity), lowStockAlert });

        } catch (err) {
            results.failed.push({ scanData: item.scanData, error: err.message });
        }
    }

    // Invalidate list caches
    await scanDel('products:*');

    res.status(200).json({
        success: true,
        message: `Bulk stock out completed. ${results.successful.length} successful, ${results.failed.length} failed`,
        data: results
    });
});

// ==================== STOCK CHANGE HISTORY & CRUD ====================

const getAllStockChanges = asyncHandler(async (req, res) => {
    const { companyId, shopId, productId, changeType, page = 1, limit = 20 } = req.query;

    if (!companyId) {
        return res.status(400).json({ success: false, message: 'Company ID is required' });
    }
    // validateMongoId(companyId);
    if (productId) validateMongoId(productId);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { companyId };
    if (shopId) query.shopId = shopId;
    if (productId) query.productId = productId;
    if (changeType) query.changeType = changeType;

    const stockChanges = await StockChange.find(query)
        .populate('productId', 'name slug')
        .sort({ changeDate: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await StockChange.countDocuments(query);

    res.status(200).json({
        success: true,
        data: stockChanges,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
});

const getStockChangeById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    validateMongoId(id);

    const stockChange = await StockChange.findById(id)
        .populate('productId', 'name slug inventory.quantity');

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
    const { productId, variationId, shopId, startDate, endDate, changeType, limit = 50 } = req.query;

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }
    validateMongoId(productId);
    if (variationId) validateMongoId(variationId);

    // Build query
    const query = { productId };
    if (variationId) query.variationId = variationId;
    if (shopId) query.shopId = shopId;
    if (changeType) query.type = changeType;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const changes = await StockChange.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

    res.status(200).json({ success: true, data: { changes, totalChanges: changes.length } });
});

module.exports = {
    getProductByScan,
    stockIn,
    stockOut,
    bulkStockIn,
    bulkStockOut,
    getAllStockChanges,
    getStockChangeById,
    createStockChange,
    getStockHistory
};
