"use strict";

const AuditLog = require("../../models/AuditLog.model");
const { getEventBus } = require('/app/shared/events');

/**
 * Classify event severity based on event type and data
 */
function classifySeverity(routingKey, payload) {
    const critical = [
        'company.suspended', 'company.deleted', 'company.allSuspended',
        'user.suspended', 'user.deleted', 'payment.failed',
        'subscription.expired', 'inventory.out_of_stock', 'inventory.out.of.stock',
        'debt.overdue', 'debt.reminder.overdue'
    ];

    const high = [
        'sale.cancelled', 'sale.refunded', 'sale.return.created',
        'shop.deleted', 'debt.created', 'payment.refunded',
        'subscription.expiring'
    ];

    const medium = [
        'shop.created', 'shop.updated', 'sale.created',
        'inventory.low_stock', 'inventory.low.stock',
        'debt.repayment.created', 'debt.status.updated'
    ];

    if (critical.some(pattern => routingKey.includes(pattern))) return 'critical';
    if (high.some(pattern => routingKey.includes(pattern))) return 'high';
    if (medium.some(pattern => routingKey.includes(pattern))) return 'medium';
    return 'low';
}

/**
 * Classify event category
 */
function classifyCategory(routingKey) {
    if (routingKey.startsWith('user.') || routingKey.startsWith('auth.')) {
        return 'auth';
    }
    if (routingKey.startsWith('company.') || routingKey.startsWith('shop.')) {
        return 'config';
    }
    if (routingKey.includes('inventory') || routingKey.includes('sale') || routingKey.includes('debt')) {
        return 'business';
    }
    if (routingKey.includes('payment') || routingKey.includes('subscription')) {
        return 'financial';
    }
    return 'operational';
}

/**
 * Classify log type for access control
 */
function classifyLogType(routingKey, severity) {
    // System logs - infrastructure, health, internal errors
    if (routingKey.startsWith('system.') || routingKey.startsWith('health.')) {
        return 'system';
    }

    // Security logs - auth, suspension, critical events
    if (routingKey.startsWith('auth.') || routingKey.startsWith('user.') ||
        severity === 'critical' || routingKey.includes('suspended') ||
        routingKey.includes('deleted') || routingKey.includes('failed')) {
        return 'security';
    }

    // Business logs - normal operations
    return 'business';
}

/**
 * Safely extract shopId from event data with multiple fallback strategies
 */
function extractShopId(payload, routingKey) {
    if (!payload) return undefined;

    // Direct shopId
    if (payload.shopId) return String(payload.shopId);

    // Check nested structures
    if (payload.shop?.shopId) return String(payload.shop.shopId);
    if (payload.shop?.id) return String(payload.shop.id);
    if (payload.data?.shopId) return String(payload.data.shopId);

    // For sale events, check sale object
    if (payload.sale?.shopId) return String(payload.sale.shopId);

    // For shop events, check id field
    if (routingKey.startsWith('shop.') && payload.id) {
        return String(payload.id);
    }
    if (routingKey.startsWith('shop.') && payload._id) {
        return String(payload._id);
    }

    return undefined;
}

const handleAuditEvent = async (event, routingKey) => {
    try {
        // Filter out self-generated events or health checks to prevent loops/noise
        if (routingKey.startsWith("audit.") || routingKey.startsWith("health.")) return;

        const { data, source, emittedAt } = event || {};

        // Extract common identifiers
        const payload = data || event; // Fallback if structure is flat
        const companyId = payload.companyId || (event.metadata && event.metadata.companyId);
        const userId = payload.userId || (event.metadata && event.metadata.userId);
        const workerId = payload.workerId || payload.soldBy || (event.metadata && event.metadata.workerId);

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

        // Extract shopId safely
        const shopId = extractShopId(payload, routingKey);

        // Classify the event
        const severity = classifySeverity(routingKey, payload);
        const category = classifyCategory(routingKey);
        const logType = classifyLogType(routingKey, severity);

        console.log(`📝 Auditing: ${routingKey} (Entity: ${entityType}:${entityId}, Severity: ${severity}, Type: ${logType})`);

        // Create audit log
        const auditLog = await AuditLog.create({
            event_type: routingKey,
            source_service: source || event.source || "unknown",
            companyId,
            shopId,
            userId,
            workerId,
            entityId: entityId ? String(entityId) : undefined,
            entityType,
            severity,
            category,
            logType,
            payload: payload,
            metadata: { ...event, data: undefined }, // metadata excluding data
            occurred_at: emittedAt || new Date(),
        });

        // Emit notification for critical logs
        if (severity === 'critical') {
            try {
                const eventBus = getEventBus();
                await eventBus.emit('audit.critical.log', {
                    logId: auditLog._id,
                    event_type: routingKey,
                    severity,
                    category,
                    logType,
                    companyId,
                    shopId,
                    description: `Critical event: ${routingKey}`,
                    occurred_at: auditLog.occurred_at,
                    payload: {
                        entityType,
                        entityId,
                        userId,
                        workerId
                    }
                }, 'audit-service');
                console.log(`🚨 Critical log notification emitted for ${routingKey}`);
            } catch (emitError) {
                console.error('❌ Failed to emit critical log notification:', emitError.message);
            }
        }

    } catch (error) {
        console.error("❌ Error saving audit log:", error.message);
    }
};

module.exports = handleAuditEvent;

