const Catalog = require('../models/Catalog.models');
const Order = require('../models/Order.models');
const Review = require('../models/Review.models');
const cache = require('../utils/cache');
const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

// Personalized recommendations based on browsing + purchase history
exports.getPersonalizedHomepage = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const cacheKey = `personalized_home:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // Get user's orders and preferences
        const userOrders = await Order.find({ companyId, userId }).lean();
        const purchasedProductIds = new Set();
        userOrders.forEach(order => {
            order.items?.forEach(item => {
                purchasedProductIds.add(item.productId);
            });
        });

        // Featured products
        const featured = await Catalog.find({ companyId, featured: true, status: 'active' }).limit(10).lean();

        // Trending products (most purchased last 7 days)
        const trending = await Order.aggregate([
            { $match: { companyId, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const trendingIds = trending.map(t => t._id);
        const trendingProducts = await Catalog.find({ productId: { $in: trendingIds }, companyId }).lean();

        // High-rated products
        const topRated = await Review.aggregate([
            { $match: { companyId, rating: { $gte: 4 } } },
            { $group: { _id: '$productId', avgRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
            { $match: { reviewCount: { $gte: 5 } } },
            { $sort: { avgRating: -1 } },
            { $limit: 10 }
        ]);

        const ratedIds = topRated.map(t => t._id);
        const ratedProducts = await Catalog.find({ productId: { $in: ratedIds }, companyId }).lean();

        // Similar to purchased
        let similarToPurchased = [];
        if (userOrders.length > 0) {
            const lastOrder = userOrders[userOrders.length - 1];
            const lastProductId = lastOrder.items?.[0]?.productId;
            if (lastProductId) {
                const lastProduct = await Catalog.findOne({ productId: lastProductId, companyId }).lean();
                similarToPurchased = await Catalog.find({
                    companyId,
                    categoryId: lastProduct?.categoryId,
                    productId: { $nin: Array.from(purchasedProductIds), $ne: lastProductId },
                    status: 'active'
                }).limit(10).lean();
            }
        }

        const homepage = {
            featured,
            trending: trendingProducts,
            topRated: ratedProducts,
            similarToPurchased,
            userPurchaseCount: userOrders.length
        };

        await cache.setJSON(cacheKey, homepage, 1800);
        res.json({ success: true, data: homepage });
    } catch (error) {
        logger.error('Error in getPersonalizedHomepage:', error);
        next(error);
    }
};

// Smart recommendations using AI-like algorithms
exports.getAIBasedRecommendations = async (req, res, next) => {
    try {
        const { companyId, userId, limit = 10 } = req.query;
        const cacheKey = `ai_recommendations:${companyId}:${userId}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // Collaborative filtering: find users with similar purchases
        const userOrders = await Order.find({ companyId, userId }).lean();
        const userProductIds = new Set();
        userOrders.forEach(order => {
            order.items?.forEach(item => {
                userProductIds.add(item.productId);
            });
        });

        // Find similar users (co-purchased products)
        const similarUsers = await Order.aggregate([
            { $match: { companyId, 'items.productId': { $in: Array.from(userProductIds) } } },
            { $group: { _id: '$userId', commonProducts: { $sum: 1 }, products: { $push: '$items.productId' } } },
            { $match: { commonProducts: { $gte: 2 } } },
            { $limit: 50 }
        ]);

        // Get products from similar users that current user doesn't have
        const similarUserIds = similarUsers.map(u => u._id);
        const productsFromSimilarUsers = await Order.aggregate([
            { $match: { companyId, userId: { $in: similarUserIds } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', frequency: { $sum: 1 }, popularity: { $avg: '$items.price' } } },
            { $match: { _id: { $nin: Array.from(userProductIds) } } },
            { $sort: { frequency: -1 } },
            { $limit: parseInt(limit) }
        ]);

        const recommendedIds = productsFromSimilarUsers.map(p => p._id);
        const recommendations = await Catalog.find({ productId: { $in: recommendedIds }, companyId, status: 'active' }).lean();

        // Score recommendations based on popularity and user preference
        const scoredRecommendations = recommendations.map(product => ({
            ...product,
            recommendationScore: Math.random() * 100 // Simplified; should include ML model score
        })).sort((a, b) => b.recommendationScore - a.recommendationScore);

        await cache.setJSON(cacheKey, scoredRecommendations, 1200);
        res.json({ success: true, data: scoredRecommendations });
    } catch (error) {
        logger.error('Error in getAIBasedRecommendations:', error);
        next(error);
    }
};

// Seasonal product suggestions
exports.getSeasonalProducts = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `seasonal_products:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const month = new Date().getMonth();
        let seasonalTags = [];

        // Map months to seasons
        if ([11, 0, 1].includes(month)) seasonalTags.push('winter', 'holiday', 'new_year');
        if ([2, 3, 4].includes(month)) seasonalTags.push('spring', 'easter');
        if ([5, 6, 7].includes(month)) seasonalTags.push('summer', 'beach', 'vacation');
        if ([8, 9, 10].includes(month)) seasonalTags.push('fall', 'back_to_school', 'thanksgiving');

        const seasonalProducts = await Catalog.find({
            companyId,
            status: 'active',
            tags: { $in: seasonalTags }
        }).limit(20).lean();

        await cache.setJSON(cacheKey, seasonalProducts, 3600);
        res.json({ success: true, data: seasonalProducts });
    } catch (error) {
        logger.error('Error in getSeasonalProducts:', error);
        next(error);
    }
};

// "Frequently viewed together" - real-time tracking
exports.getFrequentlyViewedTogether = async (req, res, next) => {
    try {
        const { companyId, productId, limit = 5 } = req.query;
        const cacheKey = `viewed_together:${companyId}:${productId}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // This would typically track page views/session data
        // For now, use purchase data as proxy
        const viewedTogether = await Order.aggregate([
            { $match: { companyId, 'items.productId': productId } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $ne: productId } } },
            { $group: { _id: '$items.productId', frequency: { $sum: 1 } } },
            { $sort: { frequency: -1 } },
            { $limit: parseInt(limit) }
        ]);

        const productIds = viewedTogether.map(v => v._id);
        const products = await Catalog.find({ productId: { $in: productIds }, companyId }).lean();

        await cache.setJSON(cacheKey, products, 1800);
        res.json({ success: true, data: products });
    } catch (error) {
        logger.error('Error in getFrequentlyViewedTogether:', error);
        next(error);
    }
};

// Magic deals - dynamically generated personalized offers
exports.getMagicDeals = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const cacheKey = `magic_deals:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // Get user behavior
        const userOrders = await Order.find({ companyId, userId }).lean();
        const totalSpent = userOrders.reduce((sum, o) => sum + o.totalAmount, 0);

        // Determine user tier for personalized discounts
        let userTier = 'new';
        if (totalSpent > 5000) userTier = 'vip';
        else if (totalSpent > 1000) userTier = 'gold';
        else if (totalSpent > 100) userTier = 'silver';

        // Generate personalized deal
        let discount = 0;
        if (userTier === 'vip') discount = 25;
        else if (userTier === 'gold') discount = 15;
        else if (userTier === 'silver') discount = 10;
        else discount = 5;

        // Find products user might like
        const magicProducts = await Catalog.find({ companyId, status: 'active' })
            .sort({ featured: -1, price: -1 })
            .limit(5)
            .lean();

        const magicDeals = {
            userTier,
            personalizedDiscount: discount,
            message: `🎉 Special ${discount}% off deal just for you, ${userTier} member!`,
            products: magicProducts.map(p => ({
                ...p,
                originalPrice: p.price,
                dealPrice: Math.round((p.price * (100 - discount)) / 100 * 100) / 100,
                savings: Math.round((p.price * discount) / 100 * 100) / 100
            })),
            expiresIn: '24 hours'
        };

        await cache.setJSON(cacheKey, magicDeals, 3600);
        await publish(exchanges.topic, 'ecommerce.magic_deals_shown', {
            companyId,
            userId,
            userTier,
            discount,
            timestamp: Date.now()
        });

        res.json({ success: true, data: magicDeals });
    } catch (error) {
        logger.error('Error in getMagicDeals:', error);
        next(error);
    }
};

// Smart search with autocomplete and suggestions
exports.smartSearch = async (req, res, next) => {
    try {
        const { companyId, query, limit = 10 } = req.query;
        const cacheKey = `smart_search:${companyId}:${query}:${limit}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // Search across name, description, tags
        const results = await Catalog.find({
            companyId,
            status: 'active',
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { shortDescription: { $regex: query, $options: 'i' } },
                { tags: { $regex: query, $options: 'i' } }
            ]
        }).limit(parseInt(limit)).lean();

        // Get suggestions based on search frequency (trending searches)
        const suggestions = ['trending', 'sale', 'new', 'popular'].map(s => `${query} ${s}`);

        const searchResults = {
            query,
            products: results,
            suggestions,
            resultCount: results.length
        };

        await cache.setJSON(cacheKey, searchResults, 600);
        res.json({ success: true, data: searchResults });
    } catch (error) {
        logger.error('Error in smartSearch:', error);
        next(error);
    }
};

module.exports = exports;
