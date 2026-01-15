/**
 * @file eventConsumers.config.js
 * @description Declarative consumer configuration for company-service.
 * Each entry defines what events this service listens to and how to handle them.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handlePaymentEvent = require("../handlers/paymentEvent.handler");
const handleDocumentEvent = require("../handlers/documentEvent.handler");

module.exports = [
  {
    name: "paymentEvents",
    queue: "payment_events_queue",
    exchange: exchanges.topic,
    pattern: "payment.#",
    handler: handlePaymentEvent,
    description: "Handles billing and subscription events from payment-service",
  },
  {
    name: "documentEvents",
    queue: "company_document_events",
    exchange: exchanges.topic,
    pattern: "document.company.verification.*",
    handler: handleDocumentEvent,
    description: "Handles verification document completion events from document-service",
  },
];

