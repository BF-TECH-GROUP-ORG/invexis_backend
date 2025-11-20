/**
 * Sales Event Handler
 * Handles inventory-related events from sales-service
 * Manages stock updates when orders are created, cancelled, or returned
 */

const Product = require('../../models/Product');
const { logger } = require('../../utils/logger');

/**
 * Handle order created event - Reduce inventory
 */
async function handleOrderCreated(data) {
  try {
    const { orderId, companyId, items } = data;

    if (!items || !Array.isArray(items)) {
      logger.warn(`⚠️ Invalid items in order created event: ${orderId}`);
      return;
    }

    logger.info(`📦 Processing order created: ${orderId}`);

    for (const item of items) {
      const { productId, quantity } = item;

      const product = await Product.findById(productId);
      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        continue;
      }

      // Reduce inventory
      const oldQuantity = product.inventory.quantity;
      product.inventory.quantity = Math.max(0, oldQuantity - quantity);

      await product.save();

      logger.info(
        `✅ Inventory reduced for product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error handling order created: ${error.message}`);
    throw error;
  }
}

/**
 * Handle order cancelled event - Restore inventory
 */
async function handleOrderCancelled(data) {
  try {
    const { orderId, companyId, items } = data;

    if (!items || !Array.isArray(items)) {
      logger.warn(`⚠️ Invalid items in order cancelled event: ${orderId}`);
      return;
    }

    logger.info(`📦 Processing order cancelled: ${orderId}`);

    for (const item of items) {
      const { productId, quantity } = item;

      const product = await Product.findById(productId);
      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        continue;
      }

      // Restore inventory
      const oldQuantity = product.inventory.quantity;
      product.inventory.quantity = oldQuantity + quantity;

      await product.save();

      logger.info(
        `✅ Inventory restored for product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error handling order cancelled: ${error.message}`);
    throw error;
  }
}

/**
 * Handle return confirmed event - Restore inventory
 */
async function handleReturnConfirmed(data) {
  try {
    const { returnId, companyId, items } = data;

    if (!items || !Array.isArray(items)) {
      logger.warn(`⚠️ Invalid items in return confirmed event: ${returnId}`);
      return;
    }

    logger.info(`📦 Processing return confirmed: ${returnId}`);

    for (const item of items) {
      const { productId, quantity } = item;

      const product = await Product.findById(productId);
      if (!product) {
        logger.warn(`⚠️ Product not found: ${productId}`);
        continue;
      }

      // Restore inventory
      const oldQuantity = product.inventory.quantity;
      product.inventory.quantity = oldQuantity + quantity;

      await product.save();

      logger.info(
        `✅ Inventory restored for returned product ${productId}: ${oldQuantity} → ${product.inventory.quantity}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error handling return confirmed: ${error.message}`);
    throw error;
  }
}

/**
 * Main handler function
 */
module.exports = async function handleSalesEvent(event) {
  try {
    const { type, data } = event;

    logger.info(`💳 Processing sales event: ${type}`);

    switch (type) {
      case 'sales.order.created':
        await handleOrderCreated(data);
        break;

      case 'sales.order.cancelled':
        await handleOrderCancelled(data);
        break;

      case 'sales.return.confirmed':
        await handleReturnConfirmed(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled sales event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling sales event: ${error.message}`);
    throw error;
  }
};

