// src/channels/sms.js
const client = require("../config/sms");
const logger = require("../utils/logger");
const DeliveryLog = require("../models/DeliveryLog");
const { checkRateLimit } = require("../utils/rateLimiter");
const { createSmsCircuitBreaker } = require("../utils/circuitBreaker");
const { getSmsMessage, hasTemplate } = require("../config/smsTemplates");

/**
 * Core SMS sending function (wrapped by circuit breaker)
 */
const sendSMSCore = async (notification, phoneNumber, userId, companyId) => {

  const startTime = Date.now();

  try {

    let messageBody;

    // Use the new simple template system
    if (notification.templateName && hasTemplate(notification.templateName)) {
      messageBody = getSmsMessage(
        notification.templateName,
        notification.payload || {},
        { maxLength: 160, truncate: true }
      );
      logger.info(`✅ Using SMS template: ${notification.templateName}`);
    } else if (notification.compiledContent?.sms?.message) {
      // Support legacy compiled content if it exists
      messageBody = notification.compiledContent.sms.message;
      logger.info(`Using legacy compiled SMS content`);
    } else {
      // Final fallback to legacy title + body fields
      const title = notification.title || '';
      const body = notification.body || '';
      const combined = title ? `${title}: ${body}` : body;
      messageBody = combined.length > 160 ? combined.substring(0, 157) + '...' : combined;
      logger.warn(`No SMS template found for ${notification.templateName}, using legacy fields`);
    }

    // Validate message
    if (!messageBody || messageBody.trim().length === 0) {
      throw new Error('SMS message body is empty');
    }

    const messageOptions = {
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    };

    // Send via Twilio
    const message = await client.messages.create(messageOptions);
    const responseTime = Date.now() - startTime;

    logger.info(`✅ SMS sent to ${phoneNumber} in ${responseTime}ms (${messageBody.length} chars)`);
    logger.debug(`SMS content: "${messageBody}"`);

    return {
      success: true,
      providerId: message.sid,
      responseTime,
      recipient: phoneNumber,
      messageLength: messageBody.length,
      message: messageBody
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

}

// Wrap with circuit breaker
const smsCircuitBreaker = createSmsCircuitBreaker(sendSMSCore);

/**
 * Send SMS with rate limiting, circuit breaker, and delivery logging
 */
const sendSMS = async (notification, phoneNumber, userId, companyId) => {
  // Validate phone number
  if (!phoneNumber) {
    logger.warn('⚠️ Cannot send SMS: phone number is missing');
    return { success: false, error: 'Phone number is required' };
  }

  // Debug: Log raw phone number and character codes
  logger.debug(`Raw phone number: "${phoneNumber}"`);
  logger.debug(`Char codes: ${Array.from(phoneNumber).map(c => c.charCodeAt(0)).join(',')}`);

  // Normalize: remove all non-digits except leading +
  const originalPhone = phoneNumber;
  phoneNumber = phoneNumber.replace(/[^\d+]/g, '');

  // Handle common international dialing prefix '00' (e.g., 0025078... -> +25078...)
  if (phoneNumber.startsWith('00')) {
    phoneNumber = '+' + phoneNumber.substring(2);
  }

  // Handle local Rwanda format (07... -> +2507...)
  if (phoneNumber.startsWith('0') && phoneNumber.length === 10) {
    phoneNumber = '+250' + phoneNumber.substring(1);
  } else if (!phoneNumber.startsWith('+') && phoneNumber.length === 9) {
    // e.g., 781234567 -> +250781234567
    phoneNumber = '+250' + phoneNumber;
  } else if (!phoneNumber.startsWith('+') && phoneNumber.length >= 10 && phoneNumber.length <= 15) {
    // Auto-prepend '+' if the user provided country code but forgot the plus sign.
    // Covers cases like 25078XXXXXXX (12 chars), 2547XXXXXXXX (12 chars), 1415XXXXXXX (11 chars)
    phoneNumber = '+' + phoneNumber;
  }

  // Basic E.164 validation
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    logger.warn(`⚠️ Invalid phone number format: ${phoneNumber} (original: ${originalPhone})`);
    return { success: false, error: `Invalid phone number format: ${phoneNumber}` };
  }

  // Rwanda specific checks
  if (phoneNumber.startsWith('+250')) {
    const afterPrefix = phoneNumber.substring(4);
    // Rwandan mobile numbers usually start with 7
    if (afterPrefix.startsWith('5')) {
      logger.warn(`⚠️ Rwandan phone number ${phoneNumber} starts with '5', which is likely invalid for mobile. Did you mean 7?`);
      return { success: false, error: `Invalid Rwandan mobile prefix (started with 5): ${phoneNumber}` };
    }

    if (phoneNumber.length !== 13) {
      const actualAfter = phoneNumber.length - 4;
      logger.warn(`⚠️ Rwandan phone number ${phoneNumber} has invalid length (${actualAfter} digits after +250, expected 9). If you have 10 digits, please check for a typo.`);
      return { success: false, error: `Invalid Rwandan phone number length: ${phoneNumber}` };
    }
  }

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
        new Date(Date.now() + 60000) // Retry after 1 minute
      );
      logger.warn(`⚠️ SMS rate limit exceeded for company ${companyId}`);
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
      return {
        success: true,
        logId: deliveryLog._id,
        messageId: result.providerId,
        messageLength: result.messageLength
      };
    } else if (result.fallback) {
      const error = new Error(result.error);
      error.code = "CIRCUIT_BREAKER_OPEN";
      await DeliveryLog.markAsFailed(
        deliveryLog._id,
        error,
        new Date(Date.now() + 300000) // Retry after 5 minutes
      );
      logger.warn(`⚠️ SMS circuit breaker open for company ${companyId}`);
      return { success: false, circuitBreakerOpen: true, error: 'SMS circuit breaker is open (service potentially down or misconfigured)' };
    }
  } catch (error) {
    const log = await DeliveryLog.findById(deliveryLog._id);

    // Do not retry client/validation errors (4xx) as they are permanent
    const isClientError = error.error && (error.error.status < 500 || error.error.code === 21608 || error.error.code === 21211);
    const nextRetryAt = (log.canRetry() && !isClientError) ? log.calculateNextRetry() : null;

    await DeliveryLog.markAsFailed(
      deliveryLog._id,
      error.error || error,
      nextRetryAt
    );

    const errorMessage = error.message || (error.error && error.error.message) || 'Unknown SMS error';
    logger.error(`❌ Failed to send SMS to ${phoneNumber}:`, errorMessage);
    return { success: false, error: errorMessage, logId: deliveryLog._id };
  }
}

module.exports = { sendSMS , smsCircuitBreaker } 