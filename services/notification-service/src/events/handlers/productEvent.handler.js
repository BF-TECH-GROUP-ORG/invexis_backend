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
async function handleProductCreated(data) {
  const { productId, productName, companyId, createdBy } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Product created event missing required fields");
    return;
  }

  try {
    logger.info(`📦 New product created: ${productName} (${productId})`);

    const notification = await Notification.create({
      companyId,
      userId: createdBy,
      type: "product_added",
      title: "New Product Added",
      body: `Product "${productName}" has been added to inventory.`,
      scope: "company",
      channels: { inApp: true },
      payload: data,
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Product creation notification queued for product ${productId}`);
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
  // Could send notification about product update
}

/**
 * Handle product deletion
 */
async function handleProductDeleted(data) {
  const { productId, productName } = data;

  logger.info(`🗑️ Product deleted: ${productName} (${productId})`);
  // Could send notification about product deletion
}

/**
 * Handle low stock alert
 */
async function handleLowStock(data) {
  const { productId, productName, companyId, currentStock, threshold } = data;

  if (!productId || !companyId) {
    logger.warn("⚠️ Low stock event missing required fields");
    return;
  }

  try {
    logger.warn(`⚠️ Low stock alert: ${productName} (${currentStock} units)`);

    const notification = await Notification.create({
      companyId,
      type: "low_stock_alert",
      title: "Low Stock Alert",
      body: `Product "${productName}" is running low on stock (${currentStock} units remaining).`,
      scope: "company",
      channels: { email: true, push: true, inApp: true },
      payload: data,
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Low stock notification queued for product ${productId}`);
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

    const notification = await Notification.create({
      companyId,
      type: "out_of_stock_alert",
      title: "Out of Stock Alert",
      body: `Product "${productName}" is out of stock!`,
      scope: "company",
      channels: { email: true, sms: true, push: true, inApp: true },
      payload: data,
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Out of stock notification queued for product ${productId}`);
  } catch (error) {
    logger.error(`❌ Error creating out of stock notification:`, error.message);
    throw error;
  }
}

