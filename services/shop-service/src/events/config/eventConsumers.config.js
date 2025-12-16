"use strict";

const { exchanges } = require("/app/shared/rabbitmq");
const handleCompanyEvent = require("../handlers/companyEvent.handler");
const handleInventoryEvent = require("../handlers/inventoryEvent.handler");

module.exports = [
  {
    name: "companyEvents",
    queue: "shop_company_events_queue",
    exchange: exchanges.topic,
    pattern: "company.#",
    handler: handleCompanyEvent,
    description: "Handles company lifecycle events from company-service",
  },
  {
    name: "inventoryEvents",
    queue: "shop_inventory_events_queue",
    exchange: exchanges.topic,
    pattern: "inventory.#",
    handler: handleInventoryEvent,
    description: "Handles inventory events from inventory-service",
  },
];

