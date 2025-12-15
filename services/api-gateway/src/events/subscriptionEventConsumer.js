"use strict";

/**
 * Gateway Subscription Event Consumer
 * 
 * Listens for company-service events:
 *  - subscription.upgraded / downgraded
 *  - subscription.expired
 *  - company.status.changed
 * 
 * Automatically invalidates Redis caches to ensure fresh data
 */

const { getRedisClient, invalidateCompanyCaches } = require("../utils/redis");

/**
 * Initialize event consumer for subscription changes
 */
async function initSubscriptionEventConsumer() {
  try {
    const amqp = require("amqplib");
    const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672";
    const EXCHANGE_NAME = "invexis.events";
    const QUEUE_NAME = "api-gateway.subscription-events";

    // Connect to RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Declare exchange and queue
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    // Bind events
    const subscriptionEvents = [
      "subscription.activated",
      "subscription.renewed",
      "subscription.expired",
      "subscription.upgraded",
      "subscription.downgraded",
      "company.status.changed",
    ];

    for (const event of subscriptionEvents) {
      await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, event);
    }

    console.log(`✅ Gateway subscription event consumer ready on ${QUEUE_NAME}`);

    // Consume messages
    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          const routingKey = msg.fields.routingKey;

          console.log(`📨 Received event: ${routingKey}`, content);

          // Extract company ID
          const companyId = content.payload?.company_id || content.companyId || content.company?.id;

          if (!companyId) {
            console.warn("⚠️ Event missing company_id, skipping cache invalidation");
            channel.ack(msg);
            return;
          }

          // Invalidate caches based on event type
          if (routingKey.startsWith("subscription.")) {
            console.log(`🔄 Invalidating subscription cache for company ${companyId}`);
            await invalidateCompanyCaches(companyId);
          } else if (routingKey === "company.status.changed") {
            console.log(`🔄 Company status changed, invalidating caches for ${companyId}`);
            await invalidateCompanyCaches(companyId);
          }

          // Acknowledge message
          channel.ack(msg);
        } catch (error) {
          console.error("❌ Error processing subscription event:", error.message);
          channel.nack(msg, false, true); // Retry
        }
      }
    });

    return { connection, channel };
  } catch (error) {
    console.error("❌ Failed to initialize subscription event consumer:", error.message);
    console.log("⚠️ Gateway will proceed without event consumer - cache will invalidate based on TTL");
  }
}

/**
 * Manual cache invalidation endpoint (for debugging/testing)
 * Can be called from company-service or admin panel
 */
function createCacheInvalidationEndpoint(app) {
  // Import shared authentication middleware
  const { authenticateToken, requireRole } = require("/app/shared/middlewares/auth/production-auth");
  
  app.post("/api/gateway/cache/invalidate", authenticateToken, async (req, res) => {
    try {
      const { companyId } = req.body;

      if (!companyId) {
        return res.status(400).json({
          success: false,
          error: "MISSING_COMPANY_ID",
          message: "companyId is required",
        });
      }

      await invalidateCompanyCaches(companyId);

      res.json({
        success: true,
        message: `Cache invalidated for company ${companyId}`,
      });
    } catch (error) {
      console.error("Error invalidating cache:", error.message);
      res.status(500).json({
        success: false,
        error: "CACHE_INVALIDATION_ERROR",
        message: error.message,
      });
    }
  });

  // Invalidate all caches endpoint (admin only)
  app.post("/api/gateway/cache/clear-all", authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return res.status(503).json({
          success: false,
          error: "REDIS_UNAVAILABLE",
          message: "Redis not available",
        });
      }

      await redis.flushdb();

      res.json({
        success: true,
        message: "All caches cleared",
      });
    } catch (error) {
      console.error("Error clearing caches:", error.message);
      res.status(500).json({
        success: false,
        error: "CACHE_CLEAR_ERROR",
        message: error.message,
      });
    }
  });

  console.log("✅ Cache invalidation endpoints registered");
}

module.exports = {
  initSubscriptionEventConsumer,
  createCacheInvalidationEndpoint,
};
