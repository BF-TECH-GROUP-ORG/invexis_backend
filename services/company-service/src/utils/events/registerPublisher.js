"use strict";

const { publish, connect } = require("/app/shared/rabbitmq");

/**
 * Register all publishers and expose a unified publishEvent() function.
 * @param {Array} publisherConfigs
 * @returns {Function} publishEvent(routingKey, payload, metadata?)
 */
const registerPublishers = async (publisherConfigs) => {
  await connect();
  console.log("🚀 Publishers initialized");

  const publishEvent = async (routingKey, payload = {}, metadata = {}) => {
    const config = publisherConfigs.find((c) =>
      c.events.some((e) => e.key === routingKey)
    );

    if (!config) {
      console.warn(`⚠️ No publisher found for routingKey: ${routingKey}`);
      return;
    }

    const event = {
      id: metadata?.id || Date.now().toString(),
      source: "company-service",
      type: routingKey,
      data: payload,
      emittedAt: new Date().toISOString(),
    };

    const success = await publish(config.exchange, routingKey, event, metadata);
    if (!success) {
      console.warn(`⚠️ Failed to publish event: ${routingKey}`);
      throw new Error(`Failed to publish event: ${routingKey}`);
    }
    console.log(`📤 Published event: ${routingKey}`, payload);
  };

  return publishEvent;
};

module.exports = registerPublishers;
