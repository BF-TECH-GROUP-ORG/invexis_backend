// websocket-service/src/consumers/realtime.js
const shared = require("../config/shared");
const logger = require("../utils/logger");

const { rabbitmq } = shared;

// Helper to extract userId from various payload shapes
const extractUserId = (content) => {
  if (!content) return null;
  return content._id || content.userId || content.user?._id || null;
};

// Helper to emit to multiple targets
const emitToTargets = (io, targets, eventName, data) => {
  targets.forEach((target) => {
    try {
      io.to(target).emit(eventName, {
        ...data,
        event: eventName,
        ts: Date.now(),
      });
    } catch (err) {
      logger.error(`Failed to emit ${eventName} to ${target}:`, err);
    }
  });
};

const startRealtimeConsumer = async (io) => {
  try {
    await rabbitmq.connect();
    logger.info("RabbitMQ consumer ready");
  } catch (err) {
    logger.error("Failed to connect to RabbitMQ:", err);
    throw err;
  }

  const exchangeName = rabbitmq?.exchanges?.topic || "amq.topic";

  // Generic realtime events
  rabbitmq.subscribe(
    {
      queue: "ws_realtime_queue",
      exchange: exchangeName,
      pattern: "realtime.*",
    },
    async (content, routingKey) => {
      try {
        const eventName = routingKey.split(".").pop();
        const { data, rooms = [], targetUserIds = [] } = content;

        if (rooms.length > 0) {
          emitToTargets(io, rooms, eventName, data);
          logger.debug(`Broadcast ${eventName} to ${rooms.length} rooms`);
        }

        if (targetUserIds.length > 0) {
          const userRooms = targetUserIds.map((id) => `user:${id}`);
          emitToTargets(io, userRooms, eventName, data);
          logger.debug(`Broadcast ${eventName} to ${targetUserIds.length} users`);
        }
      } catch (error) {
        logger.error(`Realtime consumer error for ${routingKey}:`, error);
      }
    }
  );

  // Auth service events
  rabbitmq.subscribe(
    {
      queue: "ws_auth_events",
      exchange: exchangeName,
      pattern: "auth.user.*",
      options: {
        durable: true,
        autoDelete: false,
        arguments: {
          "x-dead-letter-exchange": rabbitmq?.exchanges?.dlx || "amq.dlx",
          "x-dead-letter-routing-key": "ws_auth_events_dlq",
        },
      },
    },
    async (content, routingKey) => {
      try {
        const userData = content?.user || content?.data || content || {};
        const userId = extractUserId(userData);

        if (!userId) {
          logger.warn(`Auth event ${routingKey} missing userId`);
          return;
        }

        const eventType = content?.event || routingKey;
        const userRoom = `user:${userId}`;

        // Handle auth events
        if (routingKey.includes("registered")) {
          io.emit("user.registered", { userId, user: userData, ts: Date.now() });
          io.to(userRoom).emit("user.registered", { userId, user: userData, ts: Date.now() });
        } else if (routingKey.includes("login")) {
          io.to(userRoom).emit("user.login", { userId, ...userData, ts: Date.now() });
          io.to(userRoom).emit("user.logged_in", { userId, ...userData, ts: Date.now() });
        } else if (routingKey.includes("logout")) {
          io.to(userRoom).emit("user.logout", { userId, ts: Date.now() });
        } else if (routingKey.includes("updated")) {
          io.to(userRoom).emit("user.updated", { userId, updates: userData, ts: Date.now() });
        }

        logger.debug(`Auth event ${eventType} processed for user ${userId}`);
      } catch (error) {
        logger.error(`Auth consumer error for ${routingKey}:`, error);
      }
    }
  );
  logger.info("Auth events consumer setup completed");

  // Notification service events
  rabbitmq.subscribe(
    {
      queue: "ws_notification_events",
      exchange: exchangeName,
      pattern: "notification.*",
      options: {
        durable: true,
        autoDelete: false,
        arguments: {
          "x-dead-letter-exchange": rabbitmq?.exchanges?.dlx || "amq.dlx",
          "x-dead-letter-routing-key": "ws_notification_events_dlq",
        },
      },
    },
    async (content, routingKey) => {
      try {
        const notificationData = content?.data || content || {};
        const userId = content?.userId || notificationData?.userId;
        const targetUserIds = content?.targetUserIds || [];
        const rooms = content?.rooms || [];

        if (!userId && targetUserIds.length === 0) {
          logger.warn(`Notification event ${routingKey} missing userId/targetUserIds`);
          return;
        }

        // Handle notification events
        if (routingKey.includes("created") || routingKey.includes("sent")) {
          if (targetUserIds.length > 0) {
            emitToTargets(
              io,
              targetUserIds.map((id) => `user:${id}`),
              "notification",
              notificationData
            );
          } else if (userId) {
            io.to(`user:${userId}`).emit("notification", {
              ...notificationData,
              ts: Date.now(),
            });
          }
          if (rooms.length > 0) {
            emitToTargets(io, rooms, "notification", notificationData);
          }
        } else if (routingKey.includes("read")) {
          io.to(`user:${userId}`).emit("notification.read", {
            notificationId: notificationData.id || notificationData._id,
            userId,
            ts: Date.now(),
          });
        } else if (routingKey.includes("deleted")) {
          io.to(`user:${userId}`).emit("notification.deleted", {
            notificationId: notificationData.id || notificationData._id,
            userId,
            ts: Date.now(),
          });
        }

        logger.debug(`Notification event ${routingKey} processed`);
      } catch (error) {
        logger.error(`Notification consumer error for ${routingKey}:`, error);
      }
    }
  );

  logger.info("Notification events consumer setup completed");
  logger.info("Realtime consumer started");
};

module.exports = { startRealtimeConsumer };
