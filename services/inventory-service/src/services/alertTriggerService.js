/**
 * Alert Trigger Service
 * Handles automatic alert generation for all system events
 * Supports: Company-level, Shop-level, and Global alerts
 */

const Alert = require('../models/Alert');
const Product = require('../models/Product');
const StockChange = require('../models/StockChange');
const Category = require('../models/Category');
const logger = require('../utils/logger');

class AlertTriggerService {
    /**
     * Trigger alert for new product arrival (Global)
     * Visible to all users across all companies
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
                    price: pricing.basePrice,
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
            const { _id, name, inventory } = productData;
            const lowStockThreshold = inventory.lowStockThreshold || 10;

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
                description: `Stock for ${name} is below threshold (${inventory.quantity}/${lowStockThreshold})`,
                data: {
                    productId: _id.toString(),
                    productName: name,
                    currentStock: inventory.quantity,
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
     * Trigger alert for out of stock (Company/Shop level)
     */
    static async triggerOutOfStockAlert(productData, companyId, shopId = null) {
        try {
            const { _id, name } = productData;

            const scope = shopId ? 'shop' : 'company';

            const alert = await Alert.createOrUpdate({
                scope,
                companyId,
                shopId,
                type: 'out_of_stock',
                productId: _id,
                priority: 'critical',
                message: `🚨 Out of Stock: ${name}`,
                description: `${name} is currently out of stock`,
                data: {
                    productId: _id.toString(),
                    productName: name,
                    timestamp: new Date()
                }
            });

            logger.warn(`Out of stock alert created/updated for product: ${name}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger out of stock alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger alert for price changes (Company/Shop level)
     */
    static async triggerPriceChangeAlert(productData, oldPrice, newPrice, companyId, shopId = null) {
        try {
            const { _id, name } = productData;

            const scope = shopId ? 'shop' : 'company';
            const priceChange = newPrice - oldPrice;
            const priceChangePercent = ((priceChange / oldPrice) * 100).toFixed(2);

            const alert = await Alert.createOrUpdate({
                scope,
                companyId,
                shopId,
                type: 'price_change',
                productId: _id,
                priority: priceChange > 0 ? 'medium' : 'low',
                message: `💰 Price Change: ${name}`,
                description: `Price updated from $${oldPrice} to $${newPrice} (${priceChangePercent}%)`,
                data: {
                    productId: _id.toString(),
                    productName: name,
                    oldPrice,
                    newPrice,
                    changeAmount: priceChange,
                    changePercent: parseFloat(priceChangePercent)
                }
            });

            logger.info(`Price change alert created/updated for product: ${name}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger price change alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger alert for inventory adjustments (Company/Shop level)
     */
    static async triggerInventoryAdjustmentAlert(productData, adjustment, reason, companyId, shopId = null) {
        try {
            const { _id, name, inventory } = productData;

            const scope = shopId ? 'shop' : 'company';
            const adjustmentType = adjustment > 0 ? 'addition' : 'deduction';
            const priority = Math.abs(adjustment) > 50 ? 'high' : 'medium';

            const alert = await Alert.createOrUpdate({
                scope,
                companyId,
                shopId,
                type: 'inventory_adjustment',
                productId: _id,
                priority,
                message: `📦 Inventory Adjustment: ${name}`,
                description: `${adjustmentType === 'addition' ? 'Added' : 'Removed'} ${Math.abs(adjustment)} units. Reason: ${reason}`,
                data: {
                    productId: _id.toString(),
                    productName: name,
                    adjustment,
                    reason,
                    newStock: inventory.quantity,
                    timestamp: new Date()
                }
            });

            logger.info(`Inventory adjustment alert created/updated for product: ${name}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger inventory adjustment alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger alert for stock received (Company/Shop level)
     */
    static async triggerStockReceivedAlert(productData, quantityReceived, companyId, shopId = null) {
        try {
            const { _id, name } = productData;

            const scope = shopId ? 'shop' : 'company';

            const alert = await Alert.createOrUpdate({
                scope,
                companyId,
                shopId,
                type: 'stock_received',
                productId: _id,
                priority: 'medium',
                message: `📥 Stock Received: ${name}`,
                description: `${quantityReceived} units of ${name} have been received`,
                data: {
                    productId: _id.toString(),
                    productName: name,
                    quantityReceived,
                    timestamp: new Date()
                }
            });

            logger.info(`Stock received alert created/updated for product: ${name}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger stock received alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger alert for order creation (Company/Shop level)
     */
    static async triggerOrderCreatedAlert(orderData, companyId, shopId = null) {
        try {
            const { orderId, totalItems, totalAmount, customerInfo } = orderData;

            const scope = shopId ? 'shop' : 'company';

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'order_created',
                orderId: orderId?.toString(),
                priority: 'medium',
                message: `📋 New Order: #${orderId}`,
                description: `Order placed with ${totalItems} items for ${customerInfo?.name || 'Unknown'} - $${totalAmount}`,
                data: {
                    orderId: orderId?.toString(),
                    totalItems,
                    totalAmount,
                    customerInfo,
                    timestamp: new Date()
                }
            });

            logger.info(`Order creation alert created for order: ${orderId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger order created alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger alert for order shipment (Company/Shop level)
     */
    static async triggerOrderShippedAlert(orderData, trackingInfo, companyId, shopId = null) {
        try {
            const { orderId, customerInfo } = orderData;

            const scope = shopId ? 'shop' : 'company';

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'order_shipped',
                orderId: orderId?.toString(),
                priority: 'low',
                message: `🚚 Order Shipped: #${orderId}`,
                description: `Order shipped to ${customerInfo?.name || 'Customer'} with tracking #${trackingInfo?.trackingNumber || 'N/A'}`,
                data: {
                    orderId: orderId?.toString(),
                    trackingInfo,
                    customerInfo,
                    timestamp: new Date()
                }
            });

            logger.info(`Order shipped alert created for order: ${orderId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger order shipped alert: ${error.message}`);
            throw error;
        }
    }

    /**
     * Trigger alert for order delivery (Company/Shop level)
     */
    static async triggerOrderDeliveredAlert(orderData, companyId, shopId = null) {
        try {
            const { orderId, customerInfo, deliveryDate } = orderData;

            const scope = shopId ? 'shop' : 'company';

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'order_delivered',
                orderId: orderId?.toString(),
                priority: 'low',
                message: `✅ Order Delivered: #${orderId}`,
                description: `Order delivered to ${customerInfo?.name || 'Customer'} on ${deliveryDate}`,
                data: {
                    orderId: orderId?.toString(),
                    customerInfo,
                    deliveryDate,
                    timestamp: new Date()
                }
            });

            logger.info(`Order delivered alert created for order: ${orderId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to trigger order delivered alert: ${error.message}`);
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
            const matchQuery = { companyId, changeDate: { $gte: today, $lt: tomorrow } };

            if (shopId) {
                matchQuery.shopId = shopId;
            }

            const sales = await StockChange.aggregate([
                { $match: { ...matchQuery, changeType: 'sale' } },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: null,
                        totalUnits: { $sum: { $abs: '$quantity' } },
                        totalRevenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } },
                        transactionCount: { $sum: 1 }
                    }
                }
            ]);

            const stats = sales[0] || { totalUnits: 0, totalRevenue: 0, transactionCount: 0 };

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'daily_summary',
                priority: 'low',
                message: `📊 Daily Summary`,
                description: `${stats.totalUnits} units sold, $${stats.totalRevenue.toFixed(2)} revenue`,
                data: {
                    date: today,
                    ...stats
                }
            });

            logger.info(`Daily summary alert generated for ${scope} ${shopId || companyId}`);
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
            const matchQuery = { companyId, changeDate: { $gte: lastWeek } };

            if (shopId) {
                matchQuery.shopId = shopId;
            }

            const sales = await StockChange.aggregate([
                { $match: { ...matchQuery, changeType: 'sale' } },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: null,
                        totalUnits: { $sum: { $abs: '$quantity' } },
                        totalRevenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } },
                        transactionCount: { $sum: 1 }
                    }
                }
            ]);

            const stats = sales[0] || { totalUnits: 0, totalRevenue: 0, transactionCount: 0 };

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'weekly_summary',
                priority: 'medium',
                message: `📈 Weekly Summary`,
                description: `${stats.totalUnits} units sold, $${stats.totalRevenue.toFixed(2)} revenue`,
                data: {
                    startDate: lastWeek,
                    endDate: today,
                    ...stats
                }
            });

            logger.info(`Weekly summary alert generated for ${scope} ${shopId || companyId}`);
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
            const matchQuery = { companyId, changeDate: { $gte: lastMonth } };

            if (shopId) {
                matchQuery.shopId = shopId;
            }

            const sales = await StockChange.aggregate([
                { $match: { ...matchQuery, changeType: 'sale' } },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: null,
                        totalUnits: { $sum: { $abs: '$quantity' } },
                        totalRevenue: { $sum: { $multiply: [{ $abs: '$quantity' }, '$product.pricing.basePrice'] } },
                        transactionCount: { $sum: 1 }
                    }
                }
            ]);

            const stats = sales[0] || { totalUnits: 0, totalRevenue: 0, transactionCount: 0 };

            const alert = await Alert.create({
                scope,
                companyId,
                shopId,
                type: 'monthly_summary',
                priority: 'high',
                message: `📅 Monthly Summary`,
                description: `${stats.totalUnits} units sold, $${stats.totalRevenue.toFixed(2)} revenue`,
                data: {
                    startDate: lastMonth,
                    endDate: today,
                    ...stats
                }
            });

            logger.info(`Monthly summary alert generated for ${scope} ${shopId || companyId}`);
            return alert;
        } catch (error) {
            logger.error(`Failed to generate monthly summary: ${error.message}`);
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
            const matchQuery = { companyId, changeType: 'sale', changeDate: { $gte: sevenDaysAgo } };

            if (shopId) {
                matchQuery.shopId = shopId;
            }

            // 1. High Velocity Check
            const velocity = await StockChange.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: '$productId',
                        unitsSold: { $sum: { $abs: '$quantity' } }
                    }
                },
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

            // 2. Dead Stock Check
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const products = await Product.find({
                companyId,
                'inventory.quantity': { $gt: 0 },
                ...(shopId && { shopId })
            });

            for (const product of products) {
                const lastSale = await StockChange.findOne({
                    companyId,
                    productId: product._id,
                    changeType: 'sale',
                    changeDate: { $gte: thirtyDaysAgo },
                    ...(shopId && { shopId })
                });

                if (!lastSale) {
                    const alert = await Alert.createOrUpdate({
                        scope,
                        companyId,
                        shopId,
                        type: 'dead_stock',
                        productId: product._id,
                        priority: 'low',
                        message: `💤 Dead Stock: ${product.name}`,
                        description: `No sales in 30 days`,
                        data: {
                            lastSaleCheck: thirtyDaysAgo,
                            currentStock: product.inventory.quantity
                        }
                    });

                    if (alert) alertsGenerated.push(alert);
                }
            }

            // 3. Stock Out Prediction
            for (const item of velocity) {
                const dailyVelocity = item.unitsSold / 7;
                const product = await Product.findById(item._id);

                if (product && product.inventory.quantity > 0) {
                    const daysLeft = product.inventory.quantity / dailyVelocity;

                    if (daysLeft < 7) {
                        const alert = await Alert.createOrUpdate({
                            scope,
                            companyId,
                            shopId,
                            type: 'stock_out_prediction',
                            productId: product._id,
                            priority: 'high',
                            message: `⏰ Stock Out in ${Math.ceil(daysLeft)} days: ${product.name}`,
                            description: `Will run out of stock in ~${Math.ceil(daysLeft)} days`,
                            data: {
                                currentStock: product.inventory.quantity,
                                dailyVelocity: dailyVelocity.toFixed(2),
                                predictedDaysLeft: Math.ceil(daysLeft)
                            }
                        });

                        if (alert) alertsGenerated.push(alert);
                    }
                }
            }

            logger.info(`Smart checks completed. Generated ${alertsGenerated.length} alerts for ${scope} ${shopId || companyId}`);
            return alertsGenerated;
        } catch (error) {
            logger.error(`Failed to run smart checks: ${error.message}`);
            throw error;
        }
    }
}

module.exports = AlertTriggerService;
