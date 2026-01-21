// src/queue/workers.js
const Notification = require("../models/Notification");
const { getPreferences } = require("../services/preferenceService");
const { sendEmail } = require("../channels/email");
const { sendSMS } = require("../channels/sms");
const { sendPush } = require("../channels/push");
const websocketPublisher = require("../services/websocketPublisher");
const { checkUserRateLimit } = require("../utils/rateLimiter");
const logger = require("../utils/logger");

const deliverNotification = async ({ notificationId }) => {
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new Error("Notification not found");
  }

  const userId = notification.userId ? notification.userId.toString() : null;
  const companyId = notification.companyId ? notification.companyId.toString() : null;

  // Check user rate limit
  if (userId) {
    const userRateLimitOk = await checkUserRateLimit(userId);
    if (!userRateLimitOk) {
      logger.warn(`User rate limit exceeded for user ${userId}`);
      notification.status = "failed";
      await notification.save();
      throw new Error("User rate limit exceeded");
    }
  }

  // Handle potential system/unknown companyId for preferences
  const prefCompanyId = (companyId === 'system' || companyId === 'unknown') ? null : companyId;

  let prefs;
  if (userId) {
    prefs = await getPreferences(userId, prefCompanyId);
  } else {
    // Default prefs for system/broadcast notifications where userId is unknown
    prefs = { email: true, sms: true, push: true, inApp: true };
  }

  // Force enable critical channels if prefs not found or empty
  if (!prefs) {
    logger.warn(`Preferences not found for user ${userId || 'unknown'}, using defaults`);
    prefs = { email: true, sms: true, push: true, inApp: true };
  }

  let successes = 0;
  const results = [];

  // Email
  if (
    notification.channels.email &&
    prefs.email &&
    notification.payload.email
  ) {
    const result = await sendEmail(
      notification,
      notification.payload.email,
      userId,
      companyId
    );
    results.push({ channel: "email", ...result });
    if (result.success) successes++;
  }

  // SMS
  if (notification.channels.sms && prefs.sms && notification.payload.phone) {
    const result = await sendSMS(
      notification,
      notification.payload.phone,
      userId,
      companyId
    );
    results.push({ channel: "sms", ...result });
    if (result.success) successes++;
  }

  // Push
  if (notification.channels.push && prefs.push) {
    // 1. Resolve recipients for Push (handles both personal and broadcast)
    let pushRecipients = [];
    if (userId) {
      pushRecipients = [userId];
    } else if (notification.scope !== 'personal' && notification.companyId) {
      const recipientResolver = require("../services/recipientResolver");
      try {
        const rolesMapping = await recipientResolver.resolveByRole(notification.templateName, {
          companyId: notification.companyId,
          shopId: notification.shopId,
          departmentId: notification.departmentId,
          roles: notification.roles
        });
        // Flatten all user IDs from all roles
        pushRecipients = [...new Set(Object.values(rolesMapping).flat())];
        logger.debug(`📢 Resolved ${pushRecipients.length} recipients for broadcast Push`);
      } catch (err) {
        logger.error(`❌ Failed to resolve recipients for broadcast Push: ${err.message}`);
      }
    }

    if (pushRecipients.length > 0) {
      // 2. Get tokens from DB for all recipients
      const UserDevice = require("../models/UserDevice");
      const devices = await UserDevice.find({
        userId: { $in: pushRecipients },
        isActive: true
      });

      // 3. Get tokens from payload (legacy/manual override)
      const payloadTokens = notification.payload.fcmToken
        ? (Array.isArray(notification.payload.fcmToken) ? notification.payload.fcmToken : [notification.payload.fcmToken])
        : [];

      // 4. Merge unique tokens, prefer DB user info
      const tokenMap = new Map();

      // Add DB tokens (have userId)
      devices.forEach(d => {
        tokenMap.set(d.fcmToken, { token: d.fcmToken, userId: d.userId });
      });

      // Add payload tokens (might not have userId, use main notification userId)
      payloadTokens.forEach(t => {
        if (!tokenMap.has(t)) {
          // For payload tokens, we use the main userId if available, or null
          tokenMap.set(t, { token: t, userId: userId });
        }
      });

      const allTargets = Array.from(tokenMap.values());

      if (allTargets.length > 0) {
        logger.debug(`📱 Sending push to ${allTargets.length} device(s) for ${pushRecipients.length} users`);

        for (const target of allTargets) {
          const { token, userId: targetUserId } = target;

          // Avoid sending to invalid/empty tokens
          if (!token) continue;

          const result = await sendPush(
            notification,
            token,
            targetUserId, // Use the specific user ID for this token if available
            companyId
          );

          // Check for invalid token errors and cleanup
          if (!result.success && result.error) {
            const errCode = result.error.code || result.error.errorInfo?.code;
            if (errCode === 'messaging/registration-token-not-registered' ||
              errCode === 'messaging/invalid-argument' ||
              result.error.message?.includes('Entity was not found')) {
              await UserDevice.deleteOne({ fcmToken: token });
              logger.info(`🗑️ Removed invalid FCM token: ${token}`);
            }
          }

          results.push({ channel: "push", ...result });
          if (result.success) successes++;
        }
      } else {
        logger.debug(`📭 No push tokens found for recipients`);
      }
    } else {
      logger.debug(`📭 No recipients resolved for Push`);
    }
  }

  // In-App (via WebSocket service)
  if (notification.channels.inApp && prefs.inApp) {
    let success = false;

    if (notification.scope !== 'personal') {
      // Use broadcast publisher for non-personal scopes (company, department, etc.)
      success = await websocketPublisher.publishBroadcast(notification);
    } else {
      // Direct personal message
      success = await websocketPublisher.publishNotification(notification);
    }

    const result = { success }; // normalize result structure
    results.push({ channel: "inApp", ...result });
    if (result.success) successes++;
  }

  // Update status
  const totalChannels = results.length;
  if (totalChannels === 0) {
    notification.status = "failed";
    logger.warn(`No channels enabled for notification ${notificationId}`);
  } else {
    notification.status =
      successes === totalChannels ? "sent" : successes > 0 ? "sent" : "failed";
  }

  await notification.save();

  logger.info(
    `✅ Delivery for ${notificationId}: ${successes}/${totalChannels} successful`
  );

  // Log detailed results
  results.forEach((result) => {
    if (result.rateLimited) {
      logger.warn(`⚠️  ${result.channel} rate limited`);
    } else if (result.circuitBreakerOpen) {
      logger.warn(`⚠️  ${result.channel} circuit breaker open`);
    } else if (!result.success) {
      logger.error(`❌ ${result.channel} failed: ${result.error}`);
    }
  });

  if (notification.status === "failed" && successes === 0) {
    throw new Error(`Delivery failed for all ${totalChannels} channels`);
  }

  return results;
};

module.exports = { deliverNotification };
