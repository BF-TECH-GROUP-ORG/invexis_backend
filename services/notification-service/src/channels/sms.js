// src/channels/sms.js
const client = require("../config/sms");
const logger = require("../utils/logger");
const DeliveryLog = require("../models/DeliveryLog");
const { checkRateLimit } = require("../utils/rateLimiter");
const { createSMSCircuitBreaker } = require("../utils/circuitBreaker");

/**
 * Core SMS sending function (wrapped by circuit breaker)
 */
const sendSMSCore = async (notification, phoneNumber, userId, companyId) => {
  const startTime = Date.now();

  try {
    const message = await client.messages.create({
      body: `${notification.title}: ${notification.body.substring(0, 160)}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    const responseTime = Date.now() - startTime;
    logger.info(`✅ SMS sent to ${phoneNumber} in ${responseTime}ms`);

    return {
      success: true,
      providerId: message.sid,
      responseTime,
      recipient: phoneNumber,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error("❌ SMS send error:", error);

    throw {
      success: false,
      error,
      responseTime,
      recipient: phoneNumber,
    };
  }
};

// Wrap with circuit breaker
const smsCircuitBreaker = createSmsCircuitBreaker(sendSMSCore);

/**
 * Send SMS with rate limiting, circuit breaker, and delivery logging
 */
const sendSMS = async (notification, phoneNumber, userId, companyId) => {
  // Create delivery log
  const deliveryLog = await DeliveryLog.createLog({
    notificationId: notification._id,
    channel: "sms",
    userId,
    companyId,
    provider: "twilio",
    recipient: phoneNumber,
  });

  try {
    // Check rate limit
    const rateLimitOk = await checkRateLimit("sms", companyId);
    if (!rateLimitOk) {
      const error = new Error("Rate limit exceeded for SMS channel");
      error.code = "RATE_LIMIT_EXCEEDED";
      await DeliveryLog.markAsFailed(
        deliveryLog._id,
        error,
        new Date(Date.now() + 60000)
      );
      return { success: false, rateLimited: true };
    }

    // Send via circuit breaker
    const result = await smsCircuitBreaker.fire(
      notification,
      phoneNumber,
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

module.exports = { sendSMS, smsCircuitBreaker };
