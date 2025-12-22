/**
 * @file eventConsumers.config.js
 * @description Consumer configuration for analytics-service.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handleAnalyticsEvent = require("../handlers/analyticsEvent.handler");
const handleDebtEvent = require("../handlers/debtEvent.handler");

module.exports = [
    {
        name: "analyticsDebtEvents",
        queue: "analytics_debt_queue",
        exchange: exchanges.topic,
        pattern: "debt.#", // Listen to all debt events
        handler: handleDebtEvent,
        description: "Specialized handler for debt metrics",
    },
    {
        name: "analyticsReturnEvents",
        queue: "analytics_return_queue",
        exchange: exchanges.topic,
        pattern: "sale.return.#",
        handler: require("../handlers/returnEvent.handler"),
        description: "Tracks product returns",
    },
    {
        name: "analyticsCustomerPurchases",
        queue: "analytics_customer_queue", // Shared queue for customer metrics
        exchange: exchanges.topic,
        pattern: "sale.created",
        handler: require("../handlers/customerEvent.handler"),
        description: "Tracks customer purchases for LTV",
    },
    {
        name: "analyticsCustomerDebts",
        queue: "analytics_customer_queue",
        exchange: exchanges.topic,
        pattern: "debt.#",
        handler: require("../handlers/customerEvent.handler"),
        description: "Tracks customer debt behavior",
    },
    {
        name: "analyticsCustomerAcquisition",
        queue: "analytics_customer_queue",
        exchange: exchanges.topic,
        pattern: "user.created",
        handler: require("../handlers/customerEvent.handler"),
        description: "Tracks new customer acquisition",
    },
    {
        name: "analyticsAllEvents",
        queue: "analytics_service_queue",
        exchange: exchanges.topic,
        pattern: "#", // Listen to everything for broad analytics
        handler: handleAnalyticsEvent,
        description: "Captures all events for data analysis",
    },
];
