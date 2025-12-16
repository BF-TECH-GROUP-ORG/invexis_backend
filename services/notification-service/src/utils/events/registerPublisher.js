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
      source: "notification-service",
      type: routingKey,
      data: payload,
      emittedAt: new Date().toISOString(),
    };

    await publish(config.exchange, routingKey, event, metadata);
    console.log(`📤 Published event: ${routingKey}`, payload);
  };

  return publishEvent;
};

module.exports = registerPublishers;

