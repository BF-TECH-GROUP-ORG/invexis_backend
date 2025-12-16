"use strict";

const { exchanges } = require("/app/shared/rabbitmq");

module.exports = [
  {
    name: "Shop Lifecycle Events",
    exchange: exchanges.topic,
    events: [
      { key: "shop.created", description: "A new shop was created" },
      { key: "shop.updated", description: "Shop details were updated" },
      { key: "shop.status.changed", description: "Shop status changed (open/closed)" },
      { key: "shop.deleted", description: "Shop was deleted or closed" },
      { key: "shop.settings.updated", description: "Shop settings/preferences updated" },
    ],
  },
  {
    name: "Shop Department Events",
    exchange: exchanges.topic,
    events: [
      { key: "shop.department.created", description: "A new department was created" },
      { key: "shop.department.updated", description: "Department details were updated" },
      { key: "shop.department.deleted", description: "Department was deleted" },
    ],
  },
];

