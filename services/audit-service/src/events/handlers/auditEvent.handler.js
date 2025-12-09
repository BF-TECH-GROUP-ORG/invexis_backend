"use strict";

const AuditLog = require("../../models/AuditLog.model");

const handleAuditEvent = async (event, routingKey) => {
    try {
        // Avoid infinite loop if we audit our own audit events?
        // But since we listen to everything, we might want to filter out 'audit.*' if we publish them.
        if (routingKey.startsWith("audit.") || routingKey.startsWith("health.")) return;

        console.log(`📝 Auditing event: ${routingKey}`);

        await AuditLog.create({
            event_type: routingKey,
            source_service: event.source || "unknown",
            payload: event.data || event,
            metadata: { ...event, data: undefined }, // metadata excluding data
            occurred_at: event.emittedAt || new Date(),
        });

    } catch (error) {
        console.error("❌ Error saving audit log:", error.message);
    }
};

module.exports = handleAuditEvent;
