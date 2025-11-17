// src/channels/email.js
const transporter = require("../config/email");
const logger = require("../utils/logger");
const DeliveryLog = require("../models/DeliveryLog");
const { checkRateLimit } = require("../utils/rateLimiter");
const { createEmailCircuitBreaker } = require("../utils/circuitBreaker");

/**
 * Core email sending function (wrapped by circuit breaker)
 */
const sendEmailCore = async (notification, userEmail, userId, companyId) => {
  const startTime = Date.now();

  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: userEmail,
      subject: notification.title,
      html: notification.body,
    };

    const info = await transporter.sendMail(mailOptions);
    const responseTime = Date.now() - startTime;

    logger.info(`✅ Email sent to ${userEmail} in ${responseTime}ms`);

    return {
      success: true,
      providerId: info.messageId,
      responseTime,
      recipient: userEmail,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error("❌ Email send error:", error);

    throw {
      success: false,
      error,
      responseTime,
      recipient: userEmail,
    };
  }
};

// Wrap with circuit breaker
const emailCircuitBreaker = createEmailCircuitBreaker(sendEmailCore);

/**
 * Send email with rate limiting, circuit breaker, and delivery logging
 */
const sendEmail = async (notification, userEmail, userId, companyId) => {
  // Create delivery log
  const deliveryLog = await DeliveryLog.createLog({
    notificationId: notification._id,
    channel: "email",
    userId,
    companyId,
    provider: "gmail",
    recipient: userEmail,
  });

  try {
    // Check rate limit
    const rateLimitOk = await checkRateLimit("email", companyId);
    if (!rateLimitOk) {
      const error = new Error("Rate limit exceeded for email channel");
      error.code = "RATE_LIMIT_EXCEEDED";
      await DeliveryLog.markAsFailed(
        deliveryLog._id,
        error,
        new Date(Date.now() + 60000)
      );
      return { success: false, rateLimited: true };
    }

    // Send via circuit breaker
    const result = await emailCircuitBreaker.fire(
      notification,
      userEmail,
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
      // Circuit breaker fallback
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
    // Calculate next retry time with exponential backoff
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

module.exports = { sendEmail, emailCircuitBreaker };
