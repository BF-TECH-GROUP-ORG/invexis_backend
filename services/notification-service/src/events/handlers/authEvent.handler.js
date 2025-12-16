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
    const channels = {
      // Email enabled by default if not explicitly disabled
      email: !!email && (notifPrefs.email !== false),
      inApp: true,
      // SMS disabled by default unless explicitly enabled
      sms: !!phone && (notifPrefs.sms === true)
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
    const channels = {
      inApp: true, // Always send real-time OTP
      email: type === 'email' && !!email && (notifPrefs.email !== false),
      sms: type === 'phone' && !!phone // SMS mandates explicit phone verification flow, usually overrides pref if it's the requested method, but adhering to pref-aware logic:
      // If user requested phone verification, we MUST send SMS regardless of general preference? 
      // Logic: If I click "Verify Phone", I expect an SMS. 
      // So for verification.requested where type IS phone, we force SMS true.
      // But let's respect the "preference-based" request from user prompt. 
      // Prompt says: "send them those otps for them to verify based on preferences"
      // AND "inApp needs to be in realtime... all other user types need to verify either one of phone or email".
      // If I request phone verification, I implicitly want an SMS. Use type-based logic + preferences fallback.
    };

    // Force channel if it matches the verification type requested
    if (type === 'email') channels.email = true;
    if (type === 'phone') channels.sms = true;

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

