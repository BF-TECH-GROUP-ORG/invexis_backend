"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");

/**
 * Handles product and inventory events
 * @param {Object} event - The product event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleProductEvent(event, routingKey) {
  try {
    const { type, data } = event;

    logger.info(`📦 Processing product event: ${type}`, data);

    switch (type) {
      case "product.created":
        await handleProductCreated(data);
        break;

      case "product.updated":
        await handleProductUpdated(data);
        break;

      case "product.deleted":
        await handleProductDeleted(data);
        break;

      case "inventory.low_stock":
        await handleLowStock(data);
        break;

      case "inventory.out_of_stock":
        await handleOutOfStock(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled product event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling product event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle product creation
 */
/**
 * Handle product creation
 */
async function handleProductCreated(data) {
  const { productId, productName, companyId, createdBy, createdByName } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Product created event missing required fields");
    return;
  }

  try {
    logger.info(`📦 New product created: ${productName} (${productId})`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    // Broadcast to company admins/managers
    await dispatchBroadcastEvent({
      event: "product.created",
      data: {
        productName,
        userName: createdByName || "Staff",
        productId,
        ...data
      },
      companyId,
      templateName: "product_created",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Product creation notification broadcasted for product ${productId}`);
  } catch (error) {
    logger.error(`❌ Error creating product notification:`, error.message);
    throw error;
  }
}

/**
 * Handle product update
 */
async function handleProductUpdated(data) {
  const { productId, productName } = data;
  logger.info(`📝 Product updated: ${productName} (${productId})`);
}

/**
 * Handle product deletion
 */
async function handleProductDeleted(data) {
  const { productId, productName } = data;
  logger.info(`🗑️ Product deleted: ${productName} (${productId})`);
}

/**
 * Handle low stock alert
 */
async function handleLowStock(data) {
  const { productId, productName, companyId, currentStock } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Low stock event missing required fields");
    return;
  }

  try {
    logger.warn(`⚠️ Low stock alert: ${productName} (${currentStock} units)`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "inventory.low_stock",
      data: {
        productName,
        quantity: currentStock,
        productId,
        ...data
      },
      companyId,
      templateName: "inventory_low",
      channels: ["email", "push", "inApp"],
      scope: "company",
      roles: ["company_admin", "worker"],
      priority: "high"
    });

    logger.info(`✅ Low stock notification broadcasted for product ${productId}`);
  } catch (error) {
    logger.error(`❌ Error creating low stock notification:`, error.message);
    throw error;
  }
}

/**
 * Handle out of stock alert
 */
async function handleOutOfStock(data) {
  const { productId, productName, companyId } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Out of stock event missing required fields");
    return;
  }

  try {
    logger.error(`❌ Out of stock: ${productName}`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "inventory.out_of_stock",
      data: {
        productName,
        productId,
        ...data
      },
      companyId,
      templateName: "stock_out",
      channels: ["email", "push", "inApp"],
      scope: "company",
      roles: ["company_admin", "worker"],
      priority: "high"
    });

    logger.info(`✅ Out of stock notification broadcasted for product ${productId}`);
  } catch (error) {
    logger.error(`❌ Error creating out of stock notification:`, error.message);
    throw error;
  }
}

