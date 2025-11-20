/**
 * Shop Event Handler
 * Handles shop-related events from shop-service
 * Manages shop-inventory relationships
 */

const Product = require('../../models/Product');
const { logger } = require('../../utils/logger');

/**
 * Handle shop created event - Link shop to inventory
 */
async function handleShopCreated(data) {
  try {
    const { shopId, companyId, name } = data;

    logger.info(`🏪 Processing shop created: ${shopId} (${name})`);

    // Update all products for this company to include shop reference
    const result = await Product.updateMany(
      { companyId },
      {
        $addToSet: { shops: shopId }
      }
    );

    logger.info(
      `✅ Linked shop ${shopId} to ${result.modifiedCount} products`
    );
  } catch (error) {
    logger.error(`❌ Error handling shop created: ${error.message}`);
    throw error;
  }
}

/**
 * Handle shop deleted event - Unlink shop from inventory
 */
async function handleShopDeleted(data) {
  try {
    const { shopId, companyId } = data;

    logger.info(`🏪 Processing shop deleted: ${shopId}`);

    // Remove shop reference from all products
    const result = await Product.updateMany(
      { companyId },
      {
        $pull: { shops: shopId }
      }
    );

    logger.info(
      `✅ Unlinked shop ${shopId} from ${result.modifiedCount} products`
    );
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

