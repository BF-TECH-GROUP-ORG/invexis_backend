"use strict";

const { Outbox } = require("../models/index.model");
const { emit } = require("../events/producer");

let dispatcherInterval = null;

/**
 * Start outbox dispatcher
 * Processes pending events and publishes them to RabbitMQ
 * @param {number} intervalMs - Interval in milliseconds
 */
const startOutboxDispatcher = async (intervalMs = 5000) => {
  console.log(`⏱️ Starting outbox dispatcher (interval: ${intervalMs}ms)`);

  // Run immediately on startup
  await processOutbox();

  // Then run periodically
  dispatcherInterval = setInterval(async () => {
    try {
      await processOutbox();
    } catch (error) {
      console.error("❌ Error in outbox dispatcher:", error.message);
    }
  }, intervalMs);
};

/**
 * Stop outbox dispatcher
 */
const stopOutboxDispatcher = () => {
  if (dispatcherInterval) {
    clearInterval(dispatcherInterval);
    console.log("⏹️ Outbox dispatcher stopped");
  }
};

/**
 * Process pending outbox events
 */
async function processOutbox() {
  try {
    // Reset stale processing events (older than 0.2 minutes = 12 seconds)
    await Outbox.resetStaleProcessing(0.2);

    // Fetch pending events
    const pendingEvents = await Outbox.OutboxService.fetchBatch(50);

    if (pendingEvents.length === 0) {
      return;
    }

    console.log(`📤 Processing ${pendingEvents.length} pending events`);

    for (const event of pendingEvents) {
      try {
        // Mark as processing
        await Outbox.markAsProcessing(event.id);

        // Parse payload if it's a string
        const payload = typeof event.payload === "string" 
          ? JSON.parse(event.payload) 
          : event.payload;

        // Emit to RabbitMQ
        await emit(event.routingKey, payload);

        // Mark as sent
        await Outbox.OutboxService.markAsSent(event.id);

        console.log(
          `📤 Published ${event.routingKey} from outbox → OK (ID: ${event.id})`
        );
      } catch (error) {
        console.error(
          `❌ Failed to publish event ${event.id}:`,
          error.message
        );

        // Mark as failed
        await Outbox.OutboxService.markAsFailed(event.id, error);

        // Log failure
        console.error(
          `📤 Published ${event.routingKey} from outbox → FAILED (ID: ${event.id})`
        );
      }
    }
  } catch (error) {
    console.error("❌ Error processing outbox:", error.message);
  }
}

module.exports = {
  startOutboxDispatcher,
  stopOutboxDispatcher,
  processOutbox,
};

