// src/channels/push.js
const messaging = require("../config/push");
const logger = require("../utils/logger");
const DeliveryLog = require("../models/DeliveryLog");
const { checkRateLimit } = require("../utils/rateLimiter");
const { createPushCircuitBreaker } = require("../utils/circuitBreaker");

/**
 * Core push notification sending function (wrapped by circuit breaker)
 */
const sendPushCore = async (notification, fcmToken, userId, companyId) => {
  const startTime = Date.now();

  try {
    // Get push-specific compiled content or fallback to legacy fields
    const pushContent = notification.getContentForChannel('push');

    let messagePayload;

    if (pushContent) {
      // Use compiled push template content
      messagePayload = {
        notification: {
          title: pushContent.title,
          body: pushContent.body,
        },
        data: {
          notificationId: notification._id.toString(),
          ...(pushContent.data || {}),
          ...notification.payload, // Merge with original payload
        },
        token: fcmToken,
      };

      // Add push-specific options
      if (pushContent.sound && pushContent.sound !== 'default') {
        messagePayload.notification.sound = pushContent.sound;
      }

      if (pushContent.badge) {
        messagePayload.notification.badge = pushContent.badge.toString();
      }

      // Set priority
      if (pushContent.priority === 'high') {
        messagePayload.android = {
          priority: 'high',
        };
        messagePayload.apns = {
          headers: {
            'apns-priority': '10',
          },
        };
      }

      // Add category for iOS
      if (pushContent.category) {
        messagePayload.apns = {
          ...messagePayload.apns,
          payload: {
            aps: {
              category: pushContent.category,
            },
          },
        };
      }
    } else {
      // Fallback to legacy fields
      messagePayload = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          notificationId: notification._id.toString(),
          ...notification.payload,
        },
        token: fcmToken,
      };
      logger.warn(`No push template found for notification ${notification._id}, using legacy fields`);
    }

    const response = await messaging.send(messagePayload);
    const responseTime = Date.now() - startTime;

    logger.info(
      `✅ Push sent to token ${fcmToken.substring(
        0,
        10
      )}... in ${responseTime}ms (Title: ${messagePayload.notification.title})`
    );

    return {
      success: true,
      providerId: response, // Firebase message ID
      responseTime,
      recipient: fcmToken,
      title: messagePayload.notification.title
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error("❌ Push send error:", error);

    throw {
      success: false,
      error,
      responseTime,
      recipient: fcmToken,
    };
  }
};

// Wrap with circuit breaker
const pushCircuitBreaker = createPushCircuitBreaker(sendPushCore);

/**
 * Send push notification with rate limiting, circuit breaker, and delivery logging
 */
const sendPush = async (notification, fcmToken, userId, companyId) => {
  // Create delivery log
  const deliveryLog = await DeliveryLog.createLog({
    notificationId: notification._id,
    channel: "push",
    userId,
    companyId,
    provider: "firebase",
    recipient: fcmToken,
  });

  try {
    // Check rate limit
    const rateLimitOk = await checkRateLimit("push", companyId);
    if (!rateLimitOk) {
      const error = new Error("Rate limit exceeded for push channel");
      error.code = "RATE_LIMIT_EXCEEDED";
      await DeliveryLog.markAsFailed(
        deliveryLog._id,
        error,
        new Date(Date.now() + 60000)
      );
      return { success: false, rateLimited: true };
    }

    // Send via circuit breaker
    const result = await pushCircuitBreaker.fire(
      notification,
      fcmToken,
      userId,
      companyId
    );

    if (result.success) {
      await DeliveryLog.markAsSent(
        deliveryLog._id,
        result.providerId,
        result.responseTime
      );
      return { success: true, logId: deliveryLog._id };
    } else if (result.fallback) {
      const error = new Error(result.error);
      error.code = "CIRCUIT_BREAKER_OPEN";
      await DeliveryLog.markAsFailed(
        deliveryLog._id,
        error,
        new Date(Date.now() + 300000)
      );
      return { success: false, circuitBreakerOpen: true };
    }
  } catch (error) {
    const log = await DeliveryLog.findById(deliveryLog._id);
    const nextRetryAt = log.canRetry() ? log.calculateNextRetry() : null;

    await DeliveryLog.markAsFailed(
      deliveryLog._id,
      error.error || error,
      nextRetryAt
    );
    return { success: false, error: error.message, logId: deliveryLog._id };
  }
};

module.exports = { sendPush, pushCircuitBreaker };
