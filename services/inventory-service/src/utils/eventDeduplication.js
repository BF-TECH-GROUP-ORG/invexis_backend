/**
 * Event Deduplication Utility
 * Prevents duplicate event processing using ProcessedEvent model
 * Implements TTL-based cleanup for processed events
 */

const ProcessedEvent = require('../models/ProcessedEvent');
const logger = require('./logger');

/**
 * Check if an event has already been processed
 * @param {String} eventId - Unique event identifier (from event payload or message ID)
 * @param {String} eventType - Type of event (e.g., 'inventory.product.created')
 * @returns {Boolean} - True if event was already processed
 */
async function isEventProcessed(eventId, eventType) {
    try {
        const processed = await ProcessedEvent.findOne({
            key: eventId,
            type: eventType
        });

        if (processed) {
            logger.warn(`🔄 Duplicate event detected and skipped`, {
                key: eventId,
                type: eventType,
                processedAt: processed.processedAt
            });
            return true;
        }

        return false;
    } catch (error) {
        logger.error(`❌ Error checking event deduplication:`, error);
        // On error, allow processing to avoid blocking legitimate events
        return false;
    }
}

/**
 * Mark an event as processed
 * @param {String} eventId - Unique event identifier
 * @param {String} eventType - Type of event
 * @param {Object} metadata - Optional metadata about the processing
 * @returns {Object} - ProcessedEvent document
 */
async function markEventAsProcessed(eventId, eventType, metadata = {}) {
    try {
        const processedEvent = await ProcessedEvent.create({
            key: eventId,
            type: eventType,
            processedAt: new Date(),
            payloadSummary: metadata
        });

        logger.debug(`✅ Event marked as processed`, {
            key: eventId,
            type: eventType
        });

        return processedEvent;
    } catch (error) {
        // If duplicate key error, event was already marked (race condition)
        if (error.code === 11000) {
            logger.warn(`🔄 Event already marked as processed (race condition)`, {
                eventId,
                eventType
            });
            return null;
        }

        logger.error(`❌ Error marking event as processed:`, error);
        throw error;
    }
}

/**
 * Process event with automatic deduplication
 * Wraps event handler with deduplication logic
 * @param {String} eventId - Unique event identifier
 * @param {String} eventType - Type of event
 * @param {Function} handler - Async function to execute if event not processed
 * @param {Object} metadata - Optional metadata
 * @returns {Object} - Result of handler or null if duplicate
 */
async function processEventOnce(eventId, eventType, handler, metadata = {}) {
    try {
        // Check if already processed
        const alreadyProcessed = await isEventProcessed(eventId, eventType);
        if (alreadyProcessed) {
            return { duplicate: true, processed: false };
        }

        // Execute handler
        const result = await handler();

        // Mark as processed
        await markEventAsProcessed(eventId, eventType, metadata);

        return { duplicate: false, processed: true, result };
    } catch (error) {
        logger.error(`❌ Error in processEventOnce:`, error);
        throw error;
    }
}

/**
 * Cleanup old processed events (run periodically via cron)
 * @param {Number} daysOld - Delete events older than this many days (default: 7)
 * @returns {Number} - Number of events deleted
 */
async function cleanupOldEvents(daysOld = 7) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await ProcessedEvent.deleteMany({
            processedAt: { $lt: cutoffDate }
        });

        logger.info(`🧹 Cleaned up old processed events`, {
            deletedCount: result.deletedCount,
            olderThan: cutoffDate
        });

        return result.deletedCount;
    } catch (error) {
        logger.error(`❌ Error cleaning up old events:`, error);
        throw error;
    }
}

module.exports = {
    isEventProcessed,
    markEventAsProcessed,
    processEventOnce,
    cleanupOldEvents
};
