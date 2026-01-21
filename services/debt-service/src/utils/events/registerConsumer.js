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
            try {
              // Standardize event structure: Support both wrapped {type, data} and direct formats
              let eventToProcess = event;
              if (event.data && (event.type || event.event)) {
                eventToProcess = event.data;
                // Attach type if it's in the envelope
                if (!eventToProcess.type) {
                  eventToProcess.type = event.type || event.event;
                }
              }

              console.log(`🔍 Processing event for ${config.name}`, JSON.stringify(eventToProcess, null, 2));
              await config.handler(eventToProcess, routingKey);
              console.log(`✅ Handler completed for ${config.name}`);
            } catch (handlerError) {
              console.error(`❌ Handler error for ${config.name}:`, handlerError);
              throw handlerError;
            }
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
