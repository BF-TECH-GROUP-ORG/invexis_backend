// src/services/websocketPublisher.js
const { emit } = require("../events/producer");
const logger = require("../utils/logger");

/**
 * Publish notification event to WebSocket service via RabbitMQ
 * WebSocket service listens to 'realtime.notification' events
 */
async function publishNotificationToWebSocket(notification, userId) {
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
      targetUserIds: [userId],
    };

    // Publish to realtime.notification pattern using event producer
    await emit("realtime.notification", eventData);

    logger.info(
      `📡 Published notification to WebSocket service for user ${userId}`
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
