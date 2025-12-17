"use strict";

const Notification = require("../../models/Notification");
const notificationQueue = require("../../config/queue");
const logger = require("../../utils/logger");

/**
 * Handles company lifecycle events
 * @param {Object} event - The company event
 * @param {string} routingKey - Event routing key
 */
module.exports = async function handleCompanyEvent(event, routingKey) {
  try {
    const { type, data } = event;

    logger.info(`🏢 Processing company event: ${type}`, data);

    switch (type) {
      case "company.created":
        await handleCompanyCreated(data);
        break;

      case "company.updated":
        await handleCompanyUpdated(data);
        break;

      case "company.status.changed":
        await handleCompanyStatusChanged(data);
        break;

      case "company.suspended":
        await handleCompanySuspended(data);
        break;

      case "company.deleted":
        await handleCompanyDeleted(data);
        break;

      default:
        logger.warn(`⚠️ Unhandled company event type: ${type}`);
    }
  } catch (error) {
    const errorMsg = error && typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error);
    logger.error(`❌ Error handling company event: ${errorMsg}`);
    throw error;
  }
};

/**
 * Handle company creation - Send welcome notification
 */
async function handleCompanyCreated(data) {
  const { companyId, name, adminId, email, phone, fcmToken } = data;
  console.log(data)
  if (!companyId || !adminId) {
    logger.warn("⚠️ Company created event missing required fields");
    return;
  }

  try {
    logger.info(`🎉 New company created: ${name} (${companyId})`);

    const { dispatchEvent } = require("../../services/dispatcher");

    // Determine which channels to enable based on available contact info
    const channels = {
      email: !!email,     // Enable email if email exists
      inApp: true,        // Always enable in-app
      sms: !!phone,       // Enable SMS only if phone exists
      push: !!fcmToken    // Enable push if FCM token exists
    };

    if (!phone) {
      logger.warn(`⚠️ No phone number provided for company ${companyId}, SMS will be skipped`);
    }
    if (!email) {
      logger.warn(`⚠️ No email provided for company ${companyId}, email will be skipped`);
    }
    if (!fcmToken) {
      logger.warn(`⚠️ No FCM token provided for company ${companyId}, push will be skipped`);
    }

    await dispatchEvent({
      event: "company.created",
      data: {
        email: email,
        phone: phone,        // Include phone number in payload
        fcmToken: fcmToken,  // Include FCM token in payload
        companyName: name,
        userName: name,  // Use company name as username for welcome message
        supportEmail: process.env.SUPPORT_EMAIL || 'support@invexis.com',
        ...data,
      },
      recipients: [adminId],
      companyId,
      templateName: "welcome",
      channels
    });

    logger.info(`✅ Welcome notification dispatched for company ${companyId} (channels: ${Object.keys(channels).filter(k => channels[k]).join(', ')})`);
  } catch (error) {
    logger.error(`❌ Error creating welcome notification:`, error.message);
    throw error;
  }
}

/**
 * Handle company update
 */
async function handleCompanyUpdated(data) {
  const { companyId, name } = data;

  logger.info(`📝 Company updated: ${name} (${companyId})`);
  // Could send notification to admins about profile update
}

/**
 * Handle company status change
 */
async function handleCompanyStatusChanged(data) {
  const { companyId, status } = data;

  logger.info(`🔄 Company status changed: ${companyId} -> ${status}`);
  // Could send notification about status change
}

/**
 * Handle company suspension
 */
async function handleCompanySuspended(data) {
  const { companyId } = data;

  logger.info(`⏸️ Company suspended: ${companyId}`);
  // Could send notification about suspension
}

/**
 * Handle company deletion
 */
async function handleCompanyDeleted(data) {
  const { companyId } = data;

  logger.info(`🗑️ Company deleted: ${companyId}`);
  // Could clean up notifications for this company
}

