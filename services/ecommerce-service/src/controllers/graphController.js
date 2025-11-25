const Catalog = require('../models/Catalog.models');
const Order = require('../models/Order.models');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

// Related products (graph-based: find products with similar attributes)
exports.getRelatedProducts = async (req, res, next) => {
    try {
        const { companyId, productId, limit = 5 } = req.query;
        const cacheKey = `related_products:${companyId}:${productId}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const product = await Catalog.findOne({ productId, companyId }).lean();
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const related = await Catalog.find({
            companyId,
            categoryId: product.categoryId,
            productId: { $ne: productId },
            status: 'active'
        }).limit(parseInt(limit)).lean();

        await cache.setJSON(cacheKey, related, 3600);
        res.json({ success: true, data: related });
    } catch (error) {
        logger.error('Error in getRelatedProducts:', error);
        next(error);
    }
};

// Frequently bought together (graph-based: analyze co-purchases)
exports.getFrequentlyBoughtTogether = async (req, res, next) => {
    try {
        const { companyId, productId, limit = 5 } = req.query;
        const cacheKey = `frequently_bought:${companyId}:${productId}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const coProducts = await Order.aggregate([
            { $match: { companyId, 'items.productId': productId } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $ne: productId } } },
            { $group: { _id: '$items.productId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: parseInt(limit) }
        ]);

        const productIds = coProducts.map(p => p._id);
        const products = await Catalog.find({ productId: { $in: productIds }, companyId }).lean();

        await cache.setJSON(cacheKey, products, 3600);
        res.json({ success: true, data: products });
    } catch (error) {
        logger.error('Error in getFrequentlyBoughtTogether:', error);
        next(error);
    }
};

// Product graph (network of relationships)
exports.getProductGraph = async (req, res, next) => {
    try {
        const { companyId, productId } = req.query;
        const cacheKey = `product_graph:${companyId}:${productId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const product = await Catalog.findOne({ productId, companyId }).lean();
        const relatedByCategory = await Catalog.find({ companyId, categoryId: product.categoryId, productId: { $ne: productId } }).limit(5).lean();
        const frequentlyBought = await Order.aggregate([
            { $match: { companyId, 'items.productId': productId } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $ne: productId } } },
            { $group: { _id: '$items.productId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        const graph = {
            center: product,
            relatedByCategory,
            frequentlyBought: frequentlyBought.map(p => p._id)
        };

        await cache.setJSON(cacheKey, graph, 3600);
        res.json({ success: true, data: graph });
    } catch (error) {
        logger.error('Error in getProductGraph:', error);
        next(error);
    }
};

// Category graph (hierarchical relationships)
exports.getCategoryGraph = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `category_graph:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const categories = await Catalog.aggregate([
            { $match: { companyId } },
            { $group: { _id: '$categoryId', subcategories: { $addToSet: '$subcategoryId' }, productCount: { $sum: 1 } } },
            { $sort: { productCount: -1 } }
        ]);

        const graph = {
            categories,
            totalCategories: categories.length
        };

        await cache.setJSON(cacheKey, graph, 3600);
        res.json({ success: true, data: graph });
    } catch (error) {
        logger.error('Error in getCategoryGraph:', error);
        next(error);
    }
};

// Customer buying patterns (graph-based: user behavior)
exports.getCustomerBuyingPatterns = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const cacheKey = `buying_patterns:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const userOrders = await Order.find({ companyId, userId }).lean();
        const purchasedProducts = [];
        const categoryPreferences = {};
        const productPreferences = {};

        userOrders.forEach(order => {
            order.items.forEach(item => {
                purchasedProducts.push(item.productId);
                productPreferences[item.productId] = (productPreferences[item.productId] || 0) + 1;
            });
        });

        const patterns = {
            totalOrders: userOrders.length,
            totalSpent: userOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
            purchasedProducts: [...new Set(purchasedProducts)],
            mostBought: Object.entries(productPreferences).sort((a, b) => b[1] - a[1]).slice(0, 5)
        };

        await cache.setJSON(cacheKey, patterns, 1800);
        res.json({ success: true, data: patterns });
    } catch (error) {
        logger.error('Error in getCustomerBuyingPatterns:', error);
        next(error);
    }
};

module.exports = exports;
