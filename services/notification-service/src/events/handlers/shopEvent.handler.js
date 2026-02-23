"use strict";

const Notification = require("../../models/Notification");
const ShopSchedule = require("../../models/ShopSchedule");
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

      case "shop.operating_hours.updated":
        await handleOperatingHoursUpdated(data);
        break;

      case "shop.operating_hours.deleted":
        await handleOperatingHoursDeleted(data);
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

    // Create schedule entry
    await ShopSchedule.findOneAndUpdate(
      { shopId },
      {
        $set: {
          shopId,
          companyId,
          shopName,
          timezone: data.timezone || 'Africa/Kigali',
          lastSyncedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

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
  const { shopId, shopName, companyId, performedByName, timezone } = data || {};
  const { cleanValue } = require("../../utils/dataSanitizer");

  if (!shopId || !companyId) return;

  try {
    // Update schedule entry
    const update = {
      shopName,
      lastSyncedAt: new Date()
    };
    if (timezone) update.timezone = timezone;

    await ShopSchedule.findOneAndUpdate(
      { shopId },
      { $set: update },
      { upsert: true }
    );

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

    // Cleanup schedule
    await ShopSchedule.deleteOne({ shopId });
    logger.info(`🗑️ Removed shop schedule for ${shopId}`);
  } catch (error) {
    logger.error(`❌ Error in handleShopDeleted:`, error.message);
  }
}

/**
 * Handle operating hours update (Sync to local cache)
 */
async function handleOperatingHoursUpdated(data) {
  const { shopId, companyId, operatingHours, timezone } = data || {};

  if (!shopId || !companyId) return;

  try {
    const update = {
      shopId,
      companyId,
      operatingHours: operatingHours || [],
      lastSyncedAt: new Date()
    };

    // If timezone is provided, update it (it might come from shop.updated too, but good to have here if available)
    if (timezone) update.timezone = timezone;

    // Helper to fetch shop name if missing? For now assuming shop.created/updated populated it.
    // Or we can rely on upsert. If shopName is missing in existing doc, we might need to fetch it or wait for shop.updated.
    // For simplicity, we use a placeholder or leave it if existing.
    // Actually, eventHelpers in shop-service sending only operatingHours.
    // We should upsert carefully.

    const shopSchedule = await ShopSchedule.findOneAndUpdate(
      { shopId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // If shopName is missing (new schedule for existing shop), we might want to log a warning or rely on it being there
    if (!shopSchedule.shopName) {
      // In a real scenario we might fetch details from shop-service or wait.
      // For now, we set a default to avoid scheduler errors.
      await ShopSchedule.updateOne({ _id: shopSchedule._id }, { $set: { shopName: "Shop (Syncing...)" } });
    }

    logger.info(`✅ Synced operating hours for shop ${shopId}`);
  } catch (error) {
    logger.error(`❌ Error syncing operating hours:`, error.message);
  }
}

/**
 * Handle operating hours deletion
 */
async function handleOperatingHoursDeleted(data) {
  const { shopId } = data || {};
  if (!shopId) return;

  try {
    await ShopSchedule.updateOne({ shopId }, { $set: { operatingHours: [] } });
    logger.info(`✅ Cleared operating hours for shop ${shopId}`);
  } catch (error) {
    logger.error(`❌ Error clearing operating hours:`, error.message);
  }
}

