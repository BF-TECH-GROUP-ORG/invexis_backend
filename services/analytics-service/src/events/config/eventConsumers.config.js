/**
 * @file eventConsumers.config.js
 * @description Consumer configuration for analytics-service.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handleAnalyticsEvent = require("../handlers/analyticsEvent.handler");

module.exports = [
    {
        name: "analyticsAllEvents",
        queue: "analytics_service_queue",
        exchange: exchanges.topic,
        pattern: "#", // Listen to everything for broad analytics
        handler: handleAnalyticsEvent,
        description: "Captures all events for data analysis",
    },
];
