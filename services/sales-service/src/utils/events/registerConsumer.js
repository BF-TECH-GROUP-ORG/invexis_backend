"use strict";

const { subscribe } = require("/app/shared/rabbitmq");

/**
 * Dynamically register all configured event consumers
 * @param {Array} consumerConfigs - List of consumer definitions
 */
const registerConsumers = async (consumerConfigs) => {
  console.log("🔄 Registering dynamic consumers...");

  for (const config of consumerConfigs) {
    try {
      const patterns = [config.pattern, ...(config.additionalPatterns || [])];

      for (const pattern of patterns) {
        await subscribe(
          {
            queue: config.queue,
            exchange: config.exchange,
            pattern: pattern,
          },
          async (event, routingKey) => {
            console.log(`📥 [${config.name}] Received: ${routingKey}`);
            await config.handler(event, routingKey);
          }
        );
      }

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
