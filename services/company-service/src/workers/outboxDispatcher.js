"use strict";

const Outbox = require("../models/outbox.model");
const { publish } = require("/app/shared/rabbitmq");

async function processOutboxBatch() {
  const pendingEvents = await Outbox.findPending(50);

  for (const event of pendingEvents) {
    try {
      const payload = JSON.parse(event.payload);
      await publish(event.exchange, event.routing_key, payload);
      await Outbox.markAsSent(event.id);
      console.log(`📤 Published ${event.routing_key} from outbox → OK`);
    } catch (error) {
      console.error(`❌ Failed to publish outbox event ${event.id}:`, error.message);
      await Outbox.markAsFailed(event.id, error);
    }
  }
}

async function startOutboxDispatcher(intervalMs = 5000) {
  console.log("🚀 Outbox Dispatcher started");
  setInterval(processOutboxBatch, intervalMs);
}

module.exports = { startOutboxDispatcher };
