"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");

/**
 * Handles shop lifecycle events
 * @param {Object} event - The shop event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleShopEvent(event, routingKey) {
  try {
    const { type, data } = event;

    logger.info(`🏪 Processing shop event: ${type}`, data);

    switch (type) {
      case "shop.created":
        await handleShopCreated(data);
        break;

      case "shop.updated":
        await handleShopUpdated(data);
        break;

      case "shop.deleted":
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

/**
 * Handle shop creation
 */
async function handleShopCreated(data) {
  const { shopId, shopName, companyId, createdBy } = data;

  if (!shopId || !companyId) {
    logger.warn("⚠️ Shop created event missing required fields");
    return;
  }

  try {
    logger.info(`🏪 New shop created: ${shopName} (${shopId})`);

    const notification = await Notification.create({
      companyId,
      userId: createdBy,
      type: "shop_created",
      title: "New Shop Created",
      body: `Shop "${shopName}" has been created successfully.`,
      scope: "company",
      channels: { inApp: true },
      payload: data,
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Shop creation notification queued for shop ${shopId}`);
  } catch (error) {
    logger.error(`❌ Error creating shop notification:`, error.message);
    throw error;
  }
}

/**
 * Handle shop update
 */
async function handleShopUpdated(data) {
  const { shopId, shopName } = data;

  logger.info(`📝 Shop updated: ${shopName} (${shopId})`);
  // Could send notification about shop update
}

/**
 * Handle shop deletion
 */
async function handleShopDeleted(data) {
  const { shopId, shopName } = data;

  logger.info(`🗑️ Shop deleted: ${shopName} (${shopId})`);
  // Could send notification about shop deletion
}

