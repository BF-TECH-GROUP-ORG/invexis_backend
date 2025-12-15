/**
 * Outbox Dispatcher - Background Worker
 * Polls outbox collection and publishes events to RabbitMQ
 * Implements transactional outbox pattern for reliable event publishing
 */

const Outbox = require('../models/Outbox.models');
const { emit } = require('../events/producer');
const logger = require('../utils/logger.js');

let dispatcherInterval = null;
let isProcessing = false;

/**
 * Start outbox dispatcher
 */
async function startOutboxDispatcher(intervalMs = 1000) {
  try {
    logger.info(`🚀 Starting outbox dispatcher (interval: ${intervalMs}ms)`);

    dispatcherInterval = setInterval(async () => {
      if (isProcessing) return;
      try {
        isProcessing = true;
        await processOutbox();
      } catch (error) {
        logger.error(`❌ Error in outbox dispatcher: ${error.message}`);
      } finally {
        isProcessing = false;
      }
    }, intervalMs);

    logger.info('✅ Outbox dispatcher started');
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

      // Wait for current processing to finish (max 5 seconds)
      let retries = 0;
      while (isProcessing && retries < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      logger.info('✅ Outbox dispatcher stopped');
    }
  } catch (error) {
    logger.error(`❌ Error stopping dispatcher: ${error.message}`);
  }
}

/**
 * Calculate next retry time with exponential backoff
 */
function getNextRetryDate(attempts) {
  // Exponential backoff: 2s, 4s, 8s, 16s, 32s
  const delaySeconds = Math.pow(2, attempts + 1);
  return new Date(Date.now() + delaySeconds * 1000);
}

/**
 * Process pending outbox events
 */
async function processOutbox() {
  try {
    // Reset stale processing events (older than 12 minutes)
    await Outbox.resetStaleProcessing(0.2);

    // Fetch pending events
    const pendingEvents = await Outbox.OutboxService.fetchBatch(50);

    // Fetch failed events ready for retry
    const retryEvents = await Outbox.OutboxService.fetchFailedForRetry(20);

    const eventsToProcess = [...pendingEvents, ...retryEvents];

    if (eventsToProcess.length === 0) return;

    logger.info(`📤 Processing ${eventsToProcess.length} events (${pendingEvents.length} pending, ${retryEvents.length} retries)`);

    for (const event of eventsToProcess) {
      try {
        // Mark as processing
        await Outbox.markAsProcessing(event._id);

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

        const currentAttempts = (event.attempts || 0) + 1;

        if (currentAttempts >= 5) {
          // Max attempts reached, move to dead letter
          await Outbox.OutboxService.markAsDeadLetter(event._id, error);
          logger.error(`💀 Event ${event._id} moved to dead letter queue after ${currentAttempts} attempts`);
        } else {
          // Schedule retry
          const nextRetry = getNextRetryDate(currentAttempts);

          await Outbox.findByIdAndUpdate(event._id, {
            status: 'failed',
            lastError: error.message,
            attempts: currentAttempts,
            nextRetryAt: nextRetry,
            updatedAt: new Date()
          });

          logger.info(`Checking retry for event ${event._id} in ${Math.round((nextRetry - Date.now()) / 1000)}s`);
        }
      }
    }
  } catch (error) {
    logger.error(`❌ Error processing outbox: ${error.message}`);
  }
}

/**
 * Get dispatcher status
 */
function getStatus() {
  return {
    running: !!dispatcherInterval,
    processing: isProcessing,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  startOutboxDispatcher,
  stopOutboxDispatcher,
  processOutbox,
  getStatus
};

