"use strict";

const { exchanges } = require("/app/shared/rabbitmq");

module.exports = [
  {
    name: "Company Lifecycle Events",
    exchange: exchanges.topic,
    events: [
      { key: "company.created", description: "A new company was registered" },
      { key: "company.updated", description: "Company profile updated" },
      { key: "company.deleted", description: "Company removed or deactivated" },
    ],
  },
  {
    name: "Subscription Events",
    exchange: exchanges.topic,
    events: [
      {
        key: "subscription.activated",
        description: "Company subscription activated",
      },
      {
        key: "subscription.renewed",
        description: "Subscription renewed successfully",
      },
      {
        key: "subscription.expired",
        description: "Subscription expired or downgraded",
      },
    ],
  },
];
