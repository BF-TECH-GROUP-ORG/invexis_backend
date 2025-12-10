const Catalog = require('../models/Catalog.models');
const Order = require('../models/Order.models');
const cache = require('../utils/cache');
const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

// Bulk update products
exports.bulkUpdateProducts = async (req, res, next) => {
    try {
        const { companyId, productIds, updates } = req.body;
        if (!productIds || !Array.isArray(productIds)) {
            return res.status(400).json({ success: false, message: 'productIds array is required' });
        }

        const result = await Catalog.updateMany({ productId: { $in: productIds }, companyId }, updates);
        await publish(exchanges.topic, 'ecommerce.catalog.bulk_updated', { companyId, productIds, updates, timestamp: Date.now() });

        // Invalidate cache for all updated products
        for (const productId of productIds) {
            await cache.del(`catalog:${productId}`);
        }

        res.json({ success: true, message: `Updated ${result.modifiedCount} products`, data: result });
    } catch (error) {
        logger.error('Error in bulkUpdateProducts:', error);
        next(error);
    }
};

// Bulk delete products
exports.bulkDeleteProducts = async (req, res, next) => {
    try {
        const { companyId, productIds } = req.body;
        if (!productIds || !Array.isArray(productIds)) {
            return res.status(400).json({ success: false, message: 'productIds array is required' });
        }

        const result = await Catalog.deleteMany({ productId: { $in: productIds }, companyId });
        await publish(exchanges.topic, 'ecommerce.catalog.bulk_deleted', { companyId, productIds, timestamp: Date.now() });

        for (const productId of productIds) {
            await cache.del(`catalog:${productId}`);
        }

        res.json({ success: true, message: `Deleted ${result.deletedCount} products`, data: result });
    } catch (error) {
        logger.error('Error in bulkDeleteProducts:', error);
        next(error);
    }
};

// Bulk update prices
exports.bulkUpdatePrices = async (req, res, next) => {
    try {
        const { companyId, updates } = req.body;
        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ success: false, message: 'updates array is required' });
        }

        const bulkOps = updates.map(({ productId, price, salePrice }) => ({
            updateOne: {
                filter: { productId, companyId },
                update: { $set: { price, salePrice } }
            }
        }));

        const result = await Catalog.bulkWrite(bulkOps);

        // Invalidate caches
        for (const { productId } of updates) {
            await cache.del(`catalog:${productId}`);
        }

        res.json({ success: true, message: `Updated ${result.modifiedCount} product prices`, data: result });
    } catch (error) {
        logger.error('Error in bulkUpdatePrices:', error);
        next(error);
    }
};

// Get products by category
exports.getProductsByCategory = async (req, res, next) => {
    try {
        const { companyId, categoryId, limit = 20, page = 1 } = req.query;
        const cacheKey = `products_category:${companyId}:${categoryId}:${page}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const products = await Catalog.find({ companyId, categoryId, status: 'active' })
            .limit(parseInt(limit))
            .skip(skip)
            .lean();

        const total = await Catalog.countDocuments({ companyId, categoryId, status: 'active' });
        const data = { products, pagination: { page: parseInt(page), limit: parseInt(limit), total } };

        await cache.setJSON(cacheKey, data, 3600);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Error in getProductsByCategory:', error);
        next(error);
    }
};

// Inventory management
exports.updateInventory = async (req, res, next) => {
    try {
        const { companyId, productId, stockQty, availability } = req.body;
        const product = await Catalog.findOneAndUpdate(
            { productId, companyId },
            { stockQty, availability },
            { new: true }
        );

        await cache.del(`catalog:${productId}`);
        await publish(exchanges.topic, 'ecommerce.catalog.inventory_updated', { companyId, productId, stockQty, availability, timestamp: Date.now() });

        res.json({ success: true, message: 'Inventory updated', data: product });
    } catch (error) {
        logger.error('Error in updateInventory:', error);
        next(error);
    }
};

// Get low stock products
exports.getLowStockProducts = async (req, res, next) => {
    try {
        const { companyId, threshold = 10 } = req.query;
        const cacheKey = `low_stock:${companyId}:${threshold}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const lowStockProducts = await Catalog.find({ companyId, stockQty: { $lte: parseInt(threshold) } }).lean();

        await cache.setJSON(cacheKey, lowStockProducts, 1800);
        res.json({ success: true, data: lowStockProducts });
    } catch (error) {
        logger.error('Error in getLowStockProducts:', error);
        next(error);
    }
};

// Get out of stock products
exports.getOutOfStockProducts = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `out_of_stock:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const outOfStockProducts = await Catalog.find({ companyId, stockQty: 0, availability: 'out_of_stock' }).lean();

        await cache.setJSON(cacheKey, outOfStockProducts, 1800);
        res.json({ success: true, data: outOfStockProducts });
    } catch (error) {
        logger.error('Error in getOutOfStockProducts:', error);
        next(error);
    }
};

// Price range analytics
exports.getPriceRangeAnalytics = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `price_range:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const priceRanges = await Catalog.aggregate([
            { $match: { companyId, status: 'active' } },
            { $bucket: { groupBy: '$price', boundaries: [0, 50, 100, 250, 500, 1000, 100000], default: 'other', output: { count: { $sum: 1 }, avgPrice: { $avg: '$price' } } } }
        ]);

        await cache.setJSON(cacheKey, priceRanges, 3600);
        res.json({ success: true, data: priceRanges });
    } catch (error) {
        logger.error('Error in getPriceRangeAnalytics:', error);
        next(error);
    }
};

// Get price analytics
exports.getPriceAnalytics = async (req, res, next) => {
    try {
        const { companyId } = req.user || req.query;
        const cacheKey = `price_analytics:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const stats = await Catalog.aggregate([
            { $match: { companyId } },
            {
                $group: {
                    _id: null,
                    avgPrice: { $avg: '$price' },
                    minPrice: { $min: '$price' },
                    maxPrice: { $max: '$price' },
                    totalProducts: { $sum: 1 }
                }
            }
        ]);

        const data = stats[0] || { avgPrice: 0, minPrice: 0, maxPrice: 0, totalProducts: 0 };
        await cache.setJSON(cacheKey, data, 3600);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Error in getPriceAnalytics:', error);
        next(error);
    }
};

// Get price optimization for a product
exports.getPriceOptimization = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const { companyId } = req.user || req.query;

        const product = await Catalog.findOne({ productId, companyId }).lean();
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Get similar products for comparison
        const similarProducts = await Catalog.find({
            companyId,
            categoryId: product.categoryId,
            productId: { $ne: productId }
        }).select('price').limit(10).lean();

        const avgMarketPrice = similarProducts.length > 0
            ? similarProducts.reduce((sum, p) => sum + p.price, 0) / similarProducts.length
            : product.price;

        const recommendation = {
            currentPrice: product.price,
            avgMarketPrice: Math.round(avgMarketPrice),
            priceGap: Math.round(product.price - avgMarketPrice),
            recommendation: product.price > avgMarketPrice ? 'Lower price' : product.price < avgMarketPrice * 0.8 ? 'Increase price' : 'Optimal'
        };

        res.json({ success: true, data: recommendation });
    } catch (error) {
        logger.error('Error in getPriceOptimization:', error);
        next(error);
    }
};

module.exports = exports;
