// websocket-service/src/consumers/realtime.js (updated for cluster broadcast)
const shared = require("../config/shared");
const logger = require("../utils/logger");
const { v4: uuidv4 } = require("uuid");

let rabbitmq = require("/app/shared/rabbitmq.js");

const startRealtimeConsumer = async (io) => {
  // Ensure RabbitMQ is connected before proceeding
  try {
    await rabbitmq.connect();
    console.log("rabbitmq consumer ready");
  } catch (err) {
    logger.error("Failed to connect to RabbitMQ:", err);
    throw err; // Let the error propagate to trigger service restart
  }

  const exchangeName = rabbitmq.exchanges.topic;
  const queueConfig = {
    queue: "ws_realtime_queue",
    exchange: exchangeName,
    pattern: "realtime.*",
  };

  rabbitmq.subscribe(queueConfig, async (content, routingKey) => {
    try {
      const eventName = routingKey.split(".").pop();
      const { data, rooms = [], targetUserIds = [] } = content;

      // Use Socket.IO adapter for cluster-wide broadcast
      if (rooms && rooms.length > 0) {
        rooms.forEach((room) => {
          try {
            io.to(room).emit(eventName, {
              ...data,
              event: eventName,
              ts: Date.now(),
            });
          } catch (err) {
            logger.error(`Failed to emit ${eventName} to room ${room}:`, err);
          }
        });
        logger.info(
          `Cluster broadcast ${eventName} to rooms: ${rooms.join(", ")}`
        );
      }

      if (targetUserIds && targetUserIds.length > 0) {
        targetUserIds.forEach((userId) => {
          const room = `user:${userId}`;
          try {
            io.to(room).emit(eventName, {
              ...data,
              event: eventName,
              ts: Date.now(),
            });
          } catch (err) {
            logger.error(`Failed to emit ${eventName} to user ${userId}:`, err);
          }
        });
        logger.info(
          `Cluster direct ${eventName} to users: ${targetUserIds.join(", ")}`
        );
      }

      // Track in Redis (shared across cluster)
      try {
        const deliveryId = uuidv4();
        if (shared.redis && typeof shared.redis.set === "function") {
          await shared.redis.set(
            `delivery:${deliveryId}`,
            JSON.stringify({
              event: eventName,
              rooms,
              users: targetUserIds,
              ts: Date.now(),
            }),
            "EX",
            86400
          );
        }
      } catch (err) {
        logger.error("Failed to write delivery tracking to Redis:", err);
      }
    } catch (error) {
      logger.error(`Cluster realtime consumer error for ${routingKey}:`, error);
    }
  });

  // Listen for auth service events
  try {
    await rabbitmq.subscribe(
      {
        queue: "ws_auth_events",
        exchange: exchangeName,
        pattern: "auth.user.*",
        options: {
          durable: true,
          autoDelete: false,
          arguments: {
            "x-dead-letter-exchange": rabbitmq.exchanges.dlx,
            "x-dead-letter-routing-key": "ws_auth_events_dlq",
          },
        },
      },
      async (content, routingKey) => {
        try {
          logger.info(`Received auth event with routing key: ${routingKey}`, {
            fullContent: JSON.stringify(content),
            routingKey,
          });

          // Handle both direct content and nested content cases
          // Support payload shapes used across services, e.g.:
          // { event, data: { userId, ... } }
          // { event, data: { user: { ... } } }
          // { user: { ... } }
          let userData, eventType;

          if (content && content.user) {
            // Case where the full user object is in the content
            userData = content.user;
            eventType = content.event || routingKey;
          } else if (content && content.data && content.data.user) {
            // Case where it's wrapped in a data.user property
            userData = content.data.user;
            eventType = content.event || routingKey;
          } else if (content && content.data) {
            // Case where useful fields (like userId) are directly on data
            userData = content.data;
            eventType = content.event || routingKey;
          } else {
            // Fallback: treat the whole content as data
            userData = content || {};
            eventType = content && content.event ? content.event : routingKey;
          }

          // Log the parsed data for debugging
          logger.info("Parsed auth event data:", {
            eventType,
            userData: JSON.stringify(userData),
          });

          // Extract userId from any of the possible locations
          const userId =
            (userData && (userData._id || userData.userId)) ||
            (content && content.data && content.data.userId) ||
            (userData && userData.user && userData.user._id) ||
            null;
          if (!userId) {
            logger.warn(`Auth event ${routingKey} missing userId in data:`, {
              userData,
              content,
            });
            return;
          }

          // Handle different auth events
          switch (true) {
            case eventType === "user.registered" ||
              routingKey.endsWith("user.registered"):
              logger.info(`Processing user registration for ${userId}`, {
                userData: JSON.stringify(userData),
              });
              // Broadcast to general channel
              io.emit("user.registered", {
                userId,
                user: userData,
                source: "auth-service",
                ts: Date.now(),
              });
              // Also emit to user's specific room if they're connected
              io.to(`user:${userId}`).emit("user.registered", {
                userId,
                user: userData,
                source: "auth-service",
                ts: Date.now(),
              });
              break;

            case eventType === "user.login" ||
              routingKey.endsWith("user.login") ||
              eventType === "user.logged_in" ||
              routingKey.endsWith("user.logged_in"):
              logger.info(`Processing user login for ${userId}`);
              // Send both legacy 'user.login' and new 'user.logged_in' events for compatibility
              const loginData = {
                userId,
                source: "auth-service",
                ...userData, // Include additional data like device, ip, method
                ts: Date.now(),
              };
              io.to(`user:${userId}`).emit("user.login", loginData);
              io.to(`user:${userId}`).emit("user.logged_in", loginData);
              break;

            case eventType === "user.logout" ||
              routingKey.endsWith("user.logout"):
              logger.info(`Processing user logout for ${userId}`);
              io.to(`user:${userId}`).emit("user.logout", {
                userId,
                source: "auth-service",
                ts: Date.now(),
              });
              break;

            case eventType === "user.updated" ||
              routingKey.endsWith("user.updated"):
              logger.info(`Processing user update for ${userId}`);
              io.to(`user:${userId}`).emit("user.updated", {
                userId,
                updates: userData,
                source: "auth-service",
                ts: Date.now(),
              });
              break;

            default:
              // Log unknown events for debugging
              logger.info(`Received unhandled auth event type: ${routingKey}`, {
                eventType,
                userId,
                userData,
                content,
              });
          }

          // Track event delivery in Redis
          try {
            const deliveryId = uuidv4();
            if (shared.redis && typeof shared.redis.set === "function") {
              await shared.redis.set(
                `auth:delivery:${deliveryId}`,
                JSON.stringify({
                  routingKey,
                  userId,
                  event: eventType,
                  payload: userData || content,
                  ts: Date.now(),
                }),
                "EX",
                86400 // 24 hours
              );
            }
          } catch (err) {
            logger.error("Failed to track auth event delivery in Redis:", err);
          }
        } catch (err) {
          logger.error(`Error handling auth event ${routingKey}:`, err);
        }
      }
    );
    logger.info("Auth events consumer setup completed");
  } catch (err) {
    logger.error("Failed to subscribe to auth.user.* events:", err);
  }

  // Listen for notification service events
  try {
    await rabbitmq.subscribe(
      {
        queue: "ws_notification_events",
        exchange: exchangeName,
        pattern: "notification.*",
        options: {
          durable: true,
          autoDelete: false,
          arguments: {
            "x-dead-letter-exchange": rabbitmq.exchanges.dlx,
            "x-dead-letter-routing-key": "ws_notification_events_dlq",
          },
        },
      },
      async (content, routingKey) => {
        try {
          logger.info(
            `Received notification event with routing key: ${routingKey}`,
            {
              fullContent: JSON.stringify(content),
              routingKey,
            }
          );

          // Extract notification data
          const notificationData = content.data || content;
          const userId =
            content.userId || (content.data && content.data.userId);

          if (
            !userId &&
            (!content.targetUserIds || content.targetUserIds.length === 0)
          ) {
            logger.warn(
              `Notification event ${routingKey} missing userId/targetUserIds`
            );
            return;
          }

          // Handle different notification events
          switch (true) {
            case routingKey === "notification.created" ||
              routingKey === "notification.sent":
              logger.info(`Processing notification for user(s)`);

              // Send to specific users
              if (content.targetUserIds && content.targetUserIds.length > 0) {
                content.targetUserIds.forEach((uid) => {
                  io.to(`user:${uid}`).emit("notification", {
                    ...notificationData,
                    source: "notification-service",
                    ts: Date.now(),
                  });
                });
              } else if (userId) {
                io.to(`user:${userId}`).emit("notification", {
                  ...notificationData,
                  source: "notification-service",
                  ts: Date.now(),
                });
              }

              // Send to company rooms if specified
              if (content.rooms && content.rooms.length > 0) {
                content.rooms.forEach((room) => {
                  io.to(room).emit("notification", {
                    ...notificationData,
                    source: "notification-service",
                    ts: Date.now(),
                  });
                });
              }
              break;

            case routingKey === "notification.read":
              logger.info(`Processing notification read for user ${userId}`);
              io.to(`user:${userId}`).emit("notification.read", {
                notificationId: notificationData.id || notificationData._id,
                userId,
                source: "notification-service",
                ts: Date.now(),
              });
              break;

            case routingKey === "notification.deleted":
              logger.info(`Processing notification deleted for user ${userId}`);
              io.to(`user:${userId}`).emit("notification.deleted", {
                notificationId: notificationData.id || notificationData._id,
                userId,
                source: "notification-service",
                ts: Date.now(),
              });
              break;

            default:
              logger.info(
                `Received unhandled notification event type: ${routingKey}`,
                {
                  userId,
                  notificationData,
                  content,
                }
              );
          }

          // Track event delivery in Redis
          try {
            const deliveryId = uuidv4();
            if (shared.redis && typeof shared.redis.set === "function") {
              await shared.redis.set(
                `notification:delivery:${deliveryId}`,
                JSON.stringify({
                  routingKey,
                  userId,
                  targetUserIds: content.targetUserIds,
                  rooms: content.rooms,
                  payload: notificationData,
                  ts: Date.now(),
                }),
                "EX",
                86400 // 24 hours
              );
            }
          } catch (err) {
            logger.error(
              "Failed to track notification event delivery in Redis:",
              err
            );
          }
        } catch (err) {
          logger.error(`Error handling notification event ${routingKey}:`, err);
        }
      }
    );
    logger.info("Notification events consumer setup completed");
  } catch (err) {
    logger.error("Failed to subscribe to notification.* events:", err);
  }

  logger.info("Cluster realtime consumer started");
};

module.exports = { startRealtimeConsumer };
