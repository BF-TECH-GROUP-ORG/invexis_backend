// src/services/websocketPublisher.js
const { emit } = require("../events/producer");
const logger = require("../utils/logger");

/**
 * Publish notification event to WebSocket service via RabbitMQ
 * WebSocket service listens to 'realtime.notification' events
 */
async function publishNotificationToWebSocket(notification, userId) {
  try {
    // Get in-app specific compiled content or fallback to legacy fields
    const inAppContent = notification.getContentForChannel('inApp');

    let notificationData;

    if (inAppContent) {
      notificationData = {
        id: notification._id,
        title: inAppContent.title,
        body: inAppContent.body,
        type: notification.type || "info",
        timestamp: new Date(),
        payload: inAppContent.data || notification.payload,
        actionUrl: inAppContent.actionUrl,
        imageUrl: inAppContent.imageUrl,
      };
    } else {
      // Fallback to legacy fields
      notificationData = {
        id: notification._id,
        title: notification.title,
        body: notification.body,
        type: notification.type || "info",
        timestamp: new Date(),
        payload: notification.payload,
      };
      logger.warn(`No in-app template found for notification ${notification._id}, using legacy fields`);
    }

    const eventData = {
      data: notificationData,
      rooms: [], // Can add company rooms if needed
      targetUserIds: [userId],
    };

    // Publish to realtime.notification pattern using event producer
    await emit("realtime.notification", eventData);

    logger.info(
      `📡 Published in-app notification to WebSocket service for user ${userId} (Title: ${notificationData.title})`
    );
    return { success: true };
  } catch (error) {
    logger.error(`❌ Failed to publish notification to WebSocket:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Publish bulk notification to WebSocket service
 */
async function publishBulkNotificationToWebSocket(notification, userIds) {
  try {
    const eventData = {
      data: {
        id: notification._id,
        title: notification.title,
        body: notification.body,
        type: notification.type || "info",
        timestamp: new Date(),
        payload: notification.payload,
      },
      rooms: [], // Can add company rooms if needed
      targetUserIds: userIds,
    };

    // Publish to realtime.notification pattern using event producer
    await emit("realtime.notification", eventData);

    logger.info(
      `📡 Published bulk notification to WebSocket service for ${userIds.length} users`
    );
    return { success: true };
  } catch (error) {
    logger.error(`❌ Failed to publish bulk notification to WebSocket:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Publish company-wide notification to WebSocket service
 */
async function publishCompanyNotificationToWebSocket(notification, companyId) {
  try {
    const eventData = {
      data: {
        id: notification._id,
        title: notification.title,
        body: notification.body,
        type: notification.type || "info",
        timestamp: new Date(),
        payload: notification.payload,
      },
      rooms: [`company:${companyId}`],
      targetUserIds: [],
    };

    // Publish to realtime.notification pattern using event producer
    await emit("realtime.notification", eventData);

    logger.info(
      `📡 Published company notification to WebSocket service for company ${companyId}`
    );
    return { success: true };
  } catch (error) {
    logger.error(
      `❌ Failed to publish company notification to WebSocket:`,
      error
    );
    return { success: false, error: error.message };
  }
}

module.exports = {
  publishNotificationToWebSocket,
  publishBulkNotificationToWebSocket,
  publishCompanyNotificationToWebSocket,
};
