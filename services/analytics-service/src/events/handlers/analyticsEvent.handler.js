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

            // Validate sale event payload alignment
            if (type === 'sale.created') {
                if (!data.companyId) {
                    console.error('❌ Analytics: sale.created event missing companyId', { event });
                    return;
                }
                if (!Array.isArray(data.items) || !data.items.length) {
                    console.error('❌ Analytics: sale.created event missing items array', { event });
                    return;
                }
                // Validate each item
                const validItems = data.items.filter(item => {
                    if (!item.productId) {
                        console.error('❌ Analytics: sale.created item missing productId', { item });
                        return false;
                    }
                    // Check numeric fields for overflow/null
                    const numericFields = ['quantity', 'unitPrice', 'costPrice', 'discount', 'tax', 'total'];
                    for (const field of numericFields) {
                        if (item[field] == null || isNaN(Number(item[field]))) {
                            console.error(`❌ Analytics: sale.created item missing or invalid numeric field ${field}`, { item });
                            return false;
                        }
                        // Example overflow check (customize as needed)
                        if (Math.abs(Number(item[field])) > 1e12) {
                            console.error(`❌ Analytics: sale.created item numeric field overflow ${field}`, { item });
                            return false;
                        }
                    }
                    return true;
                });
                if (!validItems.length) {
                    console.error('❌ Analytics: sale.created event has no valid items', { event });
                    return;
                }
                // Replace items with validated items
                data.items = validItems;
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
        } catch (err) {
            console.error('❌ AnalyticsEvent handler crashed:', err);
        }
    } catch (error) {
        console.error('❌ AnalyticsEvent handler error:', error);
    }
};

module.exports = handleAnalyticsEvent;
