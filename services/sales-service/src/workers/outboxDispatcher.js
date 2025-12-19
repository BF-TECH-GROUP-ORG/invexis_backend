"use strict";

const Outbox = require("../models/Outbox.model");
const { emit } = require("../events/producer");
/**
 * Process a batch of pending outbox events
 * Reads events from outbox table and publishes them via producer.emit()
 */
let dispatcherInterval = null;
let isProcessing = false;

/**
 * Start the outbox dispatcher worker
 * @param {number} intervalMs - Interval in milliseconds (default: 5000)
 */
async function startOutboxDispatcher(intervalMs = 5000) {
  console.log("🚀 Outbox Dispatcher started (interval: " + intervalMs + "ms)");

  // Run immediately on startup
  setImmediate(() => processOutboxBatch());

  // Process outbox events periodically with guard
  dispatcherInterval = setInterval(() => {
    if (!isProcessing) {
      processOutboxBatch().catch(err => {
        console.error("❌ Outbox dispatcher error:", err.message);
      });
    }
  }, intervalMs);
}

/**
 * Process a batch of pending outbox events
 * Reads events from outbox table and publishes them via producer.emit()
 */
async function processOutboxBatch() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Reset stale processing events (crash recovery)
    await resetStaleEvents();

    // Use claimPending to lock events and mark them as processing
    // This prevents duplicate processing and race conditions
    const pendingEvents = await Outbox.OutboxService.claimPending(50);

    if (pendingEvents.length === 0) return;

    console.log(`📦 Processing ${pendingEvents.length} outbox events...`);

    for (const event of pendingEvents) {
      try {
        // Parse payload and publish via producer.emit()
        const payload =
          typeof event.payload === "string"
            ? JSON.parse(event.payload)
            : event.payload;

        await emit(event.routingKey, payload);

        // Mark as sent
        await Outbox.OutboxService.markAsSent(event.id);

        console.log(
          `📤 Published ${event.routingKey} from outbox → OK (ID: ${event.id})`
        );
      } catch (error) {
        console.error(
          `❌ Failed to publish outbox event ${event.id}:`,
          error.message
        );

        // Mark as failed and increment retry count
        await Outbox.OutboxService.markAsFailed(event.id, error);
      }
    }
  } catch (error) {
    console.error("❌ Error processing outbox batch:", error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Reset stale processing events (crash recovery)
 */
async function resetStaleEvents() {
  try {
    await Outbox.OutboxService.resetStaleProcessing(0.2);
  } catch (error) {
    console.error("❌ Error resetting stale events:", error);
  }
}

module.exports = {
  startOutboxDispatcher,
  processOutboxBatch,
  resetStaleEvents,
};
