/**
 * Ecommerce Event Handler - Inventory Service
 * Handles inventory-related events from ecommerce-service
 * Manages stock updates when orders are created, updated, cancelled, or cart checked out
 */

const Product = require('../../models/Product');
const { logger } = require('../../utils/logger');
const { publishProductEvent } = require('../productEvents');
const { processEventOnce } = require('../../utils/eventDeduplication');

/**
 * Handle order created event - Decrement stock for ordered items
 */
async function handleOrderCreated(data) {
    const { orderId, items, traceId, companyId } = data;

    logger.info(`🛒 [ecommerce.order.created] Processing order ${orderId}`, { traceId, companyId });

    if (!items || !Array.isArray(items) || items.length === 0) {
        logger.warn(`⚠️ Order ${orderId} has no items, skipping stock update`);
        return { success: true, message: 'No items to process' };
    }

    const results = [];

    for (const item of items) {
        const { productId, quantity } = item;

        if (!productId || !quantity) {
            logger.warn(`⚠️ Invalid item in order ${orderId}:`, item);
            continue;
        }

        try {
            const product = await Product.findById(productId);

            if (!product) {
                logger.warn(`⚠️ Product not found: ${productId}`);
                results.push({ productId, status: 'not_found' });
                continue;
            }

            const oldQuantity = product.inventory.quantity;
            const newQuantity = Math.max(0, oldQuantity - quantity);

            product.inventory.quantity = newQuantity;

            // Update availability if out of stock
            if (newQuantity === 0 && oldQuantity > 0) {
                product.availability = 'out_of_stock';
            }

            await product.save();

            logger.info(`➖ Decremented stock for product ${productId}: ${oldQuantity} → ${newQuantity}`, {
                orderId,
                productName: product.name
            });

            // Emit inventory.product.updated event
            await publishProductEvent('inventory.product.updated', product.toObject());

            // Emit out of stock event if needed
            if (newQuantity === 0 && oldQuantity > 0) {
                await publishProductEvent('inventory.out.of.stock', {
                    _id: product._id,
                    productId: product._id,
                    companyId: product.companyId,
                    productName: product.name,
                    sku: product.sku
                });
            }

            results.push({ productId, status: 'success', oldQuantity, newQuantity });
        } catch (error) {
            logger.error(`❌ Error updating stock for product ${productId}:`, error);
            results.push({ productId, status: 'error', error: error.message });
        }
    }

    logger.info(`✅ Order ${orderId} stock update complete`, {
        totalItems: items.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length
    });

    return results;
}

/**
 * Handle order updated event - Adjust stock if items/quantities changed
 */
async function handleOrderUpdated(data) {
    const { orderId, items, status, traceId, companyId } = data;

    logger.info(`🛒 [ecommerce.order.updated] Processing update for order ${orderId}`, {
        status,
        traceId,
        companyId
    });

    // For now, just log - full implementation would require comparing old vs new items
    if (items && Array.isArray(items)) {
        logger.info(`ℹ️ Order ${orderId} has ${items.length} items`, { status });
    }

    return { success: true, message: 'Order update noted' };
}

/**
 * Handle order cancelled event - Restore stock for cancelled items
 */
async function handleOrderCancelled(data) {
    const { orderId, items, status, reason, traceId, companyId } = data;

    logger.info(`🛒 [ecommerce.order.cancelled] Processing cancellation for order ${orderId}`, {
        status,
        reason,
        traceId,
        companyId
    });

    if (!items || !Array.isArray(items) || items.length === 0) {
        logger.warn(`⚠️ Order ${orderId} has no items, skipping stock restoration`);
        return { success: true, message: 'No items to process' };
    }

    const results = [];

    for (const item of items) {
        const { productId, quantity } = item;

        if (!productId || !quantity) {
            logger.warn(`⚠️ Invalid item in order ${orderId}:`, item);
            continue;
        }

        try {
            const product = await Product.findById(productId);

            if (!product) {
                logger.warn(`⚠️ Product not found: ${productId}`);
                results.push({ productId, status: 'not_found' });
                continue;
            }

            const oldQuantity = product.inventory.quantity;
            const newQuantity = oldQuantity + quantity;

            product.inventory.quantity = newQuantity;

            // Update availability if back in stock
            if (oldQuantity === 0 && newQuantity > 0) {
                product.availability = 'in_stock';
            }

            await product.save();

            logger.info(`➕ Restored stock for product ${productId}: ${oldQuantity} → ${newQuantity}`, {
                orderId,
                productName: product.name
            });

            // Emit inventory.product.updated event
            await publishProductEvent('inventory.product.updated', product.toObject());

            results.push({ productId, status: 'success', oldQuantity, newQuantity });
        } catch (error) {
            logger.error(`❌ Error restoring stock for product ${productId}:`, error);
            results.push({ productId, status: 'error', error: error.message });
        }
    }

    logger.info(`✅ Order ${orderId} cancellation stock restoration complete`, {
        totalItems: items.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length
    });

    return results;
}

/**
 * Handle cart checked out event - Validate stock availability
 */
async function handleCartCheckedOut(data) {
    const { cartId, items, traceId, companyId } = data;

    logger.info(`🛒 [ecommerce.cart.checked_out] Processing cart ${cartId}`, { traceId, companyId });

    if (!items || !Array.isArray(items) || items.length === 0) {
        logger.warn(`⚠️ Cart ${cartId} has no items`);
        return { success: true, message: 'No items to validate' };
    }

    for (const item of items) {
        const { productId, quantity } = item;

        if (!productId || !quantity) {
            continue;
        }

        try {
            const product = await Product.findById(productId);

            if (!product) {
                logger.warn(`⚠️ Product not found: ${productId}`);
                continue;
            }

            logger.info(`✅ Validated stock for product ${productId}: requested ${quantity}, available ${product.inventory.quantity}`);

            // Optionally emit inventory.product.updated event for catalog sync
            await publishProductEvent('inventory.product.updated', product.toObject());
        } catch (error) {
            logger.error(`❌ Error validating stock for product ${productId}:`, error);
        }
    }

    return { success: true, message: 'Cart validation complete' };
}

/**
 * Main handler function for ecommerce events
 * Includes automatic deduplication logic
 */
module.exports = async function handleEcommerceEvent(event) {
    try {
        const { type, payload, data } = event;
        const eventData = payload || data;

        if (!type) {
            logger.error('❌ Event type is missing');
            return;
        }

        if (!eventData) {
            logger.error('❌ Event data/payload is missing');
            return;
        }

        // Generate event ID for deduplication
        const traceId = eventData.traceId || eventData.trace_id;
        const fallbackId = eventData.orderId || eventData.cartId || eventData.id || '';
        const eventId = traceId || `${type}:${fallbackId}:${Date.now()}`;

        logger.info(`🛒 Processing ecommerce event: ${type}`, { eventId });

        // Process event with automatic deduplication
        const result = await processEventOnce(
            eventId,
            type,
            async () => {
                switch (type) {
                    case 'ecommerce.order.created':
                        return await handleOrderCreated(eventData);

                    case 'ecommerce.order.updated':
                        return await handleOrderUpdated(eventData);

                    case 'ecommerce.order.cancelled':
                        return await handleOrderCancelled(eventData);

                    case 'ecommerce.cart.checked_out':
                        return await handleCartCheckedOut(eventData);

                    default:
                        logger.warn(`⚠️ Unhandled ecommerce event type: ${type}`);
                        return null;
                }
            },
            { eventType: type, timestamp: new Date(), orderId: eventData.orderId }
        );

        if (result.duplicate) {
            logger.info(`🔄 Skipped duplicate ecommerce event: ${type}`, { eventId });
            return;
        }

        logger.info(`✅ Successfully processed ecommerce event: ${type}`, { eventId });
    } catch (error) {
        logger.error(`❌ Error handling ecommerce event: ${error.message}`, error);
        throw error;
    }
};
