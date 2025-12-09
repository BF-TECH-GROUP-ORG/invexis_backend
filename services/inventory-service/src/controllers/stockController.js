const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const { validateMongoId } = require('../utils/validateMongoId');
const { publishProductEvent } = require('../events/productEvents');
const redis = require('/app/shared/redis');
const { scanDel } = require('../utils/redisHelper');

// ==================== STOCK OPERATIONS (Stock In/Out) ====================

/**
 * Lookup product by scanned QR/Barcode data
 * POST /v1/stock-operations/lookup
 */
const getProductByScan = asyncHandler(async (req, res) => {
    const { scanData } = req.body;

    if (!scanData) {
        return res.status(400).json({
            success: false,
            message: 'Scan data is required'
        });
    }

    let product;

    // Try to find by ID first
    if (scanData.id) {
        try {
            validateMongoId(scanData.id);
            product = await Product.findById(scanData.id)
                .populate('category', 'name slug');
        } catch (err) {
            console.error('Error finding by ID:', err.message);
        }
    }

    // If not found by ID, try SKU. prefer variation-level sku
    if (!product && scanData.sku) {
        product = await Product.findOne({ 'variations.sku': scanData.sku })
            .populate('category', 'name slug');
        if (!product) {
            product = await Product.findOne({ sku: scanData.sku })
                .populate('category', 'name slug');
        }
    }

    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Build response data. If variation matched, return variation-level stock
    const responseData = {
        id: product._id,
        name: product.name,
        price: product.pricing.basePrice,
        currency: product.pricing.currency,
        images: product.images,
        qrCodeUrl: product.qrCodeUrl,
        barcodeUrl: product.barcodeUrl,
    };

    if (scanData.sku) {
        const variation = product.variations && product.variations.find(v => v.sku === scanData.sku);
        if (variation) {
            responseData.sku = variation.sku;
            // Return merged attributes: product-level defaults overridden by variation values
            try {
                responseData.variation = product.getEffectiveAttributesForSku(variation.sku);
            } catch (err) {
                // Fallback to raw variation attributes if helper fails
                responseData.variation = variation.attributes || [];
            }
            responseData.currentStock = variation.stockQty;
            responseData.lowStockThreshold = product.inventory.lowStockThreshold;
            responseData.stockStatus = variation.stockQty <= 0 ? (product.inventory.allowBackorder ? 'backorder' : 'out-of-stock') : (variation.stockQty <= product.inventory.lowStockThreshold ? 'low-stock' : 'in-stock');
        } else {
            responseData.sku = product.sku;
            responseData.currentStock = product.inventory.quantity;
            responseData.lowStockThreshold = product.inventory.lowStockThreshold;
            responseData.stockStatus = product.stockStatus;
        }
    } else {
        responseData.sku = product.sku;
        responseData.currentStock = product.inventory.quantity;
        responseData.lowStockThreshold = product.inventory.lowStockThreshold;
        responseData.stockStatus = product.stockStatus;
    }

    res.status(200).json({ success: true, data: responseData });
});

/**
 * Stock In - Add inventory (restocking)
 * POST /v1/stock-operations/stock-in
 */
const stockIn = asyncHandler(async (req, res) => {
    const { scanData, quantity, reason, userId, companyId, shopId } = req.body;

    // Validation
    if (!scanData || !quantity) {
        return res.status(400).json({
            success: false,
            message: 'Scan data and quantity are required'
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Quantity must be greater than 0'
        });
    }

    // Find product. Prefer variation-level sku
    let product;
    let variation;
    if (scanData.id) {
        validateMongoId(scanData.id);
        product = await Product.findById(scanData.id);
    } else if (scanData.sku) {
        product = await Product.findOne({ 'variations.sku': scanData.sku });
        if (product) {
            variation = product.variations.find(v => v.sku === scanData.sku);
        } else {
            product = await Product.findOne({ sku: scanData.sku });
        }
    }

    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Verify company ownership if companyId provided
    if (companyId && product.companyId !== companyId) {
        return res.status(403).json({
            success: false,
            message: 'Product does not belong to this company'
        });
    }

    let previousStock, newStock;
    if (variation) {
        previousStock = variation.stockQty || 0;
        newStock = previousStock + quantity;
        variation.stockQty = newStock;
        // Recalculate aggregate
        product.inventory.quantity = (product.variations || []).reduce((s, v) => s + (v.stockQty || 0), 0);
    } else {
        previousStock = product.inventory.quantity;
        newStock = previousStock + quantity;
        product.inventory.quantity = newStock;
    }

    // Create stock change record
    const stockChange = new StockChange({
        companyId: product.companyId,
        shopId: shopId || product.shopId || 'default', // Use provided shopId, product shopId, or default
        productId: product._id,
        changeType: 'restock',
        quantity: quantity,
        previousStock: previousStock,
        newStock: newStock,
        reason: reason || 'Stock in operation',
        userId: userId || 'system'
    });

    await stockChange.save();

    product.availability = product.inventory.quantity > 0 ? 'in_stock' : 'out_of_stock';

    // Add audit trail
    product.auditTrail.push({
        action: 'stock_change',
        changedBy: userId || 'system',
        oldValue: variation ? { sku: variation.sku, quantity: previousStock } : { quantity: previousStock },
        newValue: variation ? { sku: variation.sku, quantity: newStock, operation: 'stock-in' } : { quantity: newStock, operation: 'stock-in' }
    });

    await product.save();

    // Invalidate caches
    await redis.del(`product:${product._id}`);
    await redis.del(`product:slug:${product.slug}`);
    await scanDel('products:*');

    // Emit event
    await publishProductEvent('inventory.product.updated', product.toObject());

    res.status(200).json({
        success: true,
        message: 'Stock added successfully',
        data: {
            productId: product._id,
            productName: product.name,
            sku: variation ? variation.sku : product.sku,
            previousStock,
            newStock,
            quantityAdded: quantity,
            operation: 'stock-in',
            stockStatus: variation ? (variation.stockQty <= 0 ? (product.inventory.allowBackorder ? 'backorder' : 'out-of-stock') : (variation.stockQty <= product.inventory.lowStockThreshold ? 'low-stock' : 'in-stock')) : product.stockStatus
        }
    });
});

/**
 * Stock Out - Remove inventory (sales, damage, etc.)
 * POST /v1/stock-operations/stock-out
 */
const stockOut = asyncHandler(async (req, res) => {
    const { scanData, quantity, reason = "sold", changeType = 'sale', userId, companyId, shopId } = req.body;

    // Validation
    if (!scanData || !quantity) {
        return res.status(400).json({
            success: false,
            message: 'Scan data and quantity are required'
        });
    }

    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Quantity must be greater than 0'
        });
    }

    // Find product. Prefer variation-level sku
    let product;
    let variation;
    if (scanData.id) {
        validateMongoId(scanData.id);
        product = await Product.findById(scanData.id);
    } else if (scanData.sku) {
        product = await Product.findOne({ 'variations.sku': scanData.sku });
        if (product) {
            variation = product.variations.find(v => v.sku === scanData.sku);
        } else {
            product = await Product.findOne({ sku: scanData.sku });
        }
    }

    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }

    // Verify company ownership if companyId provided
    if (companyId && product.companyId !== companyId) {
        return res.status(403).json({
            success: false,
            message: 'Product does not belong to this company'
        });
    }

    let previousStock = variation ? (variation.stockQty || 0) : product.inventory.quantity;

    // Check if sufficient stock
    if (previousStock < quantity) {
        return res.status(400).json({
            success: false,
            message: `Insufficient stock. Available: ${previousStock}, Requested: ${quantity}`
        });
    }

    const newStock = previousStock - quantity;

    // Create stock change record
    const stockChange = new StockChange({
        companyId: product.companyId,
        shopId: shopId || product.shopId || 'default', // Use provided shopId, product shopId, or default
        productId: product._id,
        changeType: changeType === 'sale' ? 'sale' : 'adjustment',
        quantity: -quantity, // Negative for stock out
        previousStock: previousStock,
        newStock: newStock,
        reason: reason || `Stock out - ${changeType}`,
        userId: userId || 'system'
    });

    await stockChange.save();

    // Update variation or product inventory
    if (variation) {
        variation.stockQty = newStock;
        product.inventory.quantity = (product.variations || []).reduce((s, v) => s + (v.stockQty || 0), 0);
    } else {
        product.inventory.quantity = newStock;
    }
    product.availability = product.inventory.quantity > 0 ? 'in_stock' : 'out_of_stock';

    // Add audit trail
    product.auditTrail.push({
        action: 'stock_change',
        changedBy: userId || 'system',
        oldValue: variation ? { sku: variation.sku, quantity: previousStock } : { quantity: previousStock },
        newValue: variation ? { sku: variation.sku, quantity: newStock, operation: 'stock-out' } : { quantity: newStock, operation: 'stock-out' }
    });

    await product.save();

    // Check for low stock alert
    let lowStockAlert = false;
    if (product.inventory.quantity <= product.inventory.lowStockThreshold) {
        lowStockAlert = true;
        const Alert = require('../models/Alert');
        const alert = new Alert({
            companyId: product.companyId,
            type: 'low_stock',
            productId: product._id,
            threshold: product.inventory.lowStockThreshold,
            message: `Stock for product ${product.name} is low: ${product.inventory.quantity}`
        });
        await alert.save();
    }

    // Invalidate caches
    await redis.del(`product:${product._id}`);
    await redis.del(`product:slug:${product.slug}`);
    await scanDel('products:*');

    // Emit event
    await publishProductEvent('inventory.product.updated', product.toObject());

    res.status(200).json({
        success: true,
        message: 'Stock removed successfully',
        data: {
            productId: product._id,
            productName: product.name,
            sku: variation ? variation.sku : product.sku,
            previousStock,
            newStock,
            quantityRemoved: quantity,
            operation: 'stock-out',
            stockStatus: product.stockStatus,
            lowStockAlert
        }
    });
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
            const { scanData, quantity, reason } = item;

            if (!scanData || !quantity || quantity <= 0) {
                results.failed.push({
                    scanData,
                    error: 'Invalid scan data or quantity'
                });
                continue;
            }

            // Find product (prefer variation-level SKU)
            let product;
            let variation;
            if (scanData.id) {
                validateMongoId(scanData.id);
                product = await Product.findById(scanData.id);
            } else if (scanData.sku) {
                product = await Product.findOne({ 'variations.sku': scanData.sku });
                if (product) {
                    variation = product.variations.find(v => v.sku === scanData.sku);
                } else {
                    product = await Product.findOne({ sku: scanData.sku });
                }
            }

            if (!product) {
                results.failed.push({
                    scanData,
                    error: 'Product not found'
                });
                continue;
            }

            // Verify company ownership
            if (companyId && product.companyId !== companyId) {
                results.failed.push({
                    scanData,
                    productName: product.name,
                    error: 'Product does not belong to this company'
                });
                continue;
            }

            let previousStock = variation ? (variation.stockQty || 0) : product.inventory.quantity;
            const newStock = previousStock + quantity;

            // Create stock change record
            const stockChange = new StockChange({
                companyId: product.companyId,
                shopId: shopId || product.shopId || 'default', // Use provided shopId, product shopId, or default
                productId: product._id,
                changeType: 'restock',
                quantity: quantity,
                previousStock: previousStock,
                newStock: newStock,
                reason: reason || 'Bulk stock in operation',
                userId: userId || 'system'
            });

            await stockChange.save();

            // Update product (variation-aware)
            if (variation) {
                variation.stockQty = newStock;
                product.inventory.quantity = (product.variations || []).reduce((s, v) => s + (v.stockQty || 0), 0);
            } else {
                product.inventory.quantity = newStock;
            }
            product.availability = product.inventory.quantity > 0 ? 'in_stock' : 'out_of_stock';
            product.auditTrail.push({
                action: 'stock_change',
                changedBy: userId || 'system',
                oldValue: variation ? { sku: variation.sku, quantity: previousStock } : { quantity: previousStock },
                newValue: variation ? { sku: variation.sku, quantity: newStock, operation: 'bulk-stock-in' } : { quantity: newStock, operation: 'bulk-stock-in' }
            });

            await product.save();

            // Invalidate cache
            await redis.del(`product:${product._id}`);
            await redis.del(`product:slug:${product.slug}`);

            results.successful.push({
                productId: product._id,
                productName: product.name,
                sku: variation ? variation.sku : product.sku,
                previousStock,
                newStock,
                quantityAdded: quantity
            });

        } catch (err) {
            results.failed.push({
                scanData: item.scanData,
                error: err.message
            });
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
            const { scanData, quantity, reason, changeType = 'sale' } = item;

            if (!scanData || !quantity || quantity <= 0) {
                results.failed.push({
                    scanData,
                    error: 'Invalid scan data or quantity'
                });
                continue;
            }

            // Find product (prefer variation-level SKU)
            let product;
            let variation;
            if (scanData.id) {
                validateMongoId(scanData.id);
                product = await Product.findById(scanData.id);
            } else if (scanData.sku) {
                product = await Product.findOne({ 'variations.sku': scanData.sku });
                if (product) {
                    variation = product.variations.find(v => v.sku === scanData.sku);
                } else {
                    product = await Product.findOne({ sku: scanData.sku });
                }
            }

            if (!product) {
                results.failed.push({
                    scanData,
                    error: 'Product not found'
                });
                continue;
            }

            // Verify company ownership
            if (companyId && product.companyId !== companyId) {
                results.failed.push({
                    scanData,
                    productName: product.name,
                    error: 'Product does not belong to this company'
                });
                continue;
            }

            let previousStock = variation ? (variation.stockQty || 0) : product.inventory.quantity;

            // Check sufficient stock
            if (previousStock < quantity) {
                results.failed.push({
                    scanData,
                    productName: product.name,
                    error: `Insufficient stock. Available: ${previousStock}, Requested: ${quantity}`
                });
                continue;
            }

            const newStock = previousStock - quantity;

            // Create stock change record
            const stockChange = new StockChange({
                companyId: product.companyId,
                productId: product._id,
                changeType: changeType === 'sale' ? 'sale' : 'adjustment',
                quantity: -quantity,
                previousStock: previousStock,
                newStock: newStock,
                reason: reason || `Bulk stock out - ${changeType}`,
                userId: userId || 'system'
            });

            await stockChange.save();

            // Update product (variation-aware)
            if (variation) {
                variation.stockQty = newStock;
                product.inventory.quantity = (product.variations || []).reduce((s, v) => s + (v.stockQty || 0), 0);
            } else {
                product.inventory.quantity = newStock;
            }
            product.availability = product.inventory.quantity > 0 ? 'in_stock' : 'out_of_stock';
            product.auditTrail.push({
                action: 'stock_change',
                changedBy: userId || 'system',
                oldValue: variation ? { sku: variation.sku, quantity: previousStock } : { quantity: previousStock },
                newValue: variation ? { sku: variation.sku, quantity: newStock, operation: 'bulk-stock-out' } : { quantity: newStock, operation: 'bulk-stock-out' }
            });

            await product.save();

            // Check for low stock alert
            let lowStockAlert = false;
            if (product.inventory.quantity <= product.inventory.lowStockThreshold) {
                lowStockAlert = true;
                const Alert = require('../models/Alert');
                const alert = new Alert({
                    companyId: product.companyId,
                    type: 'low_stock',
                    productId: product._id,
                    threshold: product.inventory.lowStockThreshold,
                    message: `Stock for product ${product.name} is low: ${product.inventory.quantity}`
                });
                await alert.save();
            }

            // Invalidate cache
            await redis.del(`product:${product._id}`);
            await redis.del(`product:slug:${product.slug}`);

            results.successful.push({
                productId: product._id,
                productName: product.name,
                sku: variation ? variation.sku : product.sku,
                previousStock,
                newStock,
                quantityRemoved: quantity,
                lowStockAlert
            });

        } catch (err) {
            results.failed.push({
                scanData: item.scanData,
                error: err.message
            });
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
    const { productId, variationId, shopId, startDate, endDate, changeType } = req.query;

    if (!productId) {
        return res.status(400).json({ success: false, message: 'Product ID is required' });
    }
    validateMongoId(productId);
    if (variationId) validateMongoId(variationId);

    const history = await StockChange.getStockHistory({ productId, variationId, shopId, startDate, endDate, changeType });

    res.status(200).json({ success: true, data: history, count: history.length });
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
