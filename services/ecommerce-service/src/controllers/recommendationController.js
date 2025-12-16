const recommendationService = require('../services/recommendationService');
const logger = require('../utils/logger');
const { paginationSchema } = require('../utils/app');

exports.getRecommendations = async (req, res, next) => {
    try {
        const { type = 'personalized', productId, limit } = req.query;

        const { error, value } = paginationSchema.validate({ limit }, { stripUnknown: true });
        if (error) return res.status(400).json({ success: false, message: error.details.map(d => d.message).join(', ') });
        const validatedLimit = value.limit;

        const userId = req.user?.userId;
        const companyId = req.user?.companyId || req.query.companyId;
        let productIds = [];
        switch (type) {
            case 'personalized':
                if (userId) {
                    productIds = await recommendationService.getPersonalizedRecommendations(userId, companyId, validatedLimit);
                } else {
                    productIds = await recommendationService.getTrendingProducts(companyId, validatedLimit);
                }
                break;
            case 'trending':
                productIds = await recommendationService.getTrendingProducts(companyId, validatedLimit);
                break;
            case 'similar':
                if (!productId) {
                    return res.status(400).json({ success: false, message: 'Product ID is required for similar recommendations' });
                }
                productIds = await recommendationService.getContentBasedRecommendations(productId, companyId, validatedLimit);
                break;
            case 'frequently_bought':
                if (!productId) {
                    return res.status(400).json({ success: false, message: 'Product ID is required for frequently bought together' });
                }
                productIds = await recommendationService.getFrequentlyBoughtTogether(productId, companyId, validatedLimit);
                break;
            case 'new_arrivals':
                productIds = await recommendationService.getNewArrivals(companyId, validatedLimit);
                break;
            case 'best_sellers':
                productIds = await recommendationService.getBestSellers(companyId, validatedLimit);
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid recommendation type' });
        }
        res.json({ success: true, data: { productIds, type } });
    } catch (error) {
        logger.error('Error in getRecommendations:', error);
        next(error);
    }
};

exports.getRecentlyViewed = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 10;
        const recentViews = await recommendationService.getRecentlyViewed(userId, limit);
        res.json({ success: true, data: { recentViews } });
    } catch (error) {
        logger.error('Error in getRecentlyViewed:', error);
        next(error);
    }
};
