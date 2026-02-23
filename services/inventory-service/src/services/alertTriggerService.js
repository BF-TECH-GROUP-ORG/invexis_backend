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

    /**
     * Run checks for product expirations (Expired and Expiring Soon)
     */
    static async checkProductExpirations(companyId, shopId = null) {
        try {
            const alertsGenerated = [];
            const today = new Date();

            // 7 days and 30 days thresholds
            const sevenDaysFromNow = new Date(today);
            sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

            const thirtyDaysFromNow = new Date(today);
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

            const scope = shopId ? 'shop' : 'company';
            const query = {
                companyId,
                isDeleted: false,
                expiryDate: { $ne: null }
            };
            if (shopId) query.shopId = shopId;

            const products = await Product.find(query);

            for (const product of products) {
                const expiry = new Date(product.expiryDate);
                let alertType = null;
                let priority = 'medium';
                let message = '';

                if (expiry <= today) {
                    alertType = 'product_expired';
                    priority = 'critical';
                    message = `🚨 Product Expired: ${product.name}`;
                } else if (expiry <= sevenDaysFromNow) {
                    alertType = 'product_expiring';
                    priority = 'high';
                    message = `⚠️ Expiring in <7 days: ${product.name}`;
                } else if (expiry <= thirtyDaysFromNow) {
                    alertType = 'product_expiring';
                    priority = 'medium';
                    message = `📝 Expiring in <30 days: ${product.name}`;
                }

                if (alertType) {
                    // Deduplication logic: check if unresolved alert exists for this product
                    const existingAlert = await Alert.findOne({
                        companyId,
                        type: alertType,
                        productId: product._id,
                        isResolved: false
                    });

                    if (!existingAlert) {
                        const alert = await Alert.create({
                            scope,
                            companyId,
                            shopId,
                            type: alertType,
                            productId: product._id,
                            priority,
                            message,
                            description: `Product ${product.name} expires on ${expiry.toLocaleDateString()}`,
                            data: {
                                productId: product._id.toString(),
                                productName: product.name,
                                expiryDate: product.expiryDate,
                                daysToExpiry: Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
                            }
                        });
                        alertsGenerated.push(alert);
                    }
                }
            }

            if (alertsGenerated.length > 0) {
                logger.info(`✅ Expiration checks generated ${alertsGenerated.length} alerts for ${scope} ${shopId || companyId}`);
            }
            return alertsGenerated;
        } catch (error) {
            logger.error(`Failed to run product expiration checks: ${error.message}`);
            throw error;
        }
    }

    /**
     * Run Stock Rebalancing analysis (Company level)
     * Identifies shops with excess stock and shops with low stock for the same item
     */
    static async checkStockRebalancing(companyId) {
        try {
            const alertsGenerated = [];

            // 1. Get all products grouped by SKU to find cross-shop matches
            // We only care about products with a SKU and owned by this company
            const skuGroups = await Product.aggregate([
                { $match: { companyId, isDeleted: false, sku: { $ne: null } } },
                { $group: { _id: '$sku', products: { $push: '$$ROOT' } } },
                { $match: { 'products.1': { $exists: true } } } // At least 2 shops must have this item
            ]);

            for (const group of skuGroups) {
                const sku = group._id;
                const shopStocks = [];

                // 2. Fetch current stock for each instance of this SKU
                for (const product of group.products) {
                    const stockRecord = await ProductStock.findOne({ productId: product._id }).lean();
                    if (stockRecord) {
                        shopStocks.push({
                            productId: product._id,
                            shopId: product.shopId,
                            productName: product.name,
                            stockQty: stockRecord.stockQty,
                            threshold: stockRecord.lowStockThreshold || 10
                        });
                    }
                }

                // 3. Identify Low and Excess shops
                const lowShops = shopStocks.filter(s => s.stockQty <= s.threshold);
                const excessShops = shopStocks.filter(s => s.stockQty > (s.threshold * 3));

                // 4. Generate suggestion if a match is found
                if (lowShops.length > 0 && excessShops.length > 0) {
                    for (const target of lowShops) {
                        // Find the shop with the most excess
                        const source = excessShops.sort((a, b) => b.stockQty - a.stockQty)[0];

                        const alertType = 'rebalancing_suggestion';

                        // Deduplication
                        const existingAlert = await Alert.findOne({
                            companyId,
                            type: alertType,
                            productId: target.productId,
                            isResolved: false
                        });

                        if (!existingAlert) {
                            const alert = await Alert.create({
                                scope: 'company', // Admins need to see this
                                companyId,
                                shopId: target.shopId, // Alert belongs to the shop that needs stock
                                type: alertType,
                                productId: target.productId,
                                priority: 'medium',
                                message: `💡 Rebalancing Suggestion: ${target.productName}`,
                                description: `Shop ${target.shopId} is low (${target.stockQty}). Shop ${source.shopId} has excess (${source.stockQty}). Consider an internal transfer.`,
                                data: {
                                    sku,
                                    targetShopId: target.shopId,
                                    sourceShopId: source.shopId,
                                    targetStock: target.stockQty,
                                    sourceStock: source.stockQty,
                                    suggestedTransferQty: Math.ceil(source.stockQty / 2)
                                }
                            });
                            alertsGenerated.push(alert);
                        }
                    }
                }
            }

            if (alertsGenerated.length > 0) {
                logger.info(`✅ Rebalancing analysis generated ${alertsGenerated.length} suggestions for company ${companyId}`);
            }
            return alertsGenerated;
        } catch (error) {
            logger.error(`Failed to run stock rebalancing check: ${error.message}`);
            throw error;
        }
    }
}

module.exports = AlertTriggerService