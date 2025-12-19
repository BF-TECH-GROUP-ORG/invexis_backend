/**
 * Outbox Dispatcher - Background Worker
 * Polls outbox table and publishes events to RabbitMQ
 * Implements transactional outbox pattern for reliable event publishing
 */

const Outbox = require('../models/Outbox');
const { emit } = require('../events/producer');
const logger = require('../utils/logger');

let dispatcherInterval = null;
let isProcessing = false;

/**
 * Start outbox dispatcher
 */
async function startOutboxDispatcher(intervalMs = 1000) {
  try {
    console.log(`🚀 Starting outbox dispatcher (interval: ${intervalMs}ms)`);
    setImmediate(() => processOutbox());

    dispatcherInterval = setInterval(() => {
      if (!isProcessing) {
        processOutbox().catch(error => {
          logger.error(`❌ Error in outbox dispatcher: ${error.message}`);
        });
      }
    }, intervalMs);

    console.log('✅ Outbox dispatcher started');
  } catch (error) {
    logger.error(`❌ Failed to start outbox dispatcher: ${error.message}`);
    throw error;
  }
}

/**
 * Stop outbox dispatcher
 */
async function stopOutboxDispatcher() {
  try {
    if (dispatcherInterval) {
      clearInterval(dispatcherInterval);
      logger.info('✅ Outbox dispatcher stopped');
    }
  } catch (error) {
    logger.error(`❌ Error stopping dispatcher: ${error.message}`);
  }
}

/**
 * Process pending outbox events
 */
async function processOutbox() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Reset stale processing events (older than 12 minutes)
    await Outbox.resetStaleProcessing(10);

    // Use claimPending to lock events and mark them as processing
    const pendingEvents = await Outbox.OutboxService.claimPending(50);

    if (pendingEvents.length === 0) return;

    logger.info(`📤 Processing ${pendingEvents.length} pending events`);

    for (const event of pendingEvents) {
      try {
        // Parse payload if needed
        const payload = typeof event.payload === 'string'
          ? JSON.parse(event.payload)
          : event.payload;

        // Emit to RabbitMQ
        await emit(event.routingKey, payload);

        // Mark as sent
        await Outbox.OutboxService.markAsSent(event._id);

        logger.info(
          `📤 Published ${event.routingKey} from outbox → OK (ID: ${event._id})`
        );
      } catch (error) {
        logger.error(
          `❌ Failed to publish event ${event._id}: ${error.message}`
        );

        // Mark as failed
        await Outbox.OutboxService.markAsFailed(event._id, error);
      }
    }
  } catch (error) {
    logger.error(`❌ Error processing outbox: ${error.message}`);
  } finally {
    isProcessing = false;
  }
}

/**
 * Get dispatcher status
 */
function getStatus() {
  return {
    running: !!dispatcherInterval,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  startOutboxDispatcher,
  stopOutboxDispatcher,
  processOutbox,
  getStatus
};

