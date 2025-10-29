"use strict";

const { Shop } = require("../../models/index.model");

/**
 * Handles inventory-related events from inventory-service
 * Manages shop inventory status and capacity
 * @param {Object} event - The inventory event
 */
module.exports = async function handleInventoryEvent(event) {
  try {
    const { type, data } = event;

    console.log(`📦 Processing inventory event: ${type}`, data);

    switch (type) {
      case "inventory.low.stock":
        await handleLowStock(data);
        break;

      case "inventory.out.of.stock":
        await handleOutOfStock(data);
        break;

      case "inventory.restocked":
        await handleRestocked(data);
        break;

      case "inventory.shop.linked":
        await handleShopLinked(data);
        break;

      case "inventory.shop.unlinked":
        await handleShopUnlinked(data);
        break;

      default:
        console.log(`⚠️ Unhandled inventory event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling inventory event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle low stock alert
 */
async function handleLowStock(data) {
  const { shopId, productId, currentStock, minimumStock } = data;

  if (!shopId || !productId) {
    console.warn("⚠️ Low stock event missing shopId or productId");
    return;
  }

  try {
    const shop = await Shop.findById(shopId);
    if (!shop) {
      console.warn(`⚠️ Shop ${shopId} not found for low stock alert`);
      return;
    }

    console.warn(
      `⚠️ Low stock alert for shop ${shop.name}: Product ${productId} (${currentStock}/${minimumStock})`
    );
    console.log(`✅ Low stock alert recorded`);
  } catch (error) {
    console.error(`❌ Error handling low stock:`, error.message);
    throw error;
  }
}

/**
 * Handle out of stock
 */
async function handleOutOfStock(data) {
  const { shopId, productId } = data;

  if (!shopId || !productId) {
    console.warn("⚠️ Out of stock event missing shopId or productId");
    return;
  }

  try {
    const shop = await Shop.findById(shopId);
    if (!shop) {
      console.warn(`⚠️ Shop ${shopId} not found for out of stock alert`);
      return;
    }

    console.warn(
      `⚠️ Out of stock for shop ${shop.name}: Product ${productId}`
    );
    console.log(`✅ Out of stock alert recorded`);
  } catch (error) {
    console.error(`❌ Error handling out of stock:`, error.message);
    throw error;
  }
}

/**
 * Handle restocked
 */
async function handleRestocked(data) {
  const { shopId, productId, newStock } = data;

  if (!shopId || !productId) {
    console.warn("⚠️ Restocked event missing shopId or productId");
    return;
  }

  try {
    const shop = await Shop.findById(shopId);
    if (!shop) {
      console.warn(`⚠️ Shop ${shopId} not found for restock event`);
      return;
    }

    console.log(
      `✅ Restocked for shop ${shop.name}: Product ${productId} (${newStock} units)`
    );
  } catch (error) {
    console.error(`❌ Error handling restock:`, error.message);
    throw error;
  }
}

/**
 * Handle shop linked to inventory
 */
async function handleShopLinked(data) {
  const { shopId, inventoryId } = data;

  if (!shopId || !inventoryId) {
    console.warn("⚠️ Shop linked event missing shopId or inventoryId");
    return;
  }

  try {
    const shop = await Shop.findById(shopId);
    if (!shop) {
      console.warn(`⚠️ Shop ${shopId} not found for link event`);
      return;
    }

    console.log(`✅ Shop ${shop.name} linked to inventory ${inventoryId}`);
  } catch (error) {
    console.error(`❌ Error handling shop link:`, error.message);
    throw error;
  }
}

/**
 * Handle shop unlinked from inventory
 */
async function handleShopUnlinked(data) {
  const { shopId, inventoryId } = data;

  if (!shopId || !inventoryId) {
    console.warn("⚠️ Shop unlinked event missing shopId or inventoryId");
    return;
  }

  try {
    const shop = await Shop.findById(shopId);
    if (!shop) {
      console.warn(`⚠️ Shop ${shopId} not found for unlink event`);
      return;
    }

    console.log(`✅ Shop ${shop.name} unlinked from inventory ${inventoryId}`);
  } catch (error) {
    console.error(`❌ Error handling shop unlink:`, error.message);
    throw error;
  }
}

