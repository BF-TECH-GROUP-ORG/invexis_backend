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
      await subscribe(
        {
          queue: config.queue,
          exchange: config.exchange,
          pattern: config.pattern,
        },
        async (event, routingKey) => {
          console.log(`📥 [${config.name}] Received: ${routingKey}`);
          try {
            console.log(`🔍 About to call handler for ${config.name}`, JSON.stringify(event, null, 2));
            await config.handler(event, routingKey);
            console.log(`✅ Handler completed for ${config.name}`);
          } catch (handlerError) {
            console.error(`❌ Handler error for ${config.name}:`, handlerError);
            throw handlerError;
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
