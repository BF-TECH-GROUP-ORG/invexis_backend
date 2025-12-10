"use strict";

const Outbox = require("../models/outbox.model");
const { emit } = require("../events/producer");

async function processOutboxBatch() {
    const pendingEvents = await Outbox.findPending(50);

    if (pendingEvents.length === 0) {
        return;
    }

    console.log(`📦 Processing ${pendingEvents.length} outbox events...`);

    for (const event of pendingEvents) {
        try {
            await emit(event.routing_key, event.payload);

            await Outbox.markAsSent(event._id); // Mongoose uses _id
            console.log(
                `📤 Published ${event.routing_key} from outbox → OK (ID: ${event._id})`
            );
        } catch (error) {
            console.error(
                `❌ Failed to publish outbox event ${event._id}:`,
                error
            );
            await Outbox.markAsFailed(event._id, error);
        }
    }
}

async function startOutboxDispatcher(intervalMs = 5000) {
    console.log("🚀 Outbox Dispatcher started");
    setInterval(processOutboxBatch, intervalMs);
}

module.exports = { startOutboxDispatcher };
