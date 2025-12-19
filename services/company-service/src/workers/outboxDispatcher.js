"use strict";

const Outbox = require("../models/outbox.model");
const { emit } = require("../events/producer");

/**
 * Process a batch of pending outbox events
 * Reads events from outbox table and publishes them via producer.emit()
 */
async function processOutboxBatch() {
  const pendingEvents = await Outbox.findPending(50);

  if (pendingEvents.length === 0) {
    return;
  }

  console.log(`📦 Processing ${pendingEvents.length} outbox events...`);

  for (const event of pendingEvents) {
    try {
      // Parse payload and publish via producer.emit()
      // const payload = JSON.parse(event.payload);
      await emit(event.routing_key, event.payload);

      // Mark as sent in outbox
      await Outbox.markAsSent(event.id);
      console.log(
        `📤 Published ${event.routing_key} from outbox → OK (ID: ${event.id})`
      );
    } catch (error) {
      console.error(
        `❌ Failed to publish outbox event ${event.id}:`,
        error
      );
      // Mark as failed and increment retry count
      await Outbox.markAsFailed(event.id, error);
    }
  }
}

let isProcessing = false;

async function startOutboxDispatcher(intervalMs = 5000) {
  console.log("🚀 Outbox Dispatcher started");

  const run = async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await processOutboxBatch();
    } catch (error) {
      console.error("❌ Error in outbox dispatcher:", error);
    } finally {
      isProcessing = false;
      setTimeout(run, intervalMs);
    }
  };

  // Initial start
  run();
}

module.exports = { startOutboxDispatcher };
