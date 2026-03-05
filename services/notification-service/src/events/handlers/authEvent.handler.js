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
        console.log(`👤 [AuthHandler] Matched user.created case, calling handleUserCreated`);
        await handleUserCreated(data);
        console.log(`👤 [AuthHandler] handleUserCreated completed`);
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

      case "auth.device.updated":
        await handleDeviceUpdated(data);
        break;

      case "verification.requested":
        await handleVerificationRequested(data);
        break;

      case "auth.verification.requested":
        // Alias for verification.requested from auth-service
        await handleVerificationRequested(data);
        break;

      case "user.registered":
      case "auth.user.registered":
        await handleUserRegistered(data);
        break;

      case "customer.registered":
      case "auth.customer.registered":
        await handleCustomerRegistered(data);
        break;

      case "auth.session.created":
        // Session creation - notify user their session is active (optional)
        await handleSessionCreated(data);
        break;

      case "auth.session.refreshed":
        // Ignore this event, it's just noise
        break;

      default:
        logger.warn(`⚠️ Unhandled auth event type: ${type}`, { eventType: type, dataKeys: Object.keys(data || {}) });
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
  console.log(`👤 [handleUserCreated] ENTRY - userId: ${data.userId}, email: ${data.email}`);
  const { userId, email, phone, preferences, companies } = data;
  let { companyId } = data;

  // Derive companyId from companies array if missing (for auth-service compatibility)
  if (!companyId && Array.isArray(companies) && companies.length > 0) {
    companyId = companies[0].toString();
  }

  if (!userId || !email) {
    console.log(`⚠️  [handleUserCreated] Missing required fields - userId: ${userId}, email: ${email}`);
    logger.warn("⚠️ User created event missing required fields");
    return;
  }

  try {
    console.log(`👤 [handleUserCreated] Processing user: ${email} (${userId}), companyId: ${companyId || 'NONE'}`);
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
    channels.push('inApp');

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

    // 2. Notify Company Admin (Broadcast)
    if (companyId && companyId !== 'system') {
      const { dispatchBroadcastEvent } = require("../../services/dispatcher");
      await dispatchBroadcastEvent({
        event: "user.created",
        data: {
          userName: data.userName || data.firstName || "User",
          performedByName: data.performedByName || "Admin",
          ...data
        },
        companyId,
        templateName: "user.created",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin"]
      });
    }

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
    const channels = ['inApp']; // Always send real-time OTP

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
  const { userId, email, companyId } = data;

  logger.info(`✅ User verified: ${email} (${userId})`);

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    if (companyId && companyId !== 'system') {
      await dispatchBroadcastEvent({
        event: "user.verified",
        data: {
          userId,
          email,
          ...data
        },
        companyId,
        templateName: "user.verified",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin"]
      });
    }
  } catch (err) {
    logger.error(`❌ Error in handleUserVerified:`, err.message);
  }
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
  const { userId, companyId, reason, performedByName } = data;

  logger.warn(`⏸️ User suspended: ${userId} - ${reason}`);

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    if (companyId && companyId !== 'system') {
      await dispatchBroadcastEvent({
        event: "user.suspended",
        data: {
          userId,
          reason: reason || "No reason provided",
          performedByName: performedByName || "Admin",
          ...data
        },
        companyId,
        templateName: "user.suspended",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin"]
      });
    }
  } catch (err) {
    logger.error(`❌ Error in handleUserSuspended:`, err.message);
  }
}

/**
 * Handle user deletion
 */
async function handleUserDeleted(data) {
  const { userId, companyId, performedByName } = data;

  logger.info(`🗑️ User deleted: ${userId}`);

  try {
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    if (companyId && companyId !== 'system') {
      await dispatchBroadcastEvent({
        event: "user.deleted",
        data: {
          userId,
          performedByName: performedByName || "Admin",
          ...data
        },
        companyId,
        templateName: "user.deleted",
        channels: ["inApp", "push"],
        scope: "company",
        roles: ["company_admin"]
      });
    }
  } catch (err) {
    logger.error(`❌ Error in handleUserDeleted:`, err.message);
  }
}

/**
 * Handle user device updated (FCM tokens)
 */
async function handleDeviceUpdated(data) {
  const { userId, fcmToken, deviceType, deviceName } = data;

  if (!userId || !fcmToken) {
    logger.warn("⚠️ Device updated event missing required fields");
    return;
  }

  try {
    const UserDevice = require("../../models/UserDevice");

    // Upsert the device token
    // Using fcmToken as the unique key to prevent duplicates
    await UserDevice.findOneAndUpdate(
      { fcmToken },
      {
        userId,
        deviceType: deviceType || 'web',
        deviceName: deviceName || 'Unknown',
        isActive: true,
        lastActiveAt: new Date()
      },
      { upsert: true, new: true }
    );

    logger.info(`📱 Device registered/updated for user ${userId}: ${fcmToken.substring(0, 10)}...`);
  } catch (error) {
    logger.error(`❌ Error updating user device: ${error.message}`);
  }
}

/**
 * Handle user registration (confirmed)
 */
async function handleUserRegistered(data) {
  const { userId, email, role, companyId } = data;

  if (!userId || !email) {
    logger.warn("⚠️ User registered event missing required fields");
    return;
  }

  try {
    logger.info(`✅ User registered: ${email} (${userId}) as ${role}`);
    // User registered is an internal event - typically handled by auth-service
    // Just log it for audit trail
  } catch (error) {
    logger.error(`❌ Error handling user registered:`, error.message);
  }
}

/**
 * Handle customer registration (confirmed)
 */
async function handleCustomerRegistered(data) {
  const { userId, email, companyId } = data;

  if (!userId || !email) {
    logger.warn("⚠️ Customer registered event missing required fields");
    return;
  }

  try {
    logger.info(`✅ Customer registered: ${email} (${userId})`);
    // Customer registered is confirmed - typically handled by auth-service
    // Just log for audit trail
  } catch (error) {
    logger.error(`❌ Error handling customer registered:`, error.message);
  }
}

/**
 * Handle session creation
 */
async function handleSessionCreated(data) {
  const { userId, sessionId, deviceId, ip } = data;

  if (!userId || !sessionId) {
    logger.warn("⚠️ Session created event missing required fields");
    return;
  }

  try {
    logger.info(`🔐 Session created for user ${userId}`, { deviceId, ip });
    // Session creation events don't typically need notifications
    // Just log for audit trail
  } catch (error) {
    logger.error(`❌ Error handling session created:`, error.message);
  }
}
