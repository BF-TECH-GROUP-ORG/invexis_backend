/**
 * Shop Event Handler
 * Handles shop-related events from shop-service
 * Manages shop-ecommerce relationships and cache
 */

const redis = require('/app/shared/redis.js');
const { logger } = require('../../utils/app');

/**
 * Handle shop created event - Link shop to ecommerce
 */
async function handleShopCreated(data) {
  try {
    const { shopId, companyId, name } = data;

    logger.info(`🏪 Processing shop created: ${shopId} (${name})`);

    // Invalidate shop list cache
    await redis.del(`shops:${companyId}:*`);

    logger.info(`✅ Shop cache invalidated for company ${companyId}`);
  } catch (error) {
    logger.error(`❌ Error handling shop created: ${error.message}`);
    throw error;
  }
}

/**
 * Handle shop deleted event - Unlink shop from ecommerce
 */
async function handleShopDeleted(data) {
  try {
    const { shopId, companyId } = data;

    logger.info(`🏪 Processing shop deleted: ${shopId}`);

    // Invalidate shop cache
    await redis.del(`shop:${companyId}:${shopId}`);
    await redis.del(`shops:${companyId}:*`);

    // Invalidate related caches
    await redis.del(`orders:${companyId}:${shopId}:*`);
    await redis.del(`cart:${companyId}:${shopId}:*`);

    logger.info(`✅ Shop removed from cache`);
  } catch (error) {
    logger.error(`❌ Error handling shop deleted: ${error.message}`);
    throw error;
  }
}

/**
 * Main handler function
 */
module.exports = async function handleShopEvent(event) {
  try {
    const { type, data } = event;

    logger.info(`🏪 Processing shop event: ${type}`);

    switch (type) {
      case 'shop.created':
        await handleShopCreated(data);
        break;

      case 'shop.deleted':
        await handleShopDeleted(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled shop event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling shop event: ${error.message}`);
    throw error;
  }
};

