"use strict";

const Outbox = require("../models/outbox.model");
const { emit } = require("../events/producer");
const { Op } = require("sequelize");

async function processOutboxBatch() {
    // Find pending events (Sequelize style)
    const pendingEvents = await Outbox.findAll({
        where: { status: "PENDING" },
        limit: 50,
        order: [["created_at", "ASC"]],
    });

    if (pendingEvents.length === 0) {
        return;
    }

    console.log(`📦 Processing ${pendingEvents.length} outbox events...`);

    for (const event of pendingEvents) {
        try {
            await emit(event.routing_key, event.payload);

            // updates event instance directly
            event.status = "SENT";
            event.updated_at = new Date();
            await event.save();

            console.log(
                `📤 Published ${event.routing_key} from outbox → OK (ID: ${event.id})`
            );
        } catch (error) {
            console.error(
                `❌ Failed to publish outbox event ${event.id}:`,
                error
            );

            event.status = "FAILED";
            event.error = error.message;
            event.retries += 1;
            await event.save();
        }
    }
}

async function startOutboxDispatcher(intervalMs = 5000) {
    console.log("🚀 Outbox Dispatcher started");
    setInterval(processOutboxBatch, intervalMs);
}

module.exports = { startOutboxDispatcher };
