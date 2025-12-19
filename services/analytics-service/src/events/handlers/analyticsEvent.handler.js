"use strict";

const AnalyticsEvent = require("../../models/AnalyticsEvent.model");
const IngestionController = require("../../controllers/IngestionController");

/**
 * Standard Event Structure Expected:
 * {
 *   type: "event.name",           // Required
 *   source: "service-name",       // Required (defaults to 'unknown')
 *   data: { ... },                // Event payload
 *   emittedAt: "ISO date",        // Timestamp
 *   id: "unique-id"               // Event ID
 * }
 */

const handleAnalyticsEvent = async (event, routingKey) => {
    try {
        const { data, emittedAt } = event || {};
        let { type, source } = event || {};

        // Fallback to routingKey if type is not in payload
        if (!type && routingKey) {
            type = routingKey;
        }

        // Default source if missing
        if (!source) {
            // Infer source from event type (e.g., "auth.user.created" -> "auth-service")
            if (type && type.includes('.')) {
                const prefix = type.split('.')[0];
                source = `${prefix}-service`;
            } else {
                source = 'unknown-service';
            }
        }

        if (!type) {
            console.warn('⚠️ Analytics: Received event without type', { routingKey, source });
            return;
        }

        // Ignore health checks
        if (type.startsWith("health.")) return;

        // 1. Store Raw Event (Log)
        await AnalyticsEvent.create({
            event_type: type,
            source_service: source,
            payload: data,
            time: emittedAt || new Date(),
            metadata: {
                rawEventId: event.id,
            },
        });

        // 2. Process for Metrics (Ingestion)
        switch (type) {
            case "sale.created":
                await IngestionController.processSaleCreated(event);
                break;
            case "inventory.stock.updated":
            case "inventory.product.updated":
                await IngestionController.processInventoryUpdated(event);
                break;
            case "company.created":
                await IngestionController.processCompanyCreated(event);
                break;
            case "company.updated":
                await IngestionController.processCompanyUpdated(event);
                break;
            case "shop.created":
                await IngestionController.processShopCreated(event);
                break;
            case "auth.user.registered":
            case "auth.user.created":
            case "auth.internal.user.registered":
            case "user.created":
                await IngestionController.processUserRegistered(event);
                break;
            case "auth.verification.requested":
            case "auth.session.created":
            case "auth.user.tenancy.assigned":
                // Expected but no metrics needed yet
                break;
            default:
                // Ignore other events
                if (type.startsWith('auth.')) {
                    // Silently ignore known auth events that don't need metrics
                }
                break;
        }

        console.log(`✅ Analytics: Processed ${type} from ${source}`);
    } catch (error) {
        console.error("❌ Analytics Handler Error:", error.message);
    }
};

module.exports = handleAnalyticsEvent;
