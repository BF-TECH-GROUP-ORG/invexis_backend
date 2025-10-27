"use strict";

const { OutboxService } = require("../models/Outbox.model");
const { publish } = require("/app/shared/rabbitmq");

/**
 * Process a batch of pending outbox events
 */
async function processOutboxBatch() {
  try {
    const pendingEvents = await OutboxService.findPending(50);

    if (pendingEvents.length === 0) {
      return;
    }

    console.log(`📦 Processing ${pendingEvents.length} outbox events...`);

    for (const event of pendingEvents) {
      try {
        // Publish to RabbitMQ
        await publish(event.exchange, event.routingKey, event.payload);
        
        // Mark as sent
        await OutboxService.markAsSent(event.id);
        
        console.log(
          `📤 Published ${event.routingKey} from outbox → OK (ID: ${event.id})`
        );
      } catch (error) {
        console.error(
          `❌ Failed to publish outbox event ${event.id}:`,
          error.message
        );
        
        // Mark as failed and increment retry count
        await OutboxService.markAsFailed(event.id, error);
      }
    }
  } catch (error) {
    console.error("❌ Error processing outbox batch:", error.message);
  }
}

/**
 * Reset stale processing events (crash recovery)
 */
async function resetStaleEvents() {
  try {
    await OutboxService.resetStaleProcessing(5);
  } catch (error) {
    console.error("❌ Error resetting stale events:", error.message);
  }
}

/**
 * Start the outbox dispatcher worker
 * @param {number} intervalMs - Interval in milliseconds (default: 5000)
 */
async function startOutboxDispatcher(intervalMs = 5000) {
  console.log("🚀 Outbox Dispatcher started (interval: " + intervalMs + "ms)");

  // Reset stale events on startup
  await resetStaleEvents();

  // Process outbox events periodically
  setInterval(async () => {
    await processOutboxBatch();
  }, intervalMs);

  // Reset stale events periodically (every minute)
  setInterval(async () => {
    await resetStaleEvents();
  }, 60000);
}

/**
 * Get outbox statistics
 */
async function getOutboxStats() {
  try {
    const stats = await OutboxService.getStats();
    console.log("📊 Outbox Stats:", stats);
    return stats;
  } catch (error) {
    console.error("❌ Error getting outbox stats:", error.message);
    return null;
  }
}

module.exports = {
  startOutboxDispatcher,
  processOutboxBatch,
  resetStaleEvents,
  getOutboxStats,
};

