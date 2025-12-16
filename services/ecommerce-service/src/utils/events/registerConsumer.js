"use strict";

const { subscribe } = require("/app/shared/rabbitmq");
const FailedEvent = require("../../models/FailedEvent.models");

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

          const maxRetries = 3;
          let attempt = 0;
          let processed = false;

          while (attempt < maxRetries && !processed) {
            try {
              await config.handler(event, routingKey);
              processed = true;
            } catch (error) {
              attempt++;
              console.error(`⚠️ [${config.name}] Error processing event (Attempt ${attempt}/${maxRetries}): ${error.message}`);

              if (attempt < maxRetries) {
                // Simple backoff: 1s, 2s, 3s
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
              } else {
                // Max retries reached, save to Dead Letter Queue (FailedEvent)
                console.error(`❌ [${config.name}] Max retries reached. Moving to FailedEvent.`);
                try {
                  await FailedEvent.create({
                    topic: config.exchange,
                    routingKey: routingKey,
                    payload: event,
                    error: error.message,
                    consumerName: config.name,
                    stackTrace: error.stack
                  });
                  console.log(`💾 [${config.name}] Event saved to FailedEvent collection`);
                } catch (dbError) {
                  console.error(`🔥 [${config.name}] CRITICAL: Failed to save to FailedEvent: ${dbError.message}`);
                }
              }
            }
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
