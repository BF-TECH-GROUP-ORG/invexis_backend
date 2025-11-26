"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");

/**
 * Handles sale and transaction events
 * @param {Object} event - The sale event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleSaleEvent(event, routingKey) {
  try {
    const { type, data } = event;

    logger.info(`💰 Processing sale event: ${type}`, data);

    switch (type) {
      case "sale.created":
        await handleSaleCreated(data);
        break;

      case "sale.completed":
        await handleSaleCompleted(data);
        break;

      case "sale.cancelled":
        await handleSaleCancelled(data);
        break;

      case "sale.refunded":
        await handleSaleRefunded(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled sale event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling sale event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle sale creation
 */
async function handleSaleCreated(data) {
  const { saleId, companyId, amount, createdBy, customerEmail, customerPhone } = data;

  if (!saleId || !companyId) {
    logger.warn("⚠️ Sale created event missing required fields");
    return;
  }

  try {
    logger.info(`💰 New sale created: #${saleId} (${amount})`);

    const { dispatchEvent } = require("../../services/dispatcher");

    // Determine channels
    const channels = {
      email: !!customerEmail,
      push: true,
      inApp: true,
      sms: !!customerPhone
    };

    if (!customerPhone) {
      logger.warn(`⚠️ No phone number for sale ${saleId}, SMS skipped`);
    }

    await dispatchEvent({
      event: "sale.created",
      data: {
        email: customerEmail,
        phone: customerPhone,
        ...data,
      },
      recipients: [createdBy],
      companyId,
      templateName: "sale_created",
      channels
    });

    logger.info(`✅ Sale creation notification dispatched for sale ${saleId}`);
  } catch (error) {
    logger.error(`❌ Error creating sale notification:`, error.message);
    throw error;
  }
}

/**
 * Handle sale completion
 */
async function handleSaleCompleted(data) {
  const { saleId, companyId, amount } = data;

  logger.info(`✅ Sale completed: #${saleId} (${amount})`);
  // Could send receipt/confirmation notification
}

/**
 * Handle sale cancellation
 */
async function handleSaleCancelled(data) {
  const { saleId, companyId, reason } = data;

  logger.info(`❌ Sale cancelled: #${saleId} - ${reason}`);
  // Could send cancellation notification
}

/**
 * Handle sale refund
 */
async function handleSaleRefunded(data) {
  const { saleId, companyId, amount } = data;

  logger.info(`💸 Sale refunded: #${saleId} (${amount})`);
  // Could send refund confirmation notification
}

