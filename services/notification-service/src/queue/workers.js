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

  const userId = notification.userId.toString();
  const companyId = notification.companyId.toString();

  // Check user rate limit
  const userRateLimitOk = await checkUserRateLimit(userId);
  if (!userRateLimitOk) {
    logger.warn(`User rate limit exceeded for user ${userId}`);
    notification.status = "failed";
    await notification.save();
    throw new Error("User rate limit exceeded");
  }

  // Handle potential system/unknown companyId for preferences
  const prefCompanyId = (companyId === 'system' || companyId === 'unknown') ? null : companyId;
  let prefs = await getPreferences(userId, prefCompanyId); // Changed to let

  // Force enable critical channels if prefs not found or empty
  if (!prefs) {
    logger.warn(`Preferences not found for user ${userId}, using defaults`);
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
    // 1. Get tokens from DB
    const UserDevice = require("../models/UserDevice");
    const devices = await UserDevice.find({ userId, isActive: true });

    // 2. Get tokens from payload (legacy/manual override)
    const payloadTokens = notification.payload.fcmToken
      ? (Array.isArray(notification.payload.fcmToken) ? notification.payload.fcmToken : [notification.payload.fcmToken])
      : [];

    // 3. Merge unique tokens
    const dbTokens = devices.map(d => d.fcmToken);
    const allTokens = [...new Set([...payloadTokens, ...dbTokens])];

    if (allTokens.length > 0) {
      logger.debug(`📱 Sending push to ${allTokens.length} device(s) for user ${userId}`);

      for (const token of allTokens) {
        // Avoid sending to invalid/empty tokens
        if (!token) continue;

        const result = await sendPush(
          notification,
          token,
          userId,
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
      logger.debug(`📭 No push tokens found for user ${userId}`);
    }
  }

  // In-App (via WebSocket service)
  if (notification.channels.inApp && prefs.inApp) {
    const success = await websocketPublisher.publishNotification(notification);
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
