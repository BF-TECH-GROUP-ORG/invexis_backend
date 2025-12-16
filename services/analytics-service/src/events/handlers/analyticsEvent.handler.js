"use strict";

const AnalyticsEvent = require("../../models/AnalyticsEvent.model");
const IngestionController = require("../../controllers/IngestionController");

const handleAnalyticsEvent = async (event, routingKey) => {
    try {
        const { data, source, emittedAt } = event || {};
        let { type } = event || {};

        // Fallback to routingKey if type is not in payload
        // This is common for simple messages or health checks
        if (!type && routingKey) {
            type = routingKey;
        }

        if (!type) {
            // If we still don't have a type, we can't process it
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
            case "auth.user.registered": // standard from auth service usually
            case "user.created":
                await IngestionController.processUserRegistered(event);
                break;
            default:
                // Ignore other events for ingestion
                break;
        }

        console.log(`✅ Analytics: Processed ${type} from ${source}`);
    } catch (error) {
        console.error("❌ Analytics Handler Error:", error.message);
    }
};

module.exports = handleAnalyticsEvent;
