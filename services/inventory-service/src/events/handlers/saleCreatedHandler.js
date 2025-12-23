const ProductStock = require('../../models/ProductStock');
const StockChange = require('../../models/StockChange');
const redisHelper = require('../../utils/redisHelper');
const logger = require('../../utils/logger');
const mongoose = require('mongoose');

/**
 * Handle sale.created events from Sales Service
 * 1. Decrement reserved/stock quantity
 * 2. Record StockChange (type: sale) with price/cost metadata
 * 3. Invalidate caches
 */
const saleCreatedHandler = async (event) => {
    const { saleId, companyId, shopId, items, soldBy, createdAt } = event;

    logger.info(`Processing sale.created for sale ${saleId} with ${items.length} items`);

    try {
        for (const item of items) {
            const { productId, quantity, unitPrice, costPrice, productName } = item;

            // 1. Decrement Stock
            // Note: If previously reserved (e.g. at cart stage), we might need to decrement reservedQty instead.
            // For now, assuming direct decrement from stockQty for simplicity or that reservation logic is handled elsewhere.
            // If we want robust reservation handling, we'd check if a reservation exists.

            const stock = await ProductStock.findOne({ productId });
            if (!stock) {
                logger.warn(`ProductStock not found for product ${productId} during sale processing`);
                continue;
            }

            // Update stock levels
            stock.stockQty = Math.max(0, stock.stockQty - quantity);
            stock.totalUnitsSold = (stock.totalUnitsSold || 0) + quantity;
            stock.totalRevenue = (stock.totalRevenue || 0) + (quantity * (unitPrice || 0));
            stock.lastRestockDate = new Date(); // Updates modifiedAt effectively

            // Check low stock status
            stock.isLowStock = stock.stockQty <= stock.lowStockThreshold;

            await stock.save();

            // 2. Create StockChange Record
            await StockChange.create({
                companyId,
                shopId,
                productId,
                type: 'sale',
                qty: -Math.abs(quantity), // Negative for outbound
                previous: stock.stockQty + quantity,
                new: stock.stockQty,
                reason: `Sale #${saleId}`,
                userId: soldBy || 'system',
                meta: {
                    saleId,
                    unitPrice,
                    unitCost: costPrice,
                    productName
                },
                createdAt: createdAt || new Date()
            });

            // 3. Invalidate Caches
            // Invalidate product specific cache
            await redisHelper.delCache(`analytics:product:${productId}`);
        }

        // Invalidate broader caches
        // We use scanDel to clear related keys
        await redisHelper.scanDel(`inventory:analytics:overview:${companyId}:*`);
        await redisHelper.scanDel(`analytics:company:${companyId}:*`);
        if (shopId) {
            await redisHelper.scanDel(`analytics:shop:${shopId}:*`);
        }
        await redisHelper.scanDel(`analytics:graph:*:${companyId}:*`);

        logger.info(`Successfully processed sale.created for sale ${saleId}`);

    } catch (error) {
        logger.error(`Error processing sale.created event for sale ${saleId}:`, error);
        throw error; // Let RabbitMQ retry or DLQ
    }
};

module.exports = saleCreatedHandler;
