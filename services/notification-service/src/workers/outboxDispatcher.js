"use strict";

const Outbox = require("../models/Outbox");
const { publish } = require("/app/shared/rabbitmq");

let dispatcherInterval = null;
let isProcessing = false;

/**
 * Start outbox dispatcher
 * Processes pending events and publishes them to RabbitMQ
 * @param {number} intervalMs - Interval in milliseconds
 */
const startOutboxDispatcher = async (intervalMs = 5000) => {
    console.log(`⏱️ Starting outbox dispatcher (interval: ${intervalMs}ms)`);

    // Run immediately on startup (but don't await)
    setImmediate(() => processOutbox());

    // Then run periodically
    dispatcherInterval = setInterval(() => {
        if (!isProcessing) {
            processOutbox().catch(err => {
                console.error("❌ Outbox dispatcher error:", err.message);
            });
        }
    }, intervalMs);
};

/**
 * Stop outbox dispatcher
 */
const stopOutboxDispatcher = () => {
    if (dispatcherInterval) {
        clearInterval(dispatcherInterval);
        dispatcherInterval = null;
        console.log("⏹️ Outbox dispatcher stopped");
    }
};

/**
 * Process pending outbox events
 */
async function processOutbox() {
    if (isProcessing) {
        return; // Skip if already processing
    }

    isProcessing = true;

    try {
        // Reset stale processing events (older than 30 seconds)
        try {
            await Outbox.resetStaleProcessing(0.5);
        } catch (resetErr) {
            console.warn('⚠️ Failed to reset stale events:', resetErr.message);
        }

        // Fetch pending events
        const pendingEvents = await Outbox.findPending(50);

        if (pendingEvents.length === 0) {
            return;
        }

        console.log(`📤 Processing ${pendingEvents.length} pending outbox events`);

        // Process events one by one
        for (const event of pendingEvents) {
            try {
                // Mark as processing
                await Outbox.markAsProcessing(event.id);

                // Parse payload if it's a string
                const payload = typeof event.payload === "string"
                    ? JSON.parse(event.payload)
                    : event.payload;

                // Publish to RabbitMQ
                await publish(
                    event.exchange || 'events_topic',
                    payload,
                    { routingKey: event.routingKey }
                );

                // Mark as sent
                await Outbox.markAsSent(event.id);

                console.log(`✅ Published ${event.routingKey} from outbox (ID: ${event.id})`);
            } catch (error) {
                console.error(`❌ Failed to publish event ${event.id}:`, error.message);

                // Mark as failed
                try {
                    await Outbox.markAsFailed(event.id, error);
                } catch (markErr) {
                    console.error(`❌ Failed to mark event ${event.id} as failed:`, markErr.message);
                }
            }
        }
    } catch (error) {
        console.error("❌ Error processing outbox:", error.message);
    } finally {
        isProcessing = false;
    }
}

module.exports = {
    startOutboxDispatcher,
    stopOutboxDispatcher,
    processOutbox,
};
