"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Helper functions to publish notification events
 * These functions are used by the service to emit events to RabbitMQ
 */

const notificationEvents = {
  /**
   * Publish notification created event
   */
  async created(notification, publishEvent) {
    return await publishEvent("notification.created", {
      notificationId: notification._id,
      companyId: notification.companyId,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      channels: notification.channels,
      createdAt: notification.createdAt,
      traceId: uuidv4(),
    });
  },

  /**
   * Publish notification sent event
   */
  async sent(notification, publishEvent) {
    return await publishEvent("notification.sent", {
      notificationId: notification._id,
      companyId: notification.companyId,
      userId: notification.userId,
      type: notification.type,
      sentAt: new Date().toISOString(),
      traceId: uuidv4(),
    });
  },

  /**
   * Publish notification delivered event
   */
  async delivered(notification, channel, publishEvent) {
    return await publishEvent("notification.delivered", {
      notificationId: notification._id,
      companyId: notification.companyId,
      userId: notification.userId,
      channel,
      deliveredAt: new Date().toISOString(),
      traceId: uuidv4(),
    });
  },

  /**
   * Publish notification failed event
   */
  async failed(notification, channel, error, publishEvent) {
    return await publishEvent("notification.failed", {
      notificationId: notification._id,
      companyId: notification.companyId,
      userId: notification.userId,
      channel,
      error: error.message,
      failedAt: new Date().toISOString(),
      traceId: uuidv4(),
    });
  },

  /**
   * Publish notification read event
   */
  async read(notificationId, userId, publishEvent) {
    return await publishEvent("notification.read", {
      notificationId,
      userId,
      readAt: new Date().toISOString(),
      traceId: uuidv4(),
    });
  },

  /**
   * Publish notification deleted event
   */
  async deleted(notificationId, userId, publishEvent) {
    return await publishEvent("notification.deleted", {
      notificationId,
      userId,
      deletedAt: new Date().toISOString(),
      traceId: uuidv4(),
    });
  },
};

const realtimeEvents = {
  /**
   * Publish real-time notification to WebSocket service
   */
  async notification(notification, userId, rooms = [], publishEvent) {
    return await publishEvent("realtime.notification", {
      data: {
        id: notification._id,
        title: notification.title,
        body: notification.body,
        type: notification.type || "info",
        timestamp: new Date(),
        payload: notification.payload,
      },
      rooms,
      targetUserIds: [userId],
      traceId: uuidv4(),
    });
  },
};

module.exports = {
  notificationEvents,
  realtimeEvents,
};

