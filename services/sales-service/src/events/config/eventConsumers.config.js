/**
 * @file eventConsumers.config.js
 * @description Declarative consumer configuration for sales-service.
 * Each entry defines what events this service listens to and how to handle them.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handleInventoryEvent = require("../handlers/inventoryEvent.handler");
const handleInventoryReturnEvent = require("../handlers/inventoryReturnEvent.handler");
const handlePaymentEvent = require("../handlers/paymentEvent.handler");
const handleShopEvent = require("../handlers/shopEvent.handler");
const handleCustomerEvent = require("../handlers/customerEvent.handler");

module.exports = [
  {
    name: "inventoryEvents",
    queue: "sales_inventory_events_queue",
    exchange: exchanges.topic,
    pattern: "inventory.#",
    handler: handleInventoryEvent,
    description: "Handles product and stock events from inventory-service",
  },
  {
    name: "paymentAndDocumentEvents",
    queue: "sales_payment_events_queue",
    exchange: exchanges.topic,
    pattern: "payment.#",
    additionalPatterns: ["document.invoice.created"],
    handler: handlePaymentEvent,
    description:
      "Handles payment and document completion events",
  },
  {
    name: "shopEvents",
    queue: "sales_shop_events_queue",
    exchange: exchanges.topic,
    pattern: "shop.#",
    handler: handleShopEvent,
    description: "Handles shop/store events from shop-service",
  },
  {
    name: "customerEvents",
    queue: "sales_customer_events_queue",
    exchange: exchanges.topic,
    pattern: "customer.#",
    handler: handleCustomerEvent,
    description: "Handles customer lifecycle events from shop-service",
  },
  {
    name: "inventoryReturnEvents",
    queue: "sales_inventory_return_events_queue",
    exchange: exchanges.topic,
    pattern: "inventory.return.#",
    handler: handleInventoryReturnEvent,
    description:
      "Handles inventory return confirmation events from inventory-service",
  },
];

