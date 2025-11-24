/**
 * Shop Event Handler
 * Handles shop-related events from shop-service
 * Manages shop-inventory relationships and treats shops as warehouses
 */

const Product = require("../../models/Product");
const { logger } = require("../../utils/logger");

/**
 * Handle shop created event - Register shop as warehouse and link to products
 */
async function handleShopCreated(data) {
  try {
    const { shopId, companyId, name, location } = data.payload || data;

    logger.info(`🏪 Processing shop created: ${shopId} (${name})`);

    // Warehouse model removed; no warehouse entry is created for shops.
    let warehouseId = null;

    // 2. Add shop to shopAvailability for all active products in the company
    const result = await Product.updateMany(
      {
        companyId,
        status: { $in: ["active", "draft"] },
        // Only add if not already present
        "shopAvailability.shopId": { $ne: shopId },
      },
      {
        $addToSet: {
          shopAvailability: {
            shopId,
            enabled: true,
            displayOrder: 0,
            customPrice: null,
            addedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      }
    );

    logger.info(`✅ Linked shop ${shopId} to ${result.modifiedCount} products via shopAvailability`);

    return { success: true, productsLinked: result.modifiedCount, warehouseId };
  } catch (error) {
    logger.error(`❌ Error handling shop created: ${error.message}`);
    throw error;
  }
}

/**
 * Handle shop deleted event - Remove shop from inventory and warehouse
 */
async function handleShopDeleted(data) {
  try {
    const { shopId, companyId } = data.payload || data;

    logger.info(`🏪 Processing shop deleted: ${shopId}`);

    // 1. Remove shop from shopAvailability in all products
    const result = await Product.updateMany(
      { companyId },
      {
        $pull: {
          shopAvailability: { shopId },
        },
      }
    );

    logger.info(
      `✅ Removed shop ${shopId} from ${result.modifiedCount} products`
    );

    // Warehouse model removed; nothing to deactivate

    return { success: true, productsUnlinked: result.modifiedCount };
  } catch (error) {
    logger.error(`❌ Error handling shop deleted: ${error.message}`);
    throw error;
  }
}

/**
 * Handle shop status changed event - Enable/disable shop availability
 */
async function handleShopStatusChanged(data) {
  try {
    const { shopId, companyId, status } = data.payload || data;

    logger.info(`🏪 Processing shop status changed: ${shopId} -> ${status}`);

    const enabled = status === "open";

    // Update shopAvailability.enabled for all products
    const result = await Product.updateMany(
      {
        companyId,
        "shopAvailability.shopId": shopId,
      },
      {
        $set: {
          "shopAvailability.$[elem].enabled": enabled,
          "shopAvailability.$[elem].updatedAt": new Date(),
        },
      },
      {
        arrayFilters: [{ "elem.shopId": shopId }],
      }
    );

    logger.info(
      `✅ Updated shop availability (enabled=${enabled}) for ${result.modifiedCount} products`
    );

    return { success: true, productsUpdated: result.modifiedCount };
  } catch (error) {
    logger.error(`❌ Error handling shop status changed: ${error.message}`);
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
      case "shop.created":
        await handleShopCreated(data);
        break;

      case "shop.deleted":
        await handleShopDeleted(data);
        break;

      case "shop.status.changed":
        await handleShopStatusChanged(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled shop event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling shop event: ${error.message}`);
    throw error;
  }
};
