const Promotion = require('../models/Promotion.models');
const Catalog = require('../models/Catalog.models');
const Order = require('../models/Order.models');
const cache = require('../utils/cache');
const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

// Create a seasonal campaign (Black Friday, Kiku, etc.)
exports.createCampaign = async (req, res, next) => {
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
        logger.error('Error in createCampaign:', error);
        next(error);
    }
};

// Get all active campaigns
exports.listCampaigns = async (req, res, next) => {
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
        logger.error('Error in listCampaigns:', error);
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

// Get campaign details
exports.getCampaignDetail = async (req, res, next) => {
    try {
        const { companyId, campaignId } = req.query;
        const campaign = await Promotion.findById(campaignId).lean();
        if (!campaign || campaign.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        res.json({ success: true, data: campaign });
    } catch (error) {
        logger.error('Error in getCampaignDetail:', error);
        next(error);
    }
};

// Update campaign
exports.updateCampaign = async (req, res, next) => {
    try {
        const { companyId } = req.body;
        const { campaignId } = req.params;
        const campaign = await Promotion.findByIdAndUpdate(campaignId, req.body, { new: true });
        if (!campaign || campaign.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        await cache.del(`campaign:${companyId}:${campaignId}`);
        res.json({ success: true, message: 'Campaign updated', data: campaign });
    } catch (error) {
        logger.error('Error in updateCampaign:', error);
        next(error);
    }
};

// Delete campaign
exports.deleteCampaign = async (req, res, next) => {
    try {
        const { companyId } = req.body;
        const { campaignId } = req.params;
        const campaign = await Promotion.findByIdAndDelete(campaignId);
        if (!campaign || campaign.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        await cache.del(`campaign:${companyId}:${campaignId}`);
        res.json({ success: true, message: 'Campaign deleted' });
    } catch (error) {
        logger.error('Error in deleteCampaign:', error);
        next(error);
    }
};

// List flash sales
exports.listFlashSales = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `flash_sales:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const sales = await Promotion.find({ companyId, type: 'flash_sale' }).lean();
        await cache.setJSON(cacheKey, sales, 300);
        res.json({ success: true, data: sales });
    } catch (error) {
        logger.error('Error in listFlashSales:', error);
        next(error);
    }
};

// Get flash sale details
exports.getFlashSaleDetail = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const { flashSaleId } = req.params;
        const sale = await Promotion.findById(flashSaleId).lean();
        if (!sale || sale.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Flash sale not found' });
        }
        res.json({ success: true, data: sale });
    } catch (error) {
        logger.error('Error in getFlashSaleDetail:', error);
        next(error);
    }
};

// Update flash sale
exports.updateFlashSale = async (req, res, next) => {
    try {
        const { companyId } = req.body;
        const { flashSaleId } = req.params;
        const sale = await Promotion.findByIdAndUpdate(flashSaleId, req.body, { new: true });
        if (!sale || sale.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Flash sale not found' });
        }
        await cache.del(`flash_sale:${companyId}:${flashSaleId}`);
        res.json({ success: true, message: 'Flash sale updated', data: sale });
    } catch (error) {
        logger.error('Error in updateFlashSale:', error);
        next(error);
    }
};

// List seasonal promotions
exports.listSeasonalPromotions = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `seasonal_promos:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const promos = await Promotion.find({ companyId, type: 'seasonal' }).lean();
        await cache.setJSON(cacheKey, promos, 300);
        res.json({ success: true, data: promos });
    } catch (error) {
        logger.error('Error in listSeasonalPromotions:', error);
        next(error);
    }
};

// Create seasonal promotion
exports.createSeasonalPromotion = async (req, res, next) => {
    try {
        const { companyId, name, description, discountType, discountValue, startDate, endDate, productIds } = req.body;
        const promo = await Promotion.create({
            companyId,
            name,
            description,
            type: 'seasonal',
            discountType,
            discountValue,
            productIds,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            status: 'scheduled'
        });
        res.json({ success: true, message: 'Seasonal promotion created', data: promo });
    } catch (error) {
        logger.error('Error in createSeasonalPromotion:', error);
        next(error);
    }
};

// Update seasonal promotion
exports.updateSeasonalPromotion = async (req, res, next) => {
    try {
        const { companyId } = req.body;
        const { seasonalId } = req.params;
        const promo = await Promotion.findByIdAndUpdate(seasonalId, req.body, { new: true });
        if (!promo || promo.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Seasonal promotion not found' });
        }
        await cache.del(`seasonal_promo:${companyId}:${seasonalId}`);
        res.json({ success: true, message: 'Seasonal promotion updated', data: promo });
    } catch (error) {
        logger.error('Error in updateSeasonalPromotion:', error);
        next(error);
    }
};

// Apply promotion to multiple products
exports.applyPromotionBulk = async (req, res, next) => {
    try {
        const { companyId, promotionId, productIds } = req.body;
        const promo = await Promotion.findById(promotionId);
        if (!promo || promo.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Promotion not found' });
        }
        promo.productIds = [...new Set([...promo.productIds, ...productIds])];
        await promo.save();
        res.json({ success: true, message: 'Promotion applied to products', data: promo });
    } catch (error) {
        logger.error('Error in applyPromotionBulk:', error);
        next(error);
    }
};

// Get campaign analytics
exports.getCampaignAnalytics = async (req, res, next) => {
    try {
        const { companyId, campaignId } = req.query;
        const cacheKey = `campaign_analytics:${companyId}:${campaignId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const campaign = await Promotion.findById(campaignId).lean();
        if (!campaign || campaign.companyId !== companyId) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        const ordersWithPromo = await Order.countDocuments({
            companyId,
            'items.promotionId': campaignId
        });

        const analyticsData = {
            campaignId,
            campaignName: campaign.name,
            ordersAffected: ordersWithPromo,
            totalRevenue: 0,
            conversionRate: 0,
            roi: 0
        };

        await cache.setJSON(cacheKey, analyticsData, 3600);
        res.json({ success: true, data: analyticsData });
    } catch (error) {
        logger.error('Error in getCampaignAnalytics:', error);
        next(error);
    }
};

module.exports = exports;
