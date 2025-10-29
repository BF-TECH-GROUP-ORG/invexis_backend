/**
 * Inventory Event Handler
 * Handles inventory-related events from inventory-service
 * Manages product cache invalidation and stock updates
 */

const redis = require('/app/shared/redis.js');
const { logger } = require('../../utils/app');

/**
 * Handle product created event - Cache product
 */
async function handleProductCreated(data) {
  try {
    const { productId, companyId } = data;

    logger.info(`📦 Processing product created: ${productId}`);

    // Invalidate product list cache
    await redis.del(`products:${companyId}:*`);

    logger.info(`✅ Product cache invalidated for company ${companyId}`);
  } catch (error) {
    logger.error(`❌ Error handling product created: ${error.message}`);
    throw error;
  }
}

/**
 * Handle product updated event - Update product cache
 */
async function handleProductUpdated(data) {
  try {
    const { productId, companyId } = data;

    logger.info(`📦 Processing product updated: ${productId}`);

    // Invalidate product cache
    await redis.del(`product:${companyId}:${productId}`);
    await redis.del(`products:${companyId}:*`);

    // Invalidate related caches
    await redis.del(`cart:${companyId}:*`);
    await redis.del(`wishlist:${companyId}:*`);

    logger.info(`✅ Product and related caches invalidated`);
  } catch (error) {
    logger.error(`❌ Error handling product updated: ${error.message}`);
    throw error;
  }
}

/**
 * Handle product deleted event - Remove product from cache
 */
async function handleProductDeleted(data) {
  try {
    const { productId, companyId } = data;

    logger.info(`📦 Processing product deleted: ${productId}`);

    // Invalidate product cache
    await redis.del(`product:${companyId}:${productId}`);
    await redis.del(`products:${companyId}:*`);

    // Invalidate related caches
    await redis.del(`cart:${companyId}:*`);
    await redis.del(`wishlist:${companyId}:*`);

    logger.info(`✅ Product removed from cache`);
  } catch (error) {
    logger.error(`❌ Error handling product deleted: ${error.message}`);
    throw error;
  }
}

/**
 * Handle stock updated event - Update stock cache
 */
async function handleStockUpdated(data) {
  try {
    const { productId, companyId, newQuantity } = data;

    logger.info(`📦 Processing stock updated: ${productId} → ${newQuantity}`);

    // Invalidate product cache
    await redis.del(`product:${companyId}:${productId}`);

    logger.info(`✅ Stock cache updated`);
  } catch (error) {
    logger.error(`❌ Error handling stock updated: ${error.message}`);
    throw error;
  }
}

/**
 * Handle out of stock event - Mark product unavailable
 */
async function handleOutOfStock(data) {
  try {
    const { productId, companyId, productName } = data;

    logger.info(`📦 Processing out of stock: ${productName}`);

    // Invalidate product cache
    await redis.del(`product:${companyId}:${productId}`);
    await redis.del(`products:${companyId}:*`);

    // Invalidate cart cache (product no longer available)
    await redis.del(`cart:${companyId}:*`);

    logger.info(`✅ Out of stock event processed`);
  } catch (error) {
    logger.error(`❌ Error handling out of stock: ${error.message}`);
    throw error;
  }
}

/**
 * Main handler function
 */
module.exports = async function handleInventoryEvent(event) {
  try {
    const { type, data } = event;

    logger.info(`📦 Processing inventory event: ${type}`);

    switch (type) {
      case 'inventory.product.created':
        await handleProductCreated(data);
        break;

      case 'inventory.product.updated':
        await handleProductUpdated(data);
        break;

      case 'inventory.product.deleted':
        await handleProductDeleted(data);
        break;

      case 'inventory.stock.updated':
        await handleStockUpdated(data);
        break;

      case 'inventory.out.of.stock':
        await handleOutOfStock(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled inventory event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling inventory event: ${error.message}`);
    throw error;
  }
};

