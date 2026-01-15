"use strict";

const { exchanges } = require("/app/shared/rabbitmq");

module.exports = [
  {
    name: "Company Lifecycle Events",
    exchange: exchanges.topic,
    events: [
      { key: "company.created", description: "A new company was registered" },
      { key: "company.updated", description: "Company profile updated" },
      { key: "company.status.changed", description: "Company status changed" },
      { key: "company.suspended", description: "Company suspended" },
      { key: "company.allSuspended", description: "All users suspended from company" },
      { key: "company.creation.success", description: "Company creation process completed" },
      { key: "company.tier.changed", description: "Company subscription tier changed" },
      { key: "company.deleted", description: "Company removed or deactivated" },
    ],
  },
  {
    name: "Subscription Events",
    exchange: exchanges.topic,
    events: [
      {
        key: "subscription.created",
        description: "A new company subscription was created",
      },
      {
        key: "subscription.activated",
        description: "Company subscription activated",
      },
      {
        key: "subscription.renewed",
        description: "Subscription renewed successfully",
      },
      {
        key: "subscription.updated",
        description: "Subscription details updated",
      },
      {
        key: "subscription.deactivated",
        description: "Subscription deactivated",
      },
      {
        key: "subscription.expired",
        description: "Subscription expired or downgraded",
      },
      {
        key: "subscription.expiring",
        description: "Subscription expiring soon",
      },
    ],
  },
  {
    name: "Department User Events",
    exchange: exchanges.topic,
    events: [
      {
        key: "department_user.assigned",
        description: "User assigned to a department",
      },
      {
        key: "department_user.role_changed",
        description: "User role in department changed",
      },
      {
        key: "department_user.suspended",
        description: "User suspended from department",
      },
      {
        key: "department_user.removed",
        description: "User removed from department",
      },
      {
        key: "department_user.removed_from_company",
        description: "All user permissions removed from company",
      },
    ],
  },
];
