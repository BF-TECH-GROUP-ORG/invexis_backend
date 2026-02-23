"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");
const { processEventOnce } = require("../../utils/eventDeduplication");

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

      case "sale.return.created":
        await handleSaleReturnCreated(data);
        break;

      case "sale.completed":
        await handleSaleCompleted(data);
        break;

      case "sale.cancelled":
        await handleSaleCancelled(data);
        break;

      case "sale.refunded":
      case "sale.refund.processed":
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
  const { saleId, companyId, totalAmount, customerEmail, customer, phone } = data || {};
  const { cleanValue, cleanAmount } = require("../../utils/dataSanitizer");

  // Robust extraction
  const safeAmount = cleanAmount(totalAmount || data.amount, 0);
  const safeCustomerName = cleanValue(customer?.name || data.customerName, "Guest");
  const customerPhone = data.customerPhone || phone || customer?.phone || customer?.phoneNumber;

  if (!saleId || !companyId) {
    logger.warn("⚠️ Sale created event missing required fields");
    return;
  }

  try {
    logger.info(`💰 New sale created: #${saleId} (${safeAmount})`);

    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    // 1. Notify Company Staff (Broadcast for History/Real-time)
    await dispatchBroadcastEvent({
      event: "sale.created",
      data: {
        saleId,
        totalAmount: safeAmount,
        customerName: safeCustomerName,
        customerEmail,
        phone: customerPhone,
        ...data,
      },
      companyId,
      templateName: "sale.created",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Sale creation notification dispatched for sale ${saleId}`);
  } catch (error) {
    logger.error(`❌ Error creating sale notification:`, error.message);
    throw error;
  }
}

/**
 * Handle sale return
 */
async function handleSaleReturnCreated(data) {
  const { saleId, companyId, refundAmount, amount, customer, reason } = data || {};
  const { cleanValue, cleanAmount } = require("../../utils/dataSanitizer");

  const safeAmount = cleanAmount(refundAmount || amount, 0);
  const safeCustomerName = cleanValue(customer?.name || data.customerName, "Customer");

  if (!saleId || !companyId) {
    logger.warn("⚠️ sale.return.created missing required fields");
    return;
  }

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "sale.return.created",
      data: {
        saleId,
        refundAmount: safeAmount,
        customerName: safeCustomerName,
        reason: reason || "No reason provided",
        ...data
      },
      companyId,
      templateName: "sale.return.created",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Sale return notification dispatched for sale ${saleId}`);
  } catch (error) {
    logger.error(`❌ Error creating sale return notification:`, error.message);
  }
}

/**
 * Handle sale completion
 */
async function handleSaleCompleted(data) {
  const { saleId, companyId, totalAmount, amount, performedByName } = data || {};
  const { cleanAmount, cleanValue } = require("../../utils/dataSanitizer");

  if (!saleId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const safeAmount = cleanAmount(totalAmount || amount, 0);

    await dispatchBroadcastEvent({
      event: "sale.completed",
      data: {
        saleId,
        totalAmount: safeAmount,
        performedByName: cleanValue(performedByName, "Staff"),
        ...data
      },
      companyId,
      templateName: "sale.created", // Reuse creation template or use dot-notation
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Sale completion notification broadcasted: #${saleId}`);
  } catch (error) {
    logger.error(`❌ Error in handleSaleCompleted:`, error.message);
  }
}

/**
 * Handle sale cancellation
 */
async function handleSaleCancelled(data) {
  const { saleId, companyId, reason, totalAmount, amount, performedByName } = data || {};
  const { cleanAmount, cleanValue } = require("../../utils/dataSanitizer");

  if (!saleId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "sale.cancelled",
      data: {
        saleId,
        totalAmount: cleanAmount(totalAmount || amount, 0),
        reason: reason || "No reason provided",
        performedByName: cleanValue(performedByName, "Staff"),
        ...data
      },
      companyId,
      templateName: "sale.cancelled",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Sale cancellation notification broadcasted: #${saleId}`);
  } catch (error) {
    logger.error(`❌ Error in handleSaleCancelled:`, error.message);
  }
}

/**
 * Handle sale refund
 */
async function handleSaleRefunded(data) {
  const { saleId, companyId, amount, refundAmount, performedByName } = data || {};
  const { cleanAmount, cleanValue } = require("../../utils/dataSanitizer");

  if (!saleId || !companyId) return;

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    const safeAmount = cleanAmount(refundAmount || amount, 0);

    await dispatchBroadcastEvent({
      event: "sale.return.created", // Map refund to return template
      data: {
        saleId,
        refundAmount: safeAmount,
        performedByName: cleanValue(performedByName, "Staff"),
        ...data
      },
      companyId,
      templateName: "sale.return.created",
      channels: ["inApp", "push"],
      scope: "company",
      roles: ["company_admin", "worker"]
    });

    logger.info(`✅ Sale refund notification broadcasted: #${saleId}`);
  } catch (error) {
    logger.error(`❌ Error in handleSaleRefunded:`, error.message);
  }
}

