/**
 * Alert Trigger Service
 * Handles automatic alert generation for all system events
 * Supports: Company-level, Shop-level, and Global alerts
 */

const Alert = require('../models/Alert');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const Category = require('../models/Category');
const ProductStock = require('../models/ProductStock');
const Outbox = require('../models/Outbox');
const producer = require('../events/producer');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

class AlertTriggerService {
    /**
     * Helper to get common analytics stats
     */
    static async getAnalyticsStats(matchQuery) {
        return await StockChange.aggregate([
            {
                $addFields: {
                    qtyNorm: { $ifNull: ['$qty', '$quantity'] },
                    typeNorm: { $ifNull: ['$type', '$changeType'] },
                    createdAtNorm: { $ifNull: ['$createdAt', '$changeDate'] }
                }
            },
            {
                $match: {
                    companyId: matchQuery.companyId,
                    ...(matchQuery.shopId ? { shopId: matchQuery.shopId } : {}),
                    createdAtNorm: matchQuery.createdAt,
                    typeNorm: 'sale'
                }
            },
            { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $lookup: { from: 'productpricings', localField: 'product.pricingId', foreignField: '_id', as: 'pricing' } },
            { $unwind: { path: '$pricing', preserveNullAndEmptyArrays: true } },
            {
                $facet: {
                    stats: [
                        {
                            $group: {
                                _id: null,
                                totalUnits: { $sum: { $abs: '$qtyNorm' } },
                                totalRevenue: { $sum: { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitPrice', { $ifNull: ['$pricing.basePrice', 0] }] }] } },
                                totalCost: { $sum: { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$product.costPrice', 0] }] } },
                                transactionCount: { $sum: 1 }
                            }
                        },
                        {
                            $addFields: {
                                grossProfit: { $subtract: ['$totalRevenue', '$totalCost'] },
                                profitMargin: {
                                    $cond: [{ $gt: ['$totalRevenue', 0] }, { $multiply: [{ $divide: [{ $subtract: ['$totalRevenue', '$totalCost'] }, '$totalRevenue'] }, 100] }, 0]
                                }
                            }
                        }
                    ],
                    topProducts: [
                        {
                            $group: {
                                _id: '$productId',
                                name: { $first: '$product.name' },
                                units: { $sum: { $abs: '$qtyNorm' } },
                                revenue: { $sum: { $multiply: [{ $abs: '$qtyNorm' }, { $ifNull: ['$meta.unitPrice', { $ifNull: ['$pricing.basePrice', 0] }] }] } },
                                profit: { $sum: { $multiply: [{ $abs: '$qtyNorm' }, { $subtract: [{ $ifNull: ['$meta.unitPrice', { $ifNull: ['$pricing.basePrice', 0] }] }, { $ifNull: ['$product.costPrice', 0] }] }] } }
                            }
                        },
                        { $sort: { profit: -1 } },
                        { $limit: 3 }
                    ]
                }
            }
        ]);
    }

    /**
     * Helper to get inventory health
     */
    static async getInventoryHealth(companyId, shopId = null) {
        const health = await ProductStock.aggregate([
            { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $match: { 'product.companyId': companyId, ...(shopId ? { 'product.shopId': shopId } : {}) } },
            {
                $group: {
                    _id: null,
                    outOfStock: { $sum: { $cond: [{ $eq: ['$stockQty', 0] }, 1, 0] } },
                    lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$stockQty', 0] }, { $lte: ['$stockQty', '$lowStockThreshold'] }] }, 1, 0] } },
                    totalItems: { $sum: 1 }
                }
            }
        ]);
        return health[0] || { outOfStock: 0, lowStock: 0, totalItems: 0 };
    }

    /**
     * Trigger alert for new product arrival (Global)
     */
    static async triggerNewArrivalAlert(productData) {
        try {
            const { _id, name, categoryId, companyId, shopId, pricing } = productData;

            const alert = await Alert.createOrUpdate({
                scope: 'global',
                companyId: productData.companyId,
                type: 'new_arrival',
                productId: _id,
                categoryId: categoryId,
                priority: 'medium',
                message: `🆕 New Product Arrival: ${name}`,
                description: `A new product has been added to our catalog. Check it out!`,
                data: {
                    productId: _id.toString(),
                    productName: name,
                    price: pricing?.basePrice || 0,
                    categoryId: categoryId
                }
            });

            logger.info(`New arrival alert created for product: ${name}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger new arrival alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger alert for low stock (Company/Shop level)
     */
    static async triggerLowStockAlert(productData, companyId, shopId = null) {
        try {
            const { _id, name } = productData;
            const stockRecord = await ProductStock.findOne({ productId: _id });
            const lowStockThreshold = stockRecord?.lowStockThreshold || 10;
            const currentStock = stockRecord?.stockQty || 0;
            const scope = shopId ? 'shop' : 'company';

            const alert = await Alert.createOrUpdate({
                scope,
                companyId,
                shopId,
                type: 'low_stock',
                productId: _id,
                priority: 'high',
                threshold: lowStockThreshold,
                message: `⚠️ Low Stock Alert: ${name}`,
                description: `Stock for ${name} is below threshold (${currentStock}/${lowStockThreshold})`,
                data: {
                    productId: _id.toString(),
                    productName: name,
                    currentStock,
                    threshold: lowStockThreshold,
                    status: 'critical'
                }
            });

            logger.info(`Low stock alert created/updated for product: ${name} (${scope} scope)`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger low stock alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate daily summary alert (Company level)
     */
    static async generateDailySummary(companyId, shopId = null) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const scope = shopId ? 'shop' : 'company';
            const matchQuery = { companyId, createdAt: { $gte: today, $lt: tomorrow } };

            if (shopId) matchQuery.shopId = shopId;

            const [analytics, health] = await Promise.all([
                this.getAnalyticsStats(matchQuery),
                this.getInventoryHealth(companyId, shopId)
            ]);

            const analysis = analytics[0] || { stats: [{ totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 }], topProducts: [] };
            const stats = analysis.stats[0] || { totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 };
            const topProducts = analysis.topProducts;

            const topPStr = topProducts.map(p => `${p.name} ($${p.profit.toFixed(2)} profit)`).join(', ');

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'daily_summary',
                priority: 'low',
                message: `📊 Daily Business Summary`,
                description: `💰 Profit: $${stats.grossProfit.toFixed(2)} (${stats.profitMargin.toFixed(1)}% Margin) | 📦 Sales: ${stats.totalUnits} units | ⚠️ Health: ${health.lowStock} low / ${health.outOfStock} out`,
                data: {
                    date: today,
                    ...stats,
                    ...health,
                    topProducts: topProducts.map(p => ({ productId: p._id, name: p.name, profit: p.profit }))
                }
            });

            logger.info(`Daily summary generated for ${scope} ${shopId || companyId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to generate daily summary: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate weekly summary alert (Company level)
     */
    static async generateWeeklySummary(companyId, shopId = null) {
        try {
            const today = new Date();
            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);

            const scope = shopId ? 'shop' : 'company';
            const matchQuery = { companyId, createdAt: { $gte: lastWeek } };

            if (shopId) matchQuery.shopId = shopId;

            const [analytics, health] = await Promise.all([
                this.getAnalyticsStats(matchQuery),
                this.getInventoryHealth(companyId, shopId)
            ]);

            const analysis = analytics[0] || { stats: [{ totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 }], topProducts: [] };
            const stats = analysis.stats[0] || { totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 };
            const topProducts = analysis.topProducts;

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'weekly_summary',
                priority: 'medium',
                message: `📈 Weekly Performance Review`,
                description: `💎 Total Profit: $${stats.grossProfit.toFixed(2)} | 🛒 Units Sold: ${stats.totalUnits} | ⭐ Top: ${topProducts[0]?.name || 'N/A'}`,
                data: {
                    startDate: lastWeek,
                    endDate: today,
                    ...stats,
                    ...health,
                    topProducts: topProducts.map(p => ({ productId: p._id, name: p.name, profit: p.profit }))
                }
            });

            logger.info(`Weekly summary generated for ${scope} ${shopId || companyId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to generate weekly summary: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate monthly summary alert (Company level)
     */
    static async generateMonthlySummary(companyId, shopId = null) {
        try {
            const today = new Date();
            const lastMonth = new Date(today);
            lastMonth.setMonth(lastMonth.getMonth() - 1);

            const scope = shopId ? 'shop' : 'company';
            const matchQuery = { companyId, createdAt: { $gte: lastMonth } };

            if (shopId) matchQuery.shopId = shopId;

            const [analytics, health] = await Promise.all([
                this.getAnalyticsStats(matchQuery),
                this.getInventoryHealth(companyId, shopId)
            ]);

            const analysis = analytics[0] || { stats: [{ totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 }], topProducts: [] };
            const stats = analysis.stats[0] || { totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 };
            const topProducts = analysis.topProducts;

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'monthly_summary',
                priority: 'high',
                message: `📅 Monthly Business Snapshot`,
                description: `🚀 Monthly Revenue: $${stats.totalRevenue.toFixed(2)} | 💸 Net Margin: $${stats.grossProfit.toFixed(2)} | 📦 Total Units: ${stats.totalUnits}`,
                data: {
                    startDate: lastMonth,
                    endDate: today,
                    ...stats,
                    ...health,
                    topProducts: topProducts.map(p => ({ productId: p._id, name: p.name, profit: p.profit }))
                }
            });

            logger.info(`Monthly summary generated for ${scope} ${shopId || companyId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to generate monthly summary: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate Yearly summary alert (Company level)
     */
    static async generateYearlySummary(companyId, shopId = null) {
        try {
            const today = new Date();
            const lastYear = new Date(today);
            lastYear.setFullYear(lastYear.getFullYear() - 1);

            const scope = shopId ? 'shop' : 'company';
            const matchQuery = { companyId, createdAt: { $gte: lastYear } };

            if (shopId) matchQuery.shopId = shopId;

            const [analytics, health] = await Promise.all([
                this.getAnalyticsStats(matchQuery),
                this.getInventoryHealth(companyId, shopId)
            ]);

            const analysis = analytics[0] || { stats: [{ totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 }], topProducts: [] };
            const stats = analysis.stats[0] || { totalUnits: 0, totalRevenue: 0, grossProfit: 0, profitMargin: 0 };
            const topProducts = analysis.topProducts;

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'yearly_summary',
                priority: 'high',
                message: `🎆 Annual Business Review`,
                description: `🏆 A Heroic Year: $${stats.totalRevenue.toFixed(2)} Revenue and $${stats.grossProfit.toFixed(2)} Profit! Outstanding growth!`,
                data: {
                    startDate: lastYear,
                    endDate: today,
                    ...stats,
                    ...health,
                    topProducts: topProducts.map(p => ({ productId: p._id, name: p.name, profit: p.profit }))
                }
            });

            logger.info(`Yearly summary generated for ${scope} ${shopId || companyId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to generate yearly summary: ${error.message}`);
            throw error;
        }
    }

    /**
     * Run smart checks: high velocity, dead stock, stock out predictions
     */
    static async runSmartChecks(companyId, shopId = null) {
        try {
            const alertsGenerated = [];
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const scope = shopId ? 'shop' : 'company';
            const matchQuery = { companyId, type: 'sale', createdAt: { $gte: sevenDaysAgo } };
            if (shopId) matchQuery.shopId = shopId;

            const velocity = await StockChange.aggregate([
                {
                    $addFields: {
                        qtyNorm: { $ifNull: ['$qty', '$quantity'] },
                        typeNorm: { $ifNull: ['$type', '$changeType'] },
                        createdAtNorm: { $ifNull: ['$createdAt', '$changeDate'] }
                    }
                },
                {
                    $match: {
                        companyId,
                        ...(shopId ? { shopId } : {}),
                        typeNorm: 'sale',
                        createdAtNorm: { $gte: sevenDaysAgo }
                    }
                },
                { $group: { _id: '$productId', unitsSold: { $sum: { $abs: '$qtyNorm' } } } },
                { $match: { unitsSold: { $gt: 50 } } }
            ]);

            for (const item of velocity) {
                const product = await Product.findById(item._id);
                if (!product) continue;

                const alert = await Alert.createOrUpdate({
                    scope,
                    companyId,
                    shopId,
                    type: 'high_velocity',
                    productId: item._id,
                    priority: 'medium',
                    message: `🔥 High Velocity: ${product.name}`,
                    description: `${item.unitsSold} units sold in 7 days`,
                    data: { unitsSold: item.unitsSold, period: '7 days' }
                });
                if (alert) alertsGenerated.push(alert);
            }

            // Dead stock
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const products = await Product.find({ companyId, ...(shopId && { shopId }), isDeleted: false });

            for (const product of products) {
                const stockRecord = await ProductStock.findOne({ productId: product._id });
                if (!stockRecord || stockRecord.stockQty === 0) continue;

                const lastSale = await StockChange.findOne({
                    companyId,
                    productId: product._id,
                    $or: [{ type: 'sale' }, { changeType: 'sale' }],
                    $or: [
                        { createdAt: { $gte: thirtyDaysAgo } },
                        { changeDate: { $gte: thirtyDaysAgo } }
                    ],
                    ...(shopId && { shopId })
                });

                if (!lastSale) {
                    const alert = await Alert.createOrUpdate({
                        scope, companyId, shopId,
                        type: 'dead_stock', productId: product._id,
                        priority: 'low', message: `💤 Dead Stock: ${product.name}`,
                        description: `No sales in 30 days`,
                        data: { lastSaleCheck: thirtyDaysAgo, currentStock: stockRecord.stockQty }
                    });
                    if (alert) alertsGenerated.push(alert);
                }
            }

            // Predicting Stock out
            for (const item of velocity) {
                const dailyVelocity = item.unitsSold / 7;
                const product = await Product.findById(item._id);
                if (!product) continue;
                const stockRecord = await ProductStock.findOne({ productId: product._id });
                if (!stockRecord || stockRecord.stockQty === 0) continue;

                const daysLeft = stockRecord.stockQty / dailyVelocity;
                if (daysLeft < 7) {
                    const alert = await Alert.createOrUpdate({
                        scope, companyId, shopId,
                        type: 'stock_out_prediction', productId: product._id,
                        priority: 'high',
                        message: `⏰ Stock Out in ${Math.ceil(daysLeft)} days: ${product.name}`,
                        description: `Will run out of stock in ~${Math.ceil(daysLeft)} days`,
                        data: { currentStock: stockRecord.stockQty, dailyVelocity: dailyVelocity.toFixed(2), predictedDaysLeft: Math.ceil(daysLeft) }
                    });
                    if (alert) alertsGenerated.push(alert);
                }
            }

            return alertsGenerated;
        } catch (error) {
            logger.error(`Failed to run smart checks: ${error.message}`);
            throw error;
        }
    }
}

module.exports = AlertTriggerService