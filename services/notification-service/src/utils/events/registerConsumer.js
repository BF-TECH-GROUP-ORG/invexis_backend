"use strict";

const logger = require("../../utils/logger");

let subscribe;
try {
  const rabbitmq = require("/app/shared/rabbitmq");
  subscribe = rabbitmq.subscribe;
} catch (err) {
  logger.warn('RabbitMQ shared module not available in registerConsumer', { error: err.message });
}

/**
 * Dynamically register all configured event consumers
 * @param {Array} consumerConfigs - List of consumer definitions
 */
const registerConsumers = async (consumerConfigs) => {
  if (!subscribe) {
    console.warn("⚠️ RabbitMQ subscribe function not available. Skipping consumer registration.");
    return;
  }
  console.log("🔄 Registering dynamic consumers...");

  for (const config of consumerConfigs) {
    try {
      await subscribe(
        {
          queue: config.queue,
          exchange: config.exchange,
          pattern: config.pattern,
        },
        async (event, routingKey) => {
          logger.info(`📥 [${config.name}] Received event: ${routingKey}`);
          logger.debug(`📦 [${config.name}] Raw event:`, { event: JSON.stringify(event).substring(0, 200) });

          // Normalize incoming message shape so handlers can expect { type, data }
          // Some publishers send a wrapped object { type, data } (company-service style),
          // while others (legacy debt-service) publish raw payloads. Normalize both.
          const normalized = (event && event.type && ("data" in event))
            ? event
            : { type: routingKey, data: event };

          logger.debug(`🔄 [${config.name}] Normalized type: ${normalized.type}`, { hasData: !!normalized.data });

          try {
            console.log(`⚙️  [${config.name}] Calling handler for ${normalized.type}...`);
            await config.handler(normalized, routingKey);
            console.log(`✅ [${config.name}] Handler completed for ${normalized.type}`);
          } catch (err) {
            console.error(`❌ [${config.name}] Handler error for ${normalized.type}:`, err.message);
            console.error(`❌ [${config.name}] Stack:`, err.stack);
            // Re-throw to allow subscribe() to handle retries/DLQ logic
            throw err;
          }
        }
      );

      console.log(`✅ Registered consumer: ${config.name} (${config.pattern})`);
    } catch (error) {
      console.error(
        `❌ Failed to register consumer ${config.name}:`,
        error.message
      );
    }
  }

  console.log("🚀 All consumers initialized successfully");
};

module.exports = registerConsumers;

