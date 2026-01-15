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

const { invalidateCompanyCaches, updateSubscriptionCache, updateCompanyStatus } = require("../utils/redis");
const rabbitmq = require("/app/shared/rabbitmq");

/**
 * Initialize event consumer for subscription changes
 */
async function initSubscriptionEventConsumer() {
  try {
    const EXCHANGE_NAME = rabbitmq.exchanges.topic;
    const QUEUE_NAME = "api-gateway.subscription-events";

    // Subscription events to track
    const subscriptionEvents = [
      "subscription.created",
      "subscription.activated",
      "subscription.renewed",
      "subscription.deactivated",
      "subscription.expired",
      "subscription.upgraded",
      "subscription.downgraded",
      "company.created",
      "company.updated",
      "company.deleted",
      "company.status.changed",
    ];

    // ✅ Use shared RabbitMQ library for standardized connection/resilience
    await rabbitmq.connect();

    for (const event of subscriptionEvents) {
      await rabbitmq.subscribe(
        { queue: QUEUE_NAME, exchange: EXCHANGE_NAME, pattern: event },
        async (content, routingKey) => {
          console.log(`📨 [RabbitMQ] Received event: ${routingKey}`, content);

          // Extract company ID
          const companyId = content.payload?.company_id || content.payload?.companyId || content.companyId || content.company?.id;

          if (!companyId) {
            console.warn("⚠️ Event missing company_id, skipping cache invalidation");
            return;
          }

          // Update or Invalidate caches based on event type
          if (routingKey.startsWith("subscription.") || routingKey === "company.created" || routingKey === "company.updated") {
            const subData = {
              is_active: content.payload?.is_active,
              tier: content.payload?.tier,
              end_date: content.payload?.end_date,
              last_updated: new Date().toISOString()
            };

            // company.created/updated might have tier but not is_active explicitly in eventHelpers
            if (routingKey === "company.created" || routingKey === "company.updated") {
              subData.is_active = true;
              subData.company_status = 'active';
            }

            // Only update if we have meaningful data
            if (subData.is_active !== undefined || subData.tier) {
              console.log(`🔄 Updating subscription cache for company ${companyId}`);
              await updateSubscriptionCache(companyId, subData);
            } else {
              console.log(`🔄 Event missing detail, invalidating cache for company ${companyId}`);
              await invalidateCompanyCaches(companyId);
            }
          } else if (routingKey === "company.status.changed") {
            const status = content.payload?.status;
            if (status) {
              console.log(`🔄 Company status changed to ${status}, updating cache for ${companyId}`);
              await updateCompanyStatus(companyId, status);
            } else {
              await invalidateCompanyCaches(companyId);
            }
          } else {
            // Default to invalidation for other events
            await invalidateCompanyCaches(companyId);
          }
        }
      );
    }

    console.log(`✅ Gateway subscription event consumer ready on ${QUEUE_NAME} via shared RabbitMQ`);

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
  app.post("/api/gateway/cache/clear-all", authenticateToken, requireRole('super_admin'), async (req, res) => {
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
