"use strict";

const AnalyticsEvent = require("../../models/AnalyticsEvent.model");

const handleAnalyticsEvent = async (event, routingKey) => {
    try {
        // Analytics service might want to track specific business metrics or everything
        // For now, let's track everything that reaches here.

        // Check if it's an analytics event or just a regular event we want to analyze.
        // If we want to store *all* events as data points:

        console.log(`📊 analyzing event: ${routingKey}`);

        await AnalyticsEvent.create({
            event_type: routingKey,
            source_service: event.source || "unknown",
            payload: event.data || event,
            metadata: { ...event, data: undefined },
            time: event.emittedAt || new Date(),
        });

    } catch (error) {
        console.error("❌ Error saving analytics event:", error.message);
    }
};

module.exports = handleAnalyticsEvent;
