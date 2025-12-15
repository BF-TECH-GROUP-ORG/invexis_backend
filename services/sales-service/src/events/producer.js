"use strict";

const registerPublishers = require("../utils/events/registerPublisher");
const publisherConfigs = require("./config/eventPublishers.config");

let publishEvent = null;

const initPublishers = async () => {
  publishEvent = await registerPublishers(publisherConfigs);
};

const emit = async (routingKey, payload = {}, metadata = {}) => {
  if (!publishEvent) throw new Error("Publishers not initialized");
  await publishEvent(routingKey, payload, metadata);
};

module.exports = { initPublishers, emit };
