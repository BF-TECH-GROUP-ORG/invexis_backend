"use strict";

const AuditLog = require("../../models/AuditLog.model");

const handleAuditEvent = async (event, routingKey) => {
    try {
        // Filter out self-generated events or health checks to prevent loops/noise
        if (routingKey.startsWith("audit.") || routingKey.startsWith("health.")) return;

        const { data, source, emittedAt } = event || {};

        // Extract common identifiers
        const payload = data || event; // Fallback if structure is flat
        const companyId = payload.companyId || (event.metadata && event.metadata.companyId);
        const userId = payload.userId || (event.metadata && event.metadata.userId);

        // Try to identify the primary entity
        let entityId = payload.id || payload._id; // Default to generic ID
        let entityType = "unknown";

        // Heuristic for entity ID based on routingKey (e.g., 'order.created')
        const parts = routingKey.split('.');
        if (parts.length >= 2) {
            entityType = parts[0] === 'ecommerce' ? parts[1] : parts[0]; // e.g. 'order', 'product', 'user'

            // Look for specific ID fields based on type
            if (payload[`${entityType}Id`]) {
                entityId = payload[`${entityType}Id`];
            }
        }

        console.log(`📝 Auditing: ${routingKey} (Entity: ${entityType}:${entityId})`);

        await AuditLog.create({
            event_type: routingKey,
            source_service: source || event.source || "unknown",
            companyId,
            userId,
            entityId: entityId ? String(entityId) : undefined,
            entityType,
            payload: payload,
            metadata: { ...event, data: undefined }, // metadata excluding data
            occurred_at: emittedAt || new Date(),
        });

    } catch (error) {
        console.error("❌ Error saving audit log:", error.message);
    }
};

module.exports = handleAuditEvent;
