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
        type: 'notification.created', // Standardized with consumer expectations
        source: 'notification-service',
        userId: notification.userId?.toString(),
        targetUserIds: notification.userId ? [notification.userId.toString()] : [], // Ensure targetUserIds is populated
        data: {
          notificationId: notification._id.toString(),
          userId: notification.userId?.toString(),
          companyId: notification.companyId?.toString(),
          shopId: notification.shopId?.toString(),
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

      // Use correct exchange and routing key to match websocket-service consumer
      // Consumer listens on: exchange=events_topic, pattern=notification.*
      const routingKey = 'notification.created';
      await rabbitMQ.publish(
        rabbitMQ.exchanges.topic,  // 'events_topic'
        routingKey,
        payload,
        {
          persistent: true, // Make sure events survive restarts
        }
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
      const companyId = notification.companyId?.toString();
      const rooms = [];

      // 1. Determine target rooms based on scope and filters
      if (notification.scope === 'system') {
        rooms.push('global', 'all_users');
      } else if (companyId) {
        if (notification.scope === 'shop' && notification.shopId) {
          if (notification.roles && notification.roles.length > 0) {
            // Role-specific rooms WITHIN a shop
            notification.roles.forEach(role => {
              rooms.push(`company:${companyId}:shop:${notification.shopId.toString()}:role:${role}`);
            });
          } else {
            rooms.push(`shop:${notification.shopId.toString()}`);
          }
        } else if (notification.roles && notification.roles.length > 0) {
          // Role-specific rooms (Company-wide)
          notification.roles.forEach(role => {
            rooms.push(`company:${companyId}:role:${role}`);
          });
        } else if (notification.departmentId) {
          // Department-specific room
          rooms.push(`company:${companyId}:dept:${notification.departmentId.toString()}`);
        } else {
          // Default: Entire company
          rooms.push(`company:${companyId}`);
        }
      }

      const payload = {
        type: 'notification.broadcast',
        source: 'notification-service',
        rooms: rooms,
        data: {
          notificationId: notification._id.toString(),
          companyId: companyId,
          shopId: notification.shopId?.toString(),
          scope: notification.scope,
          title: notification.title,
          body: notification.body,
          priority: notification.priority,
          createdAt: notification.createdAt,
          // Include compiled content for rich notifications
          content: notification.compiledContent?.inApp || {
            title: notification.title,
            body: notification.body
          }
        },
        emittedAt: new Date().toISOString(),
        id: `ws-broadcast-${notification._id}-${Date.now()}`
      };

      // Use correct exchange and routing key
      // Consumer listens on notification.*
      const routingKey = 'notification.broadcast';
      await rabbitMQ.publish(
        rabbitMQ.exchanges.topic,  // 'events_topic'
        routingKey,
        payload,
        {
          persistent: true,
        }
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
