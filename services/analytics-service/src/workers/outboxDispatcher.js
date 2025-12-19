"use strict";

const Outbox = require("../models/outbox.model");
const { publish } = require("/app/shared/rabbitmq");
const { Op } = require("sequelize");

let dispatcherInterval = null;
let isProcessing = false;

const startOutboxDispatcher = async (intervalMs = 5000) => {
    console.log(`⏱️ Starting outbox dispatcher (interval: ${intervalMs}ms)`);
    setImmediate(() => processOutbox());

    dispatcherInterval = setInterval(() => {
        if (!isProcessing) {
            processOutbox().catch(err => {
                console.error("❌ Outbox dispatcher error:", err.message);
            });
        }
    }, intervalMs);
};

const stopOutboxDispatcher = () => {
    if (dispatcherInterval) {
        clearInterval(dispatcherInterval);
        dispatcherInterval = null;
    }
};

async function processOutbox() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        // Find pending events
        const pendingEvents = await Outbox.findAll({
            where: { status: "PENDING" },
            limit: 50,
            order: [["created_at", "ASC"]],
        });

        if (pendingEvents.length === 0) return;

        console.log(`📤 Processing ${pendingEvents.length} outbox events`);

        for (const event of pendingEvents) {
            try {
                // Update to PROCESSING? (Optional if not using that state, but good practice)
                // event.status = "PROCESSING"; await event.save(); 

                // Publish
                await publish(
                    event.exchange || 'events_topic',
                    event.routing_key,
                    event.payload
                );

                event.status = "SENT";
                event.updated_at = new Date();
                await event.save();

                console.log(`✅ Published ${event.routing_key} (ID: ${event.id})`);
            } catch (error) {
                console.error(`❌ Failed event ${event.id}:`, error.message);
                event.status = "FAILED";
                event.error = error.message;
                event.retries = (event.retries || 0) + 1;
                await event.save();
            }
        }
    } catch (error) {
        console.error("❌ Error processing outbox:", error.message);
    } finally {
        isProcessing = false;
    }
}

module.exports = { startOutboxDispatcher, stopOutboxDispatcher };
