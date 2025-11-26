"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");

/**
 * Handles authentication and user lifecycle events
 * @param {Object} event - The auth event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleAuthEvent(event, routingKey) {
  try {
    const { type, data } = event;

    logger.info(`🔐 Processing auth event: ${type}`, data);

    switch (type) {
      case "user.created":
        await handleUserCreated(data);
        break;

      case "user.verified":
        await handleUserVerified(data);
        break;

      case "user.password.reset":
        await handlePasswordReset(data);
        break;

      case "user.suspended":
        await handleUserSuspended(data);
        break;

      case "user.deleted":
        await handleUserDeleted(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled auth event type: ${type}`);
    }
  } catch (error) {
    logger.error(`❌ Error handling auth event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle user creation
 */
async function handleUserCreated(data) {
  const { userId, email, phone, companyId } = data;

  if (!userId || !email) {
    logger.warn("⚠️ User created event missing required fields");
    return;
  }

  try {
    logger.info(`👤 New user created: ${email} (${userId})`);

    const { dispatchEvent } = require("../../services/dispatcher");

    // Determine channels
    const channels = {
      email: !!email,
      inApp: true,
      sms: !!phone
    };

    if (!phone) {
      logger.warn(`⚠️ No phone number for user ${userId}, SMS skipped`);
    }

    await dispatchEvent({
      event: "user.created",
      data: {
        email,
        phone,
        ...data,
      },
      recipients: [userId],
      companyId,
      templateName: "welcome",
      channels
    });

    logger.info(`✅ User creation notification dispatched for user ${userId}`);
  } catch (error) {
    logger.error(`❌ Error creating user notification:`, error.message);
    throw error;
  }
}

/**
 * Handle user verification
 */
async function handleUserVerified(data) {
  const { userId, email } = data;

  logger.info(`✅ User verified: ${email} (${userId})`);
  // Could send verification confirmation notification
}

/**
 * Handle password reset
 */
async function handlePasswordReset(data) {
  const { userId, email, phone, resetCode, companyId } = data;

  if (!userId || (!email && !phone)) {
    logger.warn("⚠️ Password reset event missing required fields");
    return;
  }

  try {
    logger.info(`🔑 Password reset requested: ${email || phone} (${userId})`);

    const { dispatchEvent } = require("../../services/dispatcher");

    const channels = {
      email: !!email,
      sms: !!phone,
      inApp: false // Usually password reset is external to app flow
    };

    await dispatchEvent({
      event: "user.password.reset",
      data: {
        email,
        phone,
        resetCode,
        userName: data.userName || 'User',
        ...data,
      },
      recipients: [userId],
      companyId,
      templateName: "password_reset",
      channels
    });

    logger.info(`✅ Password reset notification dispatched for user ${userId}`);
  } catch (error) {
    logger.error(`❌ Error creating password reset notification:`, error.message);
    throw error;
  }
}

/**
 * Handle user suspension
 */
async function handleUserSuspended(data) {
  const { userId, companyId, reason } = data;

  logger.warn(`⏸️ User suspended: ${userId} - ${reason}`);
  // Could send suspension notification
}

/**
 * Handle user deletion
 */
async function handleUserDeleted(data) {
  const { userId } = data;

  logger.info(`🗑️ User deleted: ${userId}`);
  // Could clean up user notifications
}

