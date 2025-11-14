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
    logger.error(`❌ Error handling company event: ${error.message}`);
    throw error;
  }
};

/**
 * Handle company creation - Send welcome notification
 */
async function handleCompanyCreated(data) {
  const { companyId, name, adminId } = data;

  if (!companyId || !adminId) {
    logger.warn("⚠️ Company created event missing required fields");
    return;
  }

  try {
    logger.info(`🎉 New company created: ${name} (${companyId})`);

    const notification = await Notification.create({
      companyId,
      userId: adminId,
      type: "welcome",
      title: "Welcome to Invexis",
      body: `Welcome ${name}! Your account is ready. Start managing your inventory and sales.`,
      scope: "personal",
      channels: { email: true, push: true, inApp: true },
      payload: {
        email: data.email,
        companyName: name,
        ...data,
      },
    });

    await notificationQueue.add("deliver", { notificationId: notification._id });
    logger.info(`✅ Welcome notification queued for company ${companyId}`);
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

