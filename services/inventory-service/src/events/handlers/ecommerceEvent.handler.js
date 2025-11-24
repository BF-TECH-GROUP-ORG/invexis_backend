/**
 * Ecommerce Event Handler
 * Handles inventory-related events from ecommerce-service
 * Manages stock updates when orders are created, updated, cancelled, or cart checked out
 */

const Product = require('../../models/Product');
const { logger } = require('../../utils/logger');
const { publishProductEvent } = require('../productEvents');

async function handleOrderCreated(data) {
    const { orderId, items } = data;
    logger.info(`🛒 [ecommerce.order.created] Received for order ${orderId}`);
    for (const item of items) {
        const { productId, quantity } = item;
        const product = await Product.findById(productId);
        if (!product) {
            logger.warn(`⚠️ Product not found: ${productId}`);
            continue;
        }
        const oldQuantity = product.inventory.quantity;
        product.inventory.quantity = Math.max(0, oldQuantity - quantity);
        await product.save();
        logger.info(`➖ Decremented stock for product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`);
        // Emit inventory.product.updated event
        await publishProductEvent('inventory.product.updated', product.toObject());
    }
}

async function handleOrderUpdated(data) {
    const { orderId, items, status } = data;
    logger.info(`🛒 [ecommerce.order.updated] Received for order ${orderId} (status: ${status})`);
    // Implement logic as needed (e.g., adjust stock if items/quantities changed)
    for (const item of items) {
        const { productId, quantity } = item;
        // Example: just log for now
        logger.info(`ℹ️ Would update stock for product ${productId} by quantity ${quantity}`);
    }
}

async function handleOrderCancelled(data) {
    const { orderId, items, status } = data;
    logger.info(`🛒 [ecommerce.order.cancelled] Received for order ${orderId} (status: ${status})`);
    for (const item of items) {
        const { productId, quantity } = item;
        const product = await Product.findById(productId);
        if (!product) {
            logger.warn(`⚠️ Product not found: ${productId}`);
            continue;
        }
        const oldQuantity = product.inventory.quantity;
        product.inventory.quantity = oldQuantity + quantity;
        await product.save();
        logger.info(`➕ Incremented stock for product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`);
        // Emit inventory.product.updated event
        await publishProductEvent('inventory.product.updated', product.toObject());
    }
}

async function handleCartCheckedOut(data) {
    const { cartId, items } = data;
    logger.info(`🛒 [ecommerce.cart.checked_out] Received for cart ${cartId}`);
    for (const item of items) {
        const { productId, quantity } = item;
        const product = await Product.findById(productId);
        if (!product) {
            logger.warn(`⚠️ Product not found: ${productId}`);
            continue;
        }
        logger.info(`✅ Validated stock for product ${productId}: requested ${quantity}, available ${product.inventory.quantity}`);
        // Emit inventory.product.updated event (optional, for catalog sync)
        await publishProductEvent('inventory.product.updated', product.toObject());
    }
}

module.exports = async function handleEcommerceEvent(event) {
    try {
        const { type, data } = event;
        logger.info(`🛒 Processing ecommerce event: ${type}`);
        switch (type) {
            case 'ecommerce.order.created':
                await handleOrderCreated(data);
                break;
            case 'ecommerce.order.updated':
                await handleOrderUpdated(data);
                break;
            case 'ecommerce.order.cancelled':
                await handleOrderCancelled(data);
                break;
            case 'ecommerce.cart.checked_out':
                await handleCartCheckedOut(data);
                break;
            default:
                logger.warn(`⚠️ Unhandled ecommerce event type: ${type}`);
        }
    } catch (error) {
        logger.error(`❌ Error handling ecommerce event: ${error.message}`);
        throw error;
    }
};
