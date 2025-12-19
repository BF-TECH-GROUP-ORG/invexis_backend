/**
 * WebSocket Publisher for Real-Time Notifications
 * Publishes notifications to websocket-service via RabbitMQ
 */

const logger = require('../utils/logger');

let rabbitMQ;
try {
  rabbitMQ = require('/app/shared/rabbitmq');
} catch (err) {
  logger.warn('RabbitMQ not available for WebSocket publishing');
}

class WebSocketPublisher {
  /**
   * Publish notification to WebSocket service for real-time delivery
   */
  async publishNotification(notification) {
    if (!rabbitMQ) {
      logger.warn('Cannot publish to WebSocket: RabbitMQ not available');
      return false;
    }

    try {
      const payload = {
        type: 'notification.new',
        source: 'notification-service',
        data: {
          notificationId: notification._id.toString(),
          userId: notification.userId,
          companyId: notification.companyId,
          shopId: notification.shopId,
          title: notification.title,
          body: notification.body,
          priority: notification.priority,
          scope: notification.scope,
          createdAt: notification.createdAt,
          // Include compiled content for rich notifications
          content: notification.compiledContent?.inApp || {
            title: notification.title,
            body: notification.body
          }
        },
        emittedAt: new Date().toISOString(),
        id: `ws-${notification._id}-${Date.now()}`
      };

      // Publish to websocket exchange with user-specific routing
      await rabbitMQ.publish(
        'websocket.notifications',
        payload,
        { routingKey: `notification.user.${notification.userId}` }
      );

      logger.info(`📡 Published notification ${notification._id} to WebSocket`);
      return true;

    } catch (error) {
      logger.error('❌ Failed to publish to WebSocket:', error.message);
      return false;
    }
  }

  /**
   * Publish broadcast notification to all users in a company/shop
   */
  async publishBroadcast(notification) {
    if (!rabbitMQ || !notification.companyId) {
      return false;
    }

    try {
      const payload = {
        type: 'notification.broadcast',
        source: 'notification-service',
        data: {
          notificationId: notification._id.toString(),
          companyId: notification.companyId,
          scope: notification.scope,
          title: notification.title,
          body: notification.body,
          priority: notification.priority
        },
        emittedAt: new Date().toISOString(),
        id: `ws-broadcast-${notification._id}-${Date.now()}`
      };

      await rabbitMQ.publish(
        'websocket.notifications.broadcast',
        payload,
        { routingKey: `notification.company.${notification.companyId}` }
      );

      logger.info(`📡 Broadcast notification ${notification._id} via WebSocket`);
      return true;

    } catch (error) {
      logger.error('❌ Failed to broadcast via WebSocket:', error.message);
      return false;
    }
  }
}

module.exports = new WebSocketPublisher();
