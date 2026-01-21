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
  const { shopId, shopName, companyId, createdBy, performedBy, performedByName } = data || {};
  const { cleanValue } = require("../../utils/dataSanitizer");

  if (!shopId || !companyId) {
    logger.warn("⚠️ Shop created event missing required fields");
    return;
  }

  try {
    logger.info(`🏪 New shop created: ${shopName} (${shopId})`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "shop.created",
      data: {
        id: shopId,
        name: cleanValue(shopName, "Shop"),
        performedByName: cleanValue(performedByName, "Staff"),
        ...data
      },
      companyId,
      templateName: "shop.created",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Shop creation notification broadcasted for shop ${shopId}`);
  } catch (error) {
    logger.error(`❌ Error creating shop notification:`, error.message);
    throw error;
  }
}

/**
 * Handle shop update
 */
async function handleShopUpdated(data) {
  const { shopId, shopName, companyId, performedByName } = data || {};
  const { cleanValue } = require("../../utils/dataSanitizer");

  if (!shopId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "shop.updated",
      data: {
        id: shopId,
        name: cleanValue(shopName, "Shop"),
        performedByName: cleanValue(performedByName, "Staff"),
        ...data
      },
      companyId,
      templateName: "shop.updated",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Shop update notification broadcasted for shop ${shopId}`);
  } catch (error) {
    logger.error(`❌ Error in handleShopUpdated:`, error.message);
  }
}

/**
 * Handle shop deletion
 */
async function handleShopDeleted(data) {
  const { shopId, shopName, companyId, performedByName } = data || {};
  const { cleanValue } = require("../../utils/dataSanitizer");

  if (!shopId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "shop.deleted",
      data: {
        id: shopId,
        name: cleanValue(shopName, "Shop"),
        performedByName: cleanValue(performedByName, "Staff"),
        ...data
      },
      companyId,
      templateName: "shop.deleted",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Shop deletion notification broadcasted for shop ${shopId}`);
  } catch (error) {
    logger.error(`❌ Error in handleShopDeleted:`, error.message);
  }
}

