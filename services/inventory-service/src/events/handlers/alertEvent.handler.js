/**
 * Alert Event Handler
 * Handles automatic alert generation for all system events
 * Triggered by product updates, inventory changes, orders, etc.
 */

const AlertTriggerService = require('../../services/alertTriggerService');
const logger = require('../../utils/logger');

/**
 * Handle product created event - Generate new arrival alert
 */
async function handleProductCreated(data) {
    try {
        const { _id, name, companyId, shopId } = data;

        if (!_id || !companyId) {
            logger.warn('⚠️ Invalid product data for alert generation');
            return;
        }

        logger.info(`🆕 Triggering new arrival alert for product: ${name}`);

        // Create global new arrival alert
        await AlertTriggerService.triggerNewArrivalAlert(data);

        logger.info(`✅ New arrival alert created for product: ${name}`);
    } catch (error) {
        logger.error(`❌ Error handling product created event: ${error.message}`);
        throw error;
    }
}

/**
 * Handle product price changed event
 */
async function handleProductPriceChanged(data) {
    try {
        const { _id, name, companyId, shopId, oldPrice, newPrice } = data;

        if (!_id || !companyId || !oldPrice || !newPrice) {
            logger.warn('⚠️ Invalid price change data for alert generation');
            return;
        }

        logger.info(`💰 Triggering price change alert for product: ${name}`);

        await AlertTriggerService.triggerPriceChangeAlert(
            { _id, name },
            oldPrice,
            newPrice,
            companyId,
            shopId || null
        );

        logger.info(`✅ Price change alert created for product: ${name}`);
    } catch (error) {
        logger.error(`❌ Error handling price change event: ${error.message}`);
        throw error;
    }
}

/**
 * Handle product stock changed event
 */
async function handleProductStockChanged(data) {
    try {
        const { _id, name, companyId, shopId, inventory, oldQuantity, newQuantity } = data;

        if (!_id || !companyId || inventory === undefined) {
            logger.warn('⚠️ Invalid stock change data for alert generation');
            return;
        }

        logger.info(`📦 Processing stock change for product: ${name}`);

        // Check for low stock
        const lowStockThreshold = inventory.lowStockThreshold || 10;

        if (newQuantity <= 0 && oldQuantity > 0) {
            // Product just went out of stock
            logger.warn(`🚨 Product out of stock: ${name}`);
            await AlertTriggerService.triggerOutOfStockAlert(
                { _id, name },
                companyId,
                shopId || null
            );
        } else if (newQuantity > 0 && newQuantity <= lowStockThreshold) {
            // Product has low stock
            logger.warn(`⚠️ Product low stock: ${name}`);
            await AlertTriggerService.triggerLowStockAlert(
                { _id, name, inventory },
                companyId,
                shopId || null
            );
        }

        logger.info(`✅ Stock change alert(s) created for product: ${name}`);
    } catch (error) {
        logger.error(`❌ Error handling stock change event: ${error.message}`);
        throw error;
    }
}

/**
 * Handle order created event - Generate order alert
 */
async function handleOrderCreated(data) {
    try {
        const { orderId, companyId, shopId, totalItems, totalAmount, customerInfo } = data;

        if (!orderId || !companyId) {
            logger.warn('⚠️ Invalid order data for alert generation');
            return;
        }

        logger.info(`📋 Triggering order creation alert for order: ${orderId}`);

        await AlertTriggerService.triggerOrderCreatedAlert(
            { orderId, totalItems, totalAmount, customerInfo },
            companyId,
            shopId || null
        );

        logger.info(`✅ Order creation alert created for order: ${orderId}`);
    } catch (error) {
        logger.error(`❌ Error handling order created event: ${error.message}`);
        throw error;
    }
}

/**
 * Handle order shipped event
 */
async function handleOrderShipped(data) {
    try {
        const { orderId, companyId, shopId, trackingInfo, customerInfo } = data;

        if (!orderId || !companyId) {
            logger.warn('⚠️ Invalid order shipment data for alert generation');
            return;
        }

        logger.info(`🚚 Triggering order shipped alert for order: ${orderId}`);

        await AlertTriggerService.triggerOrderShippedAlert(
            { orderId, customerInfo },
            trackingInfo || {},
            companyId,
            shopId || null
        );

        logger.info(`✅ Order shipped alert created for order: ${orderId}`);
    } catch (error) {
        logger.error(`❌ Error handling order shipped event: ${error.message}`);
        throw error;
    }
}

/**
 * Handle order delivered event
 */
async function handleOrderDelivered(data) {
    try {
        const { orderId, companyId, shopId, deliveryDate, customerInfo } = data;

        if (!orderId || !companyId) {
            logger.warn('⚠️ Invalid order delivery data for alert generation');
            return;
        }

        logger.info(`✅ Triggering order delivered alert for order: ${orderId}`);

        await AlertTriggerService.triggerOrderDeliveredAlert(
            { orderId, customerInfo, deliveryDate },
            companyId,
            shopId || null
        );

        logger.info(`✅ Order delivered alert created for order: ${orderId}`);
    } catch (error) {
        logger.error(`❌ Error handling order delivered event: ${error.message}`);
        throw error;
    }
}

/**
 * Handle inventory adjustment event
 */
async function handleInventoryAdjustment(data) {
    try {
        const { _id, name, companyId, shopId, inventory, adjustment, reason } = data;

        if (!_id || !companyId || adjustment === undefined) {
            logger.warn('⚠️ Invalid inventory adjustment data for alert generation');
            return;
        }

        logger.info(`📝 Triggering inventory adjustment alert for product: ${name}`);

        await AlertTriggerService.triggerInventoryAdjustmentAlert(
            { _id, name, inventory },
            adjustment,
            reason || 'Manual adjustment',
            companyId,
            shopId || null
        );

        logger.info(`✅ Inventory adjustment alert created for product: ${name}`);
    } catch (error) {
        logger.error(`❌ Error handling inventory adjustment event: ${error.message}`);
        throw error;
    }
}

/**
 * Handle stock received event
 */
async function handleStockReceived(data) {
    try {
        const { _id, name, companyId, shopId, quantityReceived } = data;

        if (!_id || !companyId || !quantityReceived) {
            logger.warn('⚠️ Invalid stock received data for alert generation');
            return;
        }

        logger.info(`📥 Triggering stock received alert for product: ${name}`);

        await AlertTriggerService.triggerStockReceivedAlert(
            { _id, name },
            quantityReceived,
            companyId,
            shopId || null
        );

        logger.info(`✅ Stock received alert created for product: ${name}`);
    } catch (error) {
        logger.error(`❌ Error handling stock received event: ${error.message}`);
        throw error;
    }
}

/**
 * Main handler dispatcher
 * Routes events to appropriate alert handlers
 */
async function handleAlertEvent(message) {
    try {
        const { eventType, data } = message;

        logger.info(`📨 Processing alert event: ${eventType}`);

        switch (eventType) {
            case 'product.created':
                await handleProductCreated(data);
                break;
            case 'product.price_changed':
                await handleProductPriceChanged(data);
                break;
            case 'product.stock_changed':
                await handleProductStockChanged(data);
                break;
            case 'order.created':
                await handleOrderCreated(data);
                break;
            case 'order.shipped':
                await handleOrderShipped(data);
                break;
            case 'order.delivered':
                await handleOrderDelivered(data);
                break;
            case 'inventory.adjusted':
                await handleInventoryAdjustment(data);
                break;
            case 'stock.received':
                await handleStockReceived(data);
                break;
            default:
                logger.warn(`⚠️ Unknown alert event type: ${eventType}`);
        }
    } catch (error) {
        logger.error(`❌ Error in alert event handler: ${error.message}`);
        throw error;
    }
}

module.exports = {
    handleAlertEvent,
    handleProductCreated,
    handleProductPriceChanged,
    handleProductStockChanged,
    handleOrderCreated,
    handleOrderShipped,
    handleOrderDelivered,
    handleInventoryAdjustment,
    handleStockReceived
};
