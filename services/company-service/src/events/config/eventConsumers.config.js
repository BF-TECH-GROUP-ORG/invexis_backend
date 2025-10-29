/**
 * @file eventConsumers.config.js
 * @description Declarative consumer configuration for company-service.
 * Each entry defines what events this service listens to and how to handle them.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handleAuthEvent = require("../handlers/authEvent.handler");
const handlePaymentEvent = require("../handlers/paymentEvent.handler");

module.exports = [
  {
    name: "authEvents",
    queue: "auth_events_queue",
    exchange: exchanges.topic,
    pattern: "auth.#",
    handler: handleAuthEvent,
    description: "Handles user account lifecycle events from auth-service",
  },
  {
    name: "paymentEvents",
    queue: "payment_events_queue",
    exchange: exchanges.topic,
    pattern: "payment.#",
    handler: handlePaymentEvent,
    description: "Handles billing and subscription events from payment-service",
  },
];
