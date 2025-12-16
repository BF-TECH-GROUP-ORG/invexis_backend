/**
 * @file eventConsumers.config.js
 * @description Consumer configuration for audit-service.
 * Listens to all events to create audit logs.
 */

const { exchanges } = require("/app/shared/rabbitmq");
const handleAuditEvent = require("../handlers/auditEvent.handler");

module.exports = [
    {
        name: "auditAllEvents",
        queue: "audit_service_queue",
        exchange: exchanges.topic,
        pattern: "#", // Listen to everything
        handler: handleAuditEvent,
        description: "Captures all events for auditing purposes",
    },
];
