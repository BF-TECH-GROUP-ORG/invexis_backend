/**
 * @file eventConsumers.config.js
 * @description Declarative consumer configuration for sales-service.
 * Each entry defines what events this service listens to and how to handle them.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handleInventoryEvent = require("../handlers/inventoryEvent.handler");
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
    name: "paymentEvents",
    queue: "sales_payment_events_queue",
    exchange: exchanges.topic,
    pattern: "payment.#",
    handler: handlePaymentEvent,
    description:
      "Handles payment completion and failure events from payment-service",
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
];
