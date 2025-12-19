/**
 * @file eventConsumers.config.js
 * @description Enterprise-grade event consumer configuration for notification-service.
 * All events are routed through a unified handler that uses eventChannelMapping as the single source of truth.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handlePlatformEvent = require("../handlers/platformEvent.handler");

module.exports = [
  {
    name: "allPlatformEvents",
    queue: "notification_all_events",
    exchange: exchanges.topic,
    pattern: "#",  // Listen to ALL events
    handler: handlePlatformEvent,
    description: "Enterprise-grade unified event processor for notifications",
  },
];

