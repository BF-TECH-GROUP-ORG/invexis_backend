"use strict";

const { Sale } = require("../../models/index.model");

/**
 * Handles shop-related events from shop-service
 * Tracks shop lifecycle and manages sales impact
 * @param {Object} event - The shop event
 */
module.exports = async function handleShopEvent(event) {
  try {
    const { type, data } = event;

    console.log(`🏪 Processing shop event: ${type}`, data);

    switch (type) {
      case "shop.created":
        await handleShopCreated(data);
        break;

      case "shop.updated":
        await handleShopUpdated(data);
        break;

      case "shop.deleted":
      case "shop.closed":
        await handleShopClosed(data);
        break;

      case "shop.status.changed":
        await handleShopStatusChanged(data);
        break;

      case "shop.settings.updated":
        await handleShopSettingsUpdated(data);
        break;

      default:
        console.log(`⚠️ Unhandled shop event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling shop event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle shop creation - log for audit
 */
async function handleShopCreated(data) {
  const { shopId, shopName, companyId } = data;

  if (!shopId) {
    console.warn("⚠️ Shop created event missing shopId");
    return;
  }

  try {
    console.log(`🏪 New shop created: ${shopId} - ${shopName}`);
    console.log(`✅ Shop creation recorded`);
  } catch (error) {
    console.error(`❌ Error handling shop creation:`, error.message);
    throw error;
  }
}

/**
 * Handle shop update - log for audit
 */
async function handleShopUpdated(data) {
  const { shopId, shopName } = data;

  if (!shopId) {
    console.warn("⚠️ Shop updated event missing shopId");
    return;
  }

  try {
    console.log(`🏪 Shop ${shopId} updated - ${shopName}`);
    console.log(`✅ Shop update recorded`);
  } catch (error) {
    console.error(`❌ Error handling shop update:`, error.message);
    throw error;
  }
}

/**
 * Handle shop closure - archive sales data
 */
async function handleShopClosed(data) {
  const { shopId } = data;

  if (!shopId) {
    console.warn("⚠️ Shop closed event missing shopId");
    return;
  }

  try {
    console.warn(`🏪 Shop ${shopId} has been closed`);

    // Find all sales for this shop
    const shopSales = await Sale.findAll({
      where: { shopId },
      attributes: ["saleId", "status"],
    });

    console.log(`📝 Found ${shopSales.length} sales for closed shop`);

    // Check for pending sales
    const pendingSales = shopSales.filter((s) => s.status === "initiated");
    if (pendingSales.length > 0) {
      console.warn(
        `⚠️ WARNING: ${pendingSales.length} pending sales exist for closed shop`
      );
    }

    console.log(`✅ Shop closure recorded`);
  } catch (error) {
    console.error(`❌ Error handling shop closure:`, error.message);
    throw error;
  }
}

/**
 * Handle shop status change
 */
async function handleShopStatusChanged(data) {
  const { shopId, oldStatus, newStatus } = data;

  if (!shopId) {
    console.warn("⚠️ Shop status changed event missing shopId");
    return;
  }

  try {
    console.log(`🏪 Shop ${shopId} status: ${oldStatus} → ${newStatus}`);

    if (newStatus === "inactive") {
      console.warn(`⚠️ Shop ${shopId} is now INACTIVE`);

      // Find pending sales for this shop
      const pendingSales = await Sale.findAll({
        where: { shopId, status: "initiated" },
        attributes: ["saleId"],
      });

      if (pendingSales.length > 0) {
        console.warn(
          `⚠️ ${pendingSales.length} pending sales for inactive shop`
        );
      }
    } else if (newStatus === "active") {
      console.log(`✅ Shop ${shopId} is now ACTIVE`);
    }

    console.log(`✅ Shop status change recorded`);
  } catch (error) {
    console.error(`❌ Error handling shop status change:`, error.message);
    throw error;
  }
}

/**
 * Handle shop settings update
 */
async function handleShopSettingsUpdated(data) {
  const { shopId, settings } = data;

  if (!shopId) {
    console.warn("⚠️ Shop settings updated event missing shopId");
    return;
  }

  try {
    console.log(`⚙️ Shop ${shopId} settings updated`);
    console.log(`✅ Shop settings update recorded`);
  } catch (error) {
    console.error(`❌ Error handling shop settings update:`, error.message);
    throw error;
  }
}
