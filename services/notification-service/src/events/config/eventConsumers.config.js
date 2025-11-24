/**
 * @file eventConsumers.config.js
 * @description Declarative consumer configuration for notification-service.
 * Each entry defines what events this service listens to and how to handle them.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handleCompanyEvent = require("../handlers/companyEvent.handler");
const handleShopEvent = require("../handlers/shopEvent.handler");
const handleProductEvent = require("../handlers/productEvent.handler");
const handleSaleEvent = require("../handlers/saleEvent.handler");
const handlePaymentEvent = require("../handlers/paymentEvent.handler");
const handleAuthEvent = require("../handlers/authEvent.handler");
const handleDebtEvent = require("../handlers/debtEvent.handler");

module.exports = [
  {
    name: "companyEvents",
    queue: "notification_company_events",
    exchange: exchanges.topic,
    pattern: "company.#",
    handler: handleCompanyEvent,
    description: "Handles company lifecycle events",
  },
  {
    name: "shopEvents",
    queue: "notification_shop_events",
    exchange: exchanges.topic,
    pattern: "shop.#",
    handler: handleShopEvent,
    description: "Handles shop creation and management events",
  },
  {
    name: "productEvents",
    queue: "notification_product_events",
    exchange: exchanges.topic,
    pattern: "product.#",
    handler: handleProductEvent,
    description: "Handles product and inventory events",
  },
  {
    name: "inventoryEvents",
    queue: "notification_inventory_events",
    exchange: exchanges.topic,
    pattern: "inventory.#",
    handler: handleProductEvent,
    description: "Handles inventory alerts (low stock, out of stock)",
  },
  {
    name: "saleEvents",
    queue: "notification_sale_events",
    exchange: exchanges.topic,
    pattern: "sale.#",
    handler: handleSaleEvent,
    description: "Handles sale and transaction events",
  },
  {
    name: "paymentEvents",
    queue: "notification_payment_events",
    exchange: exchanges.topic,
    pattern: "payment.#",
    handler: handlePaymentEvent,
    description: "Handles payment and billing events",
  },
  {
    name: "debtEvents",
    queue: "notification_debt_events",
    exchange: exchanges.topic,
    pattern: "debt.#",
    handler: handleDebtEvent,
    description: "Handles debt lifecycle and reminder events",
  },
  {
    name: "subscriptionEvents",
    queue: "notification_subscription_events",
    exchange: exchanges.topic,
    pattern: "subscription.#",
    handler: handlePaymentEvent,
    description: "Handles subscription lifecycle events",
  },
  {
    name: "authEvents",
    queue: "notification_auth_events",
    exchange: exchanges.topic,
    pattern: "auth.#",
    handler: handleAuthEvent,
    description: "Handles user authentication and lifecycle events",
  },
];

