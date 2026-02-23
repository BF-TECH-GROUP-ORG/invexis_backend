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

      case "company.onboarding_ready":
        await handleCompanyOnboardingReady(data);
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

      case "subscription.expiring.soon":
      case "subscription.expired":
        logger.info(`🔔 Subscription event received for processing: ${type}`);
        // Routed via platformEvent.handler to here, then usually to notificationProcessor
        // If we want specific logic here before processor, we add it. 
        // For now, let's just let it fall through or log.
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

  if (!companyId || !adminId) {
    logger.warn("⚠️ Company created event missing required fields");
    return;
  }

  try {
    logger.info(`🎉 New company created: ${name} (${companyId})`);

    const { dispatchEvent } = require("../../services/dispatcher");

    // Determine which channels to enable based on available contact info
    const channels = ['inApp'];
    if (email) channels.push('email');
    if (phone) channels.push('sms');
    if (fcmToken) channels.push('push');

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

    // Notify Super Admin about the new company
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");
    await dispatchBroadcastEvent({
      event: "company.created",
      companyId: "system", // Scope for super admins
      data: {
        companyName: name,
        companyId,
        adminEmail: email,
        userName: name,
        ...data
      },
      roles: ["super_admin"],
      templateName: "company.created.admin",
      channels: ["push", "inApp", "email"]
    });

    logger.info(`✅ Welcome notification and Super Admin alert dispatched for company ${companyId}`);
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

  try {
    logger.info(`📝 Company updated: ${name} (${companyId})`);
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "company.updated",
      companyId,
      data: {
        companyName: name,
        ...data
      },
      roles: ["company_admin"],
      templateName: "company.updated",
      channels: ["push", "inApp"]
    });
  } catch (error) {
    logger.error(`❌ Error dispatching company update notification: ${error.message}`);
  }
}

/**
 * Handle company status change
 */
async function handleCompanyStatusChanged(data) {
  const { companyId, status, name } = data;

  try {
    logger.info(`🔄 Company status changed: ${companyId} -> ${status}`);
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "company.status.changed",
      companyId,
      data: {
        companyName: name || companyId,
        status,
        ...data
      },
      roles: ["company_admin"],
      templateName: "company.status.changed",
      channels: ["push", "inApp"]
    });
  } catch (error) {
    logger.error(`❌ Error dispatching company status change notification: ${error.message}`);
  }
}

/**
 * Handle company suspension
 */
async function handleCompanySuspended(data) {
  const { companyId, name, reason } = data;

  try {
    logger.info(`⏸️ Company suspended: ${companyId}`);
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    await dispatchBroadcastEvent({
      event: "company.suspended",
      companyId,
      data: {
        companyName: name || companyId,
        reason: reason || "Administrative decision",
        ...data
      },
      roles: ["company_admin", "super_admin"],
      templateName: "company.suspended",
      channels: ["push", "inApp", "email"]
    });
  } catch (error) {
    logger.error(`❌ Error dispatching company suspension notification: ${error.message}`);
  }
}

/**
 * Handle company deletion
 */
async function handleCompanyDeleted(data) {
  const { companyId, name } = data;

  try {
    logger.info(`🗑️ Company deleted: ${companyId}`);
    const { dispatchBroadcastEvent } = require("../../services/dispatcher");

    // For deletion, we mostly notify super admins as the company admins might be gone
    await dispatchBroadcastEvent({
      event: "company.deleted",
      companyId: "system", // Use system scope for global deletion alert
      data: {
        companyName: name || companyId,
        companyId,
        ...data
      },
      roles: ["super_admin"],
      templateName: "company.deleted",
      channels: ["push", "inApp"]
    });
  } catch (error) {
    logger.error(`❌ Error dispatching company deletion notification: ${error.message}`);
  }
}

/**
 * Handle company onboarding ready - Send link
 */
async function handleCompanyOnboardingReady(data) {
  const { companyId, name, adminId, email, onboardingLink } = data;

  if (!email || !onboardingLink) {
    logger.warn(`⚠️ Onboarding event missing email or link for company ${companyId}`);
    return;
  }

  try {
    logger.info(`📧 Sending onboarding link to ${email} for company ${companyId}`);

    const { dispatchEvent } = require("../../services/dispatcher");

    await dispatchEvent({
      event: "company.onboarding_ready",
      data: {
        email,
        companyName: name,
        onboardingLink,
        ...data
      },
      recipients: [adminId],
      companyId,
      templateName: "stripe.onboarding",
      channels: ["email", "inApp"]
    });

    logger.info(`✅ Onboarding email dispatched for company ${companyId}`);
  } catch (error) {
    logger.error(`❌ Error sending onboarding email:`, error.message);
    throw error;
  }
}
