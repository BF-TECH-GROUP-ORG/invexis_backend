"use strict";

const { Outbox } = require("../models/index.model");
const { emit } = require("../events/producer");
const db = require("../config/db");

let dispatcherInterval = null;
let isProcessing = false;

/**
 * Start outbox dispatcher
 * Processes pending events and publishes them to RabbitMQ
 * @param {number} intervalMs - Interval in milliseconds
 */
const startOutboxDispatcher = async (intervalMs = 5000) => {
  console.log(`⏱️ Starting outbox dispatcher (interval: ${intervalMs}ms)`);

  // Run immediately on startup
  setImmediate(() => processOutbox());

  // Then run periodically
  dispatcherInterval = setInterval(async () => {
    if (!isProcessing) {
      processOutbox().catch(err => {
        console.error("❌ Error in outbox dispatcher:", err.message);
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
  let trx = null;

  try {
    // Test connection first
    try {
      await db.raw('SELECT 1');
    } catch (connErr) {
      console.warn('⚠️ Database not available, skipping outbox processing');
      return;
    }

    // Reset stale processing events (using separate query)
    try {
      await Outbox.resetStaleProcessing(0.2);
    } catch (resetErr) {
      console.warn('⚠️ Failed to reset stale events:', resetErr.message);
    }

    // Fetch pending events
    const pendingEvents = await Outbox.OutboxService.fetchBatch(50);

    if (pendingEvents.length === 0) {
      return;
    }

    console.log(`📤 Processing ${pendingEvents.length} pending events`);

    // Process events one by one (not in transaction to avoid long locks)
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
          `✅ Published ${event.routingKey} from outbox (ID: ${event.id})`
        );
      } catch (error) {
        console.error(
          `❌ Failed to publish event ${event.id}:`,
          error.message
        );

        // Mark as failed
        try {
          await Outbox.OutboxService.markAsFailed(event.id, error);
        } catch (markErr) {
          console.error(`❌ Failed to mark event ${event.id} as failed:`, markErr.message);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error processing outbox:", error.message);
  } finally {
    if (trx) {
      try {
        await trx.rollback();
      } catch (rollbackErr) {
        // Ignore rollback errors
      }
    }
    isProcessing = false;
  }
}

module.exports = {
  startOutboxDispatcher,
  stopOutboxDispatcher,
  processOutbox,
};

