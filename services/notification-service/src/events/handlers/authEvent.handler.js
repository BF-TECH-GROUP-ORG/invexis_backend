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

      case "verification.requested":
        await handleVerificationRequested(data);
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
  const { userId, email, phone, companyId, preferences } = data;

  if (!userId || !email) {
    logger.warn("⚠️ User created event missing required fields");
    return;
  }

  try {
    logger.info(`👤 New user created: ${email} (${userId})`);

    const { dispatchEvent } = require("../../services/dispatcher");

    // Default preferences if not provided
    const userPrefs = preferences || {};
    const notifPrefs = userPrefs.notifications || {};

    // Determine channels based on preferences
    const channels = [];

    // Email enabled by default if not explicitly disabled
    if (!!email && (notifPrefs.email !== false)) {
      channels.push('email');
    }

    // Always enable In-App
    channels.push('in-app');

    // SMS disabled by default unless explicitly enabled OR if password delivery is required
    // "Refining Password & SMS Delivery": ensure auto-generated password is sent via SMS
    const shouldSendSms = !!phone && (
      notifPrefs.sms === true ||
      (!!data.password && true) // Explicitly allow SMS for password delivery
    );

    if (shouldSendSms) {
      channels.push('sms');
    }

    if (!phone) {
      logger.warn(`⚠️ No phone number for user ${userId}, SMS skipped`);
    }

    // Determine greeting based on gender
    let title = "";
    if (data.gender) {
      const lowerGender = data.gender.toLowerCase();
      if (lowerGender === 'm' || lowerGender === 'male') title = "Mr.";
      else if (lowerGender === 'f' || lowerGender === 'female') title = "Ms.";
    }

    // Select template: 'welcome' (with password) or 'welcome_manual' (no password)
    const templateName = data.password ? "welcome" : "welcome_manual";

    await dispatchEvent({
      event: "user.created",
      data: {
        email,
        phone,
        title, // Pass title to template
        userName: data.userName || data.firstName || "User",
        ...data,
      },
      recipients: [userId],
      companyId,
      templateName,
      channels
    });

    logger.info(`✅ User creation notification dispatched for user ${userId}`);
  } catch (error) {
    logger.error(`❌ Error creating user notification:`, error.message);
    throw error;
  }
}

/**
 * Handle verification request (OTP)
 */
async function handleVerificationRequested(data) {
  const { userId, type, details, otp, preferences, role } = data;
  const { email, phone } = details || {};

  if (!userId || !otp) {
    logger.warn("⚠️ Verification event missing required fields");
    return;
  }

  try {
    logger.info(`🔐 Verification requested for ${userId} via ${type}`);

    const { dispatchEvent } = require("../../services/dispatcher");

    // Default preferences
    const userPrefs = preferences || {};
    const notifPrefs = userPrefs.notifications || {};

    // Precise channel selection for OTP
    const channels = ['in-app']; // Always send real-time OTP

    // Email
    if ((type === 'email' || type === 'both') && !!email && (notifPrefs.email !== false)) {
      channels.push('email');
    }
    // Force email if explicitly requested
    if (type === 'email' && !channels.includes('email') && !!email) {
      channels.push('email');
    }

    // SMS
    // If user requested phone verification, we MUST send SMS regardless of general preference
    const shouldSendSms = !!phone && (type === 'phone' || type === 'both' || notifPrefs.sms === true);

    if (shouldSendSms) {
      channels.push('sms');
    }

    await dispatchEvent({
      event: "verification.requested",
      data: {
        otp,
        email,
        phone,
        role,
        ...data,
        companyId: data.companyId || 'system'
      },
      companyId: data.companyId || 'system',
      recipients: [userId],
      templateName: "otp",
      channels
    });

    logger.info(`✅ Verification (${type}) dispatched for user ${userId}. Channels: ${JSON.stringify(channels)}`);
  } catch (error) {
    logger.error(`❌ Error dispatching verification:`, error.message);
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

    const channels = [];
    if (!!email) channels.push('email');
    if (!!phone) channels.push('sms');
    // usually password reset is external to app flow, but we can keep in-app if needed. logic said 'false' before.
    // channels.inApp = false;

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

