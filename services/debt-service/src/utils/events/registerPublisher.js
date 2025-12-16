"use strict";

const { publish, connect } = require("/app/shared/rabbitmq");

/**
 * Register all publishers and expose a unified publishEvent() function.
 * @param {Object} publisherConfigs - Object with routing keys as keys
 * @returns {Function} publishEvent(routingKey, payload, metadata?)
 */
const registerPublishers = async (publisherConfigs) => {
  await connect();
  console.log("🚀 Publishers initialized");

  // Support both array-style and object-style configs (legacy)
  let configs = publisherConfigs;
  if (!Array.isArray(publisherConfigs) && publisherConfigs && typeof publisherConfigs === 'object') {
    // Convert object of { key: config } into array where each entry has exchange and events array
    configs = Object.keys(publisherConfigs).map((k) => {
      const c = publisherConfigs[k] || {};
      return {
        exchange: c.exchange,
        events: [{ key: c.routingKey || k }],
        description: c.description || ''
      };
    });
  }

  const publishEvent = async (routingKey, payload = {}, metadata = {}) => {
    const config = configs.find((c) =>
      Array.isArray(c.events) && c.events.some((e) => e.key === routingKey)
    );

    if (!config) {
      console.warn(`⚠️ No publisher found for routingKey: ${routingKey}`);
      return;
    }

    const event = {
      id: metadata?.id || Date.now().toString(),
      source: "debt-service",
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
