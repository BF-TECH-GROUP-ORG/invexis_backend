const Promotion = require('../models/Promition.models');
const Catalog = require('../models/Catalog.models');
const Order = require('../models/Order.models');
const cache = require('../utils/cache');
const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

// Create a seasonal campaign (Black Friday, Kiku, etc.)
exports.createSeasonalCampaign = async (req, res, next) => {
    try {
        const { companyId, campaignName, description, campaignType, discountType, discountValue, startDate, endDate, productIds, bannerUrl, targetAudience } = req.body;

        const campaign = await Promotion.create({
            companyId,
            name: campaignName,
            description,
            type: campaignType, // 'black_friday', 'kiku', 'flash_sale', 'seasonal'
            discountType, // 'percentage', 'fixed', 'buy_x_get_y'
            discountValue,
            productIds,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            status: 'scheduled',
            bannerUrl,
            targetAudience, // 'all', 'new_customers', 'vip', 'cart_abandoners'
            metadata: { campaignType }
        });

        // Publish event for other services
        await publish(exchanges.topic, 'ecommerce.promotion.campaign_created', {
            companyId,
            campaignId: campaign._id,
            campaignName,
            campaignType,
            startDate,
            endDate,
            productIds,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Campaign created successfully', data: campaign });
    } catch (error) {
        logger.error('Error in createSeasonalCampaign:', error);
        next(error);
    }
};

// Get all active campaigns
exports.getActiveCampaigns = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `active_campaigns:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const now = new Date();
        const campaigns = await Promotion.find({
            companyId,
            startDate: { $lte: now },
            endDate: { $gte: now },
            status: 'active'
        }).lean();

        await cache.setJSON(cacheKey, campaigns, 300);
        res.json({ success: true, data: campaigns });
    } catch (error) {
        logger.error('Error in getActiveCampaigns:', error);
        next(error);
    }
};

// Apply dynamic pricing based on campaigns and demand
exports.applyDynamicPricing = async (req, res, next) => {
    try {
        const { companyId, productId } = req.query;
        const cacheKey = `dynamic_price:${companyId}:${productId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const product = await Catalog.findOne({ productId, companyId }).lean();
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const now = new Date();
        const activePromotion = await Promotion.findOne({
            companyId,
            productIds: productId,
            startDate: { $lte: now },
            endDate: { $gte: now },
            status: 'active'
        }).lean();

        let finalPrice = product.price;
        let discount = 0;
        let promotionApplied = null;

        if (activePromotion) {
            if (activePromotion.discountType === 'percentage') {
                discount = (product.price * activePromotion.discountValue) / 100;
            } else if (activePromotion.discountType === 'fixed') {
                discount = activePromotion.discountValue;
            }
            finalPrice = Math.max(product.price - discount, 0);
            promotionApplied = activePromotion.name;
        }

        // Apply demand-based pricing (higher demand = higher price, up to 15% markup)
        const orders = await Order.countDocuments({ companyId, 'items.productId': productId, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });
        const demandBoost = Math.min((orders / 100) * 0.15, 0.15);
        finalPrice = finalPrice * (1 + demandBoost);

        const pricingData = {
            originalPrice: product.price,
            discountAmount: discount,
            demandBoost: demandBoost,
            finalPrice: Math.round(finalPrice * 100) / 100,
            promotionApplied,
            savings: Math.round(discount * 100) / 100
        };

        await cache.setJSON(cacheKey, pricingData, 600);
        res.json({ success: true, data: pricingData });
    } catch (error) {
        logger.error('Error in applyDynamicPricing:', error);
        next(error);
    }
};

// Flash sale configuration
exports.createFlashSale = async (req, res, next) => {
    try {
        const { companyId, name, description, productIds, discountPercent, startTime, endTime, limit } = req.body;

        const flashSale = await Promotion.create({
            companyId,
            name,
            description,
            type: 'flash_sale',
            discountType: 'percentage',
            discountValue: discountPercent,
            productIds,
            startDate: new Date(startTime),
            endDate: new Date(endTime),
            status: 'active',
            metadata: {
                isFlashSale: true,
                quantityLimit: limit,
                quantitySold: 0
            }
        });

        await publish(exchanges.topic, 'ecommerce.promotion.flash_sale_created', {
            companyId,
            saleId: flashSale._id,
            name,
            productIds,
            discountPercent,
            startTime,
            endTime,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Flash sale created', data: flashSale });
    } catch (error) {
        logger.error('Error in createFlashSale:', error);
        next(error);
    }
};

// Get flash sale status
exports.getFlashSaleStatus = async (req, res, next) => {
    try {
        const { companyId, saleId } = req.query;
        const cacheKey = `flash_sale:${companyId}:${saleId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const sale = await Promotion.findById(saleId).lean();
        if (!sale || sale.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Sale not found' });
        }

        const now = new Date();
        const status = {
            saleId,
            name: sale.name,
            isActive: now >= sale.startDate && now <= sale.endDate,
            timeRemaining: Math.max(0, sale.endDate - now),
            discountPercent: sale.discountValue,
            quantityLimit: sale.metadata?.quantityLimit,
            quantitySold: sale.metadata?.quantitySold,
            availability: sale.metadata?.quantityLimit - sale.metadata?.quantitySold
        };

        await cache.setJSON(cacheKey, status, 60);
        res.json({ success: true, data: status });
    } catch (error) {
        logger.error('Error in getFlashSaleStatus:', error);
        next(error);
    }
};

// Loyalty program promotion (buy X get Y)
exports.createBuyXGetYPromotion = async (req, res, next) => {
    try {
        const { companyId, name, description, triggerProductId, triggerQuantity, rewardProductId, rewardQuantity, startDate, endDate } = req.body;

        const promotion = await Promotion.create({
            companyId,
            name,
            description,
            type: 'buy_x_get_y',
            discountType: 'buy_x_get_y',
            productIds: [triggerProductId, rewardProductId],
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            status: 'active',
            metadata: {
                triggerProductId,
                triggerQuantity,
                rewardProductId,
                rewardQuantity
            }
        });

        await publish(exchanges.topic, 'ecommerce.promotion.buyXgetY_created', {
            companyId,
            promotionId: promotion._id,
            name,
            triggerProductId,
            rewardProductId,
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Loyalty promotion created', data: promotion });
    } catch (error) {
        logger.error('Error in createBuyXGetYPromotion:', error);
        next(error);
    }
};

// Apply promotion to cart (validation)
exports.validateAndApplyPromotion = async (req, res, next) => {
    try {
        const { companyId, userId, promotionCode, cartItems } = req.body;

        const promotion = await Promotion.findOne({ companyId, code: promotionCode, status: 'active' }).lean();
        if (!promotion) {
            return res.status(400).json({ success: false, message: 'Invalid or expired promotion code' });
        }

        const now = new Date();
        if (now < promotion.startDate || now > promotion.endDate) {
            return res.status(400).json({ success: false, message: 'Promotion is not active' });
        }

        let discount = 0;
        let applicableItems = [];

        cartItems.forEach(item => {
            if (promotion.productIds.includes(item.productId)) {
                applicableItems.push(item);
                if (promotion.discountType === 'percentage') {
                    discount += (item.price * item.quantity * promotion.discountValue) / 100;
                } else if (promotion.discountType === 'fixed') {
                    discount += promotion.discountValue * item.quantity;
                }
            }
        });

        const result = {
            promotionCode,
            promotionName: promotion.name,
            applicableItems: applicableItems.length,
            discountAmount: Math.round(discount * 100) / 100,
            discountPercent: promotion.discountType === 'percentage' ? promotion.discountValue : 0
        };

        await publish(exchanges.topic, 'ecommerce.promotion.applied', {
            companyId,
            userId,
            promotionCode,
            discountAmount: result.discountAmount,
            timestamp: Date.now()
        });

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error in validateAndApplyPromotion:', error);
        next(error);
    }
};

// Get promotion recommendations for user
exports.getPromotionRecommendations = async (req, res, next) => {
    try {
        const { companyId, userId } = req.query;
        const cacheKey = `promo_recommendations:${companyId}:${userId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // Get user's purchase history
        const userOrders = await Order.find({ companyId, userId }).lean();
        const purchasedCategoryIds = new Set();
        userOrders.forEach(order => {
            order.items?.forEach(item => {
                purchasedCategoryIds.add(item.categoryId);
            });
        });

        // Find promotions matching user preferences
        const now = new Date();
        const recommendations = await Promotion.find({
            companyId,
            startDate: { $lte: now },
            endDate: { $gte: now },
            status: 'active'
        }).lean().limit(5);

        const filteredRecommendations = recommendations.map(promo => ({
            promotionId: promo._id,
            name: promo.name,
            description: promo.description,
            discount: promo.discountValue,
            type: promo.type,
            expiresIn: Math.floor((promo.endDate - now) / 1000 / 60) + ' minutes'
        }));

        await cache.setJSON(cacheKey, filteredRecommendations, 600);
        res.json({ success: true, data: filteredRecommendations });
    } catch (error) {
        logger.error('Error in getPromotionRecommendations:', error);
        next(error);
    }
};

module.exports = exports;
