const Order = require('../models/Order.models');
const Catalog = require('../models/Catalog.models');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

// User purchase history
exports.getUserPurchaseHistory = async (req, res, next) => {
    try {
        const { companyId, userId, limit = 20, page = 1 } = req.query;
        const cacheKey = `user_history:${companyId}:${userId}:${page}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const orders = await Order.find({ companyId, userId }).limit(parseInt(limit)).skip(skip).lean();
        const total = await Order.countDocuments({ companyId, userId });

        const data = { orders, pagination: { page: parseInt(page), limit: parseInt(limit), total } };
        await cache.setJSON(cacheKey, data, 1800);
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Error in getUserPurchaseHistory:', error);
        next(error);
    }
};

// User preferences (based on purchases and views)
exports.getUserPreferences = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const cacheKey = `user_preferences:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const orders = await Order.find({ companyId, userId }).lean();
        const categoryPreferences = {};
        const pricePreference = [];

        orders.forEach(order => {
            order.items?.forEach(item => {
                categoryPreferences[item.productId] = (categoryPreferences[item.productId] || 0) + 1;
                pricePreference.push(item.price);
            });
        });

        const avgPrice = pricePreference.length > 0 ? pricePreference.reduce((a, b) => a + b) / pricePreference.length : 0;

        const preferences = {
            favoriteCategories: Object.entries(categoryPreferences).sort((a, b) => b[1] - a[1]).slice(0, 5),
            avgSpendPerOrder: orders.length > 0 ? orders.reduce((sum, o) => sum + o.totalAmount, 0) / orders.length : 0,
            avgPriceRange: avgPrice
        };

        await cache.setJSON(cacheKey, preferences, 1800);
        res.json({ success: true, data: preferences });
    } catch (error) {
        logger.error('Error in getUserPreferences:', error);
        next(error);
    }
};

// Customer segmentation
exports.getCustomerSegmentation = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `customer_segmentation:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const customerStats = await Order.aggregate([
            { $match: { companyId } },
            { $group: { _id: '$userId', totalSpent: { $sum: '$totalAmount' }, orderCount: { $sum: 1 } } },
            {
                $group: {
                    _id: null,
                    vip: { $sum: { $cond: [{ $gte: ['$totalSpent', 1000] }, 1, 0] } },
                    regular: { $sum: { $cond: [{ $and: [{ $gte: ['$totalSpent', 100] }, { $lt: ['$totalSpent', 1000] }] }, 1, 0] } },
                    occasional: { $sum: { $cond: [{ $lt: ['$totalSpent', 100] }, 1, 0] } }
                }
            }
        ]);

        const segmentation = customerStats.length > 0 ? customerStats[0] : { vip: 0, regular: 0, occasional: 0 };

        await cache.setJSON(cacheKey, segmentation, 3600);
        res.json({ success: true, data: segmentation });
    } catch (error) {
        logger.error('Error in getCustomerSegmentation:', error);
        next(error);
    }
};

// Customer lifetime value (CLV)
exports.getCustomerLifetimeValue = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const cacheKey = `clv:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const orders = await Order.find({ companyId, userId }).lean();
        const totalValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
        const avgOrderValue = orders.length > 0 ? totalValue / orders.length : 0;
        const purchaseFrequency = orders.length;

        const clv = {
            totalLifetimeValue: totalValue,
            totalOrders: orders.length,
            avgOrderValue,
            estimatedFutureValue: avgOrderValue * 12 // Estimated annual value
        };

        await cache.setJSON(cacheKey, clv, 3600);
        res.json({ success: true, data: clv });
    } catch (error) {
        logger.error('Error in getCustomerLifetimeValue:', error);
        next(error);
    }
};

// High-value customers
exports.getHighValueCustomers = async (req, res, next) => {
    try {
        const { companyId, limit = 10, minValue = 1000 } = req.query;
        const cacheKey = `high_value:${companyId}:${minValue}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const topCustomers = await Order.aggregate([
            { $match: { companyId } },
            { $group: { _id: '$userId', totalSpent: { $sum: '$totalAmount' }, orderCount: { $sum: 1 } } },
            { $match: { totalSpent: { $gte: parseFloat(minValue) } } },
            { $sort: { totalSpent: -1 } },
            { $limit: parseInt(limit) }
        ]);

        await cache.setJSON(cacheKey, topCustomers, 3600);
        res.json({ success: true, data: topCustomers });
    } catch (error) {
        logger.error('Error in getHighValueCustomers:', error);
        next(error);
    }
};

// Churn analysis (inactive customers)
exports.getInactiveCustomers = async (req, res, next) => {
    try {
        const { companyId, days = 90 } = req.query;
        const cacheKey = `inactive:${companyId}:${days}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const inactiveCustomers = await Order.aggregate([
            { $match: { companyId } },
            { $group: { _id: '$userId', lastOrder: { $max: '$createdAt' } } },
            { $match: { lastOrder: { $lt: cutoffDate } } },
            { $limit: 100 }
        ]);

        await cache.setJSON(cacheKey, inactiveCustomers, 3600);
        res.json({ success: true, data: inactiveCustomers });
    } catch (error) {
        logger.error('Error in getInactiveCustomers:', error);
        next(error);
    }
};

module.exports = exports;
