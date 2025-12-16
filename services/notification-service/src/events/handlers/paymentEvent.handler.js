"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");

/**
 * Handles payment and billing events
 * @param {Object} event - The payment event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handlePaymentEvent(event, routingKey) {
  try {
    const { type, data } = event;

    logger.info(`💳 Processing payment event: ${type}`, data);

    switch (type) {
      case "payment.success":
        await handlePaymentSuccess(data);
        break;

      case "payment.failed":
        await handlePaymentFailed(data);
        break;

      case "payment.refunded":
        await handlePaymentRefunded(data);
        break;

      case "subscription.expiring":
        await handleSubscriptionExpiring(data);
        break;

      case "subscription.expired":
        await handleSubscriptionExpired(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled payment event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling payment event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(data) {
  const { paymentId, companyId, amount, userId, email, phone } = data;

  if (!paymentId || !companyId) {
    logger.warn("⚠️ Payment success event missing required fields");
    return;
  }

  try {
    logger.info(`✅ Payment successful: ${paymentId} (${amount})`);

    const { dispatchEvent } = require("../../services/dispatcher");

    const channels = {
      email: !!email,
      inApp: true,
      sms: !!phone
    };

    if (!phone) {
      logger.warn(`⚠️ No phone number for payment ${paymentId}, SMS skipped`);
    }

    await dispatchEvent({
      event: "payment.success",
      data: {
        email,
        phone,
        ...data,
      },
      recipients: [userId],
      companyId,
      templateName: "payment_received",
      channels
    });

    logger.info(`✅ Payment success notification dispatched for payment ${paymentId}`);
  } catch (error) {
    logger.error(`❌ Error creating payment success notification:`, error.message);
    throw error;
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(data) {
  const { paymentId, companyId, amount, userId, email, phone, reason } = data;

  if (!paymentId || !companyId) {
    logger.warn("⚠️ Payment failed event missing required fields");
    return;
  }

  try {
    logger.error(`❌ Payment failed: ${paymentId} - ${reason}`);

    const { dispatchEvent } = require("../../services/dispatcher");

    const channels = {
      email: !!email,
      inApp: true,
      sms: !!phone
    };

    if (!phone) {
      logger.warn(`⚠️ No phone number for failed payment ${paymentId}, SMS skipped`);
    }

    await dispatchEvent({
      event: "payment.failed",
      data: {
        email,
        phone,
        ...data,
      },
      recipients: [userId],
      companyId,
      templateName: "payment_failed", // Note: Need to ensure this template exists or falls back gracefully
      channels
    });

    logger.info(`✅ Payment failed notification dispatched for payment ${paymentId}`);
  } catch (error) {
    logger.error(`❌ Error creating payment failed notification:`, error.message);
    throw error;
  }
}

/**
 * Handle payment refund
 */
async function handlePaymentRefunded(data) {
  const { paymentId, companyId, amount, userId, email } = data;

  logger.info(`💸 Payment refunded: ${paymentId} (${amount})`);
  // Could send refund confirmation notification
}

/**
 * Handle subscription expiring soon
 */
async function handleSubscriptionExpiring(data) {
  const { subscriptionId, companyId, expiresAt } = data;

  logger.warn(`⚠️ Subscription expiring: ${subscriptionId} on ${expiresAt}`);
  // Could send expiration warning notification
}

/**
 * Handle subscription expired
 */
async function handleSubscriptionExpired(data) {
  const { subscriptionId, companyId } = data;

  logger.error(`❌ Subscription expired: ${subscriptionId}`);
  // Could send expiration notification
}

