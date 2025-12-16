// src/queue/workers.js
const Notification = require("../models/Notification");
const { getPreferences } = require("../services/preferenceService");
const { sendEmail } = require("../channels/email");
const { sendSMS } = require("../channels/sms");
const { sendPush } = require("../channels/push");
const {
  publishNotificationToWebSocket,
} = require("../services/websocketPublisher");
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

  const prefs = await getPreferences(userId, companyId);

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
  if (
    notification.channels.push &&
    prefs.push &&
    notification.payload.fcmToken
  ) {
    const result = await sendPush(
      notification,
      notification.payload.fcmToken,
      userId,
      companyId
    );
    results.push({ channel: "push", ...result });
    if (result.success) successes++;
  }

  // In-App (via WebSocket service)
  if (notification.channels.inApp && prefs.inApp) {
    const result = await publishNotificationToWebSocket(notification, userId);
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
