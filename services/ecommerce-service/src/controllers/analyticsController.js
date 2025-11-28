const Catalog = require('../models/Catalog.models');
const Order = require('../models/Order.models');
const Review = require('../models/Review.models');
const cache = require('../utils/cache');
const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

// Dashboard Analytics - Main entry point
exports.getDashboard = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        if (!companyId) {
            return res.status(400).json({ success: false, message: 'companyId required' });
        }

        const cacheKey = `dashboard:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const totalOrders = await Order.countDocuments({ companyId, isDeleted: false });
        const totalProducts = await Catalog.countDocuments({ companyId, status: 'active' });
        const totalReviews = await Review.countDocuments({ companyId });

        const orders = await Order.find({ companyId, isDeleted: false }).lean();
        const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        const dashboard = {
            totalOrders,
            totalProducts,
            totalReviews,
            totalRevenue,
            avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0
        };

        await cache.setJSON(cacheKey, dashboard, 3600);
        res.json({ success: true, data: dashboard });
    } catch (error) {
        logger.error('Error in getDashboard:', error);
        next(error);
    }
};

// Sales analytics and dashboard
exports.getSalesDashboard = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const { startDate, endDate } = req.query;
        const cacheKey = `dashboard:${companyId}:${startDate}:${endDate}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const query = { companyId, isDeleted: false };
        if (startDate && endDate) {
            query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const totalOrders = await Order.countDocuments(query);
        const orders = await Order.find(query).lean();
        const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const productCount = await Catalog.countDocuments({ companyId, status: 'active' });
        const reviewCount = await Review.countDocuments({ companyId });

        const dashboard = { totalOrders, totalRevenue, avgOrderValue, productCount, reviewCount };
        await cache.setJSON(cacheKey, dashboard, 3600);
        res.json({ success: true, data: dashboard });
    } catch (error) {
        logger.error('Error in getSalesDashboard:', error);
        next(error);
    }
}

// Top selling products
exports.getTopSellingProducts = async (req, res, next) => {
    try {
        const { companyId, limit = 10 } = req.query;
        const cacheKey = `top_selling:${companyId}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const topProducts = await Order.aggregate([
            { $match: { companyId, isDeleted: false } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', totalSold: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } } } },
            { $sort: { totalSold: -1 } },
            { $limit: parseInt(limit) }
        ]);

        await cache.setJSON(cacheKey, topProducts, 3600);
        res.json({ success: true, data: topProducts });
    } catch (error) {
        logger.error('Error in getTopSellingProducts:', error);
        next(error);
    }
};

// Product performance analytics
exports.getProductAnalytics = async (req, res, next) => {
    try {
        const { companyId, productId } = req.query;
        const cacheKey = `product_analytics:${companyId}:${productId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const product = await Catalog.findOne({ productId, companyId }).lean();
        const orders = await Order.find({ companyId, 'items.productId': productId }).lean();
        const reviews = await Review.find({ productId, companyId }).lean();

        const totalSold = orders.reduce((sum, o) => sum + (o.items.find(i => i.productId === productId)?.quantity || 0), 0);
        const revenue = orders.reduce((sum, o) => sum + (o.items.find(i => i.productId === productId)?.price * o.items.find(i => i.productId === productId)?.quantity || 0), 0);
        const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

        const analytics = { product, totalSold, revenue, reviewCount: reviews.length, avgRating };
        await cache.setJSON(cacheKey, analytics, 1800);
        res.json({ success: true, data: analytics });
    } catch (error) {
        logger.error('Error in getProductAnalytics:', error);
        next(error);
    }
};

// Get detail analytics for a single product
exports.getProductDetail = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const { companyId } = req.query;

        if (!companyId || !productId) {
            return res.status(400).json({ success: false, message: 'companyId and productId required' });
        }

        const cacheKey = `product_detail:${companyId}:${productId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const product = await Catalog.findOne({ productId, companyId }).lean();
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const orders = await Order.find({ companyId, 'items.productId': productId }).lean();
        const reviews = await Review.find({ productId, companyId }).lean();

        const totalSold = orders.reduce((sum, o) => {
            const item = o.items.find(i => i.productId === productId);
            return sum + (item?.quantity || 0);
        }, 0);

        const revenue = orders.reduce((sum, o) => {
            const item = o.items.find(i => i.productId === productId);
            return sum + ((item?.price || 0) * (item?.quantity || 0));
        }, 0);

        const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

        const detail = {
            product,
            sales: { totalSold, revenue },
            reviews: { count: reviews.length, avgRating },
            lastUpdated: new Date()
        };

        await cache.setJSON(cacheKey, detail, 1800);
        res.json({ success: true, data: detail });
    } catch (error) {
        logger.error('Error in getProductDetail:', error);
        next(error);
    }
};

// Category-wise sales
exports.getCategorySales = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `category_sales:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const categorySales = await Catalog.aggregate([
            { $match: { companyId } },
            { $group: { _id: '$categoryId', productCount: { $sum: 1 }, avgPrice: { $avg: '$price' } } },
            { $sort: { productCount: -1 } }
        ]);

        await cache.setJSON(cacheKey, categorySales, 3600);
        res.json({ success: true, data: categorySales });
    } catch (error) {
        logger.error('Error in getCategorySales:', error);
        next(error);
    }
};

// Get analytics for a specific category
exports.getCategoryAnalytics = async (req, res, next) => {
    try {
        const { category } = req.params;
        const { companyId } = req.query;

        if (!companyId || !category) {
            return res.status(400).json({ success: false, message: 'companyId and category required' });
        }

        const cacheKey = `category_analytics:${companyId}:${category}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const products = await Catalog.find({ companyId, categoryId: category }).lean();
        const orders = await Order.find({
            companyId,
            'items.productId': { $in: products.map(p => p.productId) }
        }).lean();

        const productCount = products.length;
        const avgPrice = products.length > 0 ? products.reduce((sum, p) => sum + (p.price || 0), 0) / productCount : 0;
        const totalRevenue = orders.reduce((sum, o) => {
            return sum + o.items
                .filter(i => products.some(p => p.productId === i.productId))
                .reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0);
        }, 0);

        const analytics = {
            category,
            productCount,
            avgPrice,
            totalRevenue,
            products
        };

        await cache.setJSON(cacheKey, analytics, 3600);
        res.json({ success: true, data: analytics });
    } catch (error) {
        logger.error('Error in getCategoryAnalytics:', error);
        next(error);
    }
};

// Order status distribution
exports.getOrderStatusDistribution = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `order_status:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const statusDistribution = await Order.aggregate([
            { $match: { companyId, isDeleted: false } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        await cache.setJSON(cacheKey, statusDistribution, 1800);
        res.json({ success: true, data: statusDistribution });
    } catch (error) {
        logger.error('Error in getOrderStatusDistribution:', error);
        next(error);
    }
};

// Revenue trends (time-series)
exports.getRevenueTrends = async (req, res, next) => {
    try {
        const { companyId, days = 30 } = req.query;
        const cacheKey = `revenue_trends:${companyId}:${days}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const trends = await Order.aggregate([
            { $match: { companyId, isDeleted: false, createdAt: { $gte: startDate } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        await cache.setJSON(cacheKey, trends, 3600);
        res.json({ success: true, data: trends });
    } catch (error) {
        logger.error('Error in getRevenueTrends:', error);
        next(error);
    }
};

module.exports = exports;
