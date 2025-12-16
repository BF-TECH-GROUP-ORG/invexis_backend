"use strict";

const registerPublishers = require("../utils/events/registerPublisher");
const publisherConfigs = require("./config/eventPublishers.config");

let publishEvent = null;

const initPublishers = async () => {
  publishEvent = await registerPublishers(publisherConfigs);
};

/**
 * Emit event to RabbitMQ
 * Used by outbox dispatcher to publish events
 * @param {string} routingKey - Event routing key (e.g., "company.created")
 * @param {object} payload - Event payload
 * @param {object} metadata - Optional metadata
 */
const emit = async (routingKey, payload = {}, metadata = {}) => {
  if (!publishEvent) throw new Error("Publishers not initialized");
  await publishEvent(routingKey, payload, metadata);
};

module.exports = {
  initPublishers,
  emit,
};
