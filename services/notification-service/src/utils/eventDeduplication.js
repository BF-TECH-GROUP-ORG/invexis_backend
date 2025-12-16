/**
 * Event Deduplication Utility - Notification Service
 * Prevents duplicate event processing using MongoDB
 * Implements TTL-based cleanup for processed events
 */

const mongoose = require('mongoose');

// ProcessedEvent Schema for notification service
const ProcessedEventSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        index: true
    },
    eventType: {
        type: String,
        required: true,
        index: true
    },
    processedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    collection: 'processed_events'
});

// Compound unique index to prevent duplicate processing
ProcessedEventSchema.index({ eventId: 1, eventType: 1 }, { unique: true });

// TTL index - automatically delete documents after 7 days
ProcessedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const ProcessedEvent = mongoose.model('ProcessedEvent', ProcessedEventSchema);

const logger = console;

/**
 * Check if an event has already been processed
 * @param {String} eventId - Unique event identifier (from event payload or message ID)
 * @param {String} eventType - Type of event (e.g., 'inventory.product.created')
 * @returns {Boolean} - True if event was already processed
 */
async function isEventProcessed(eventId, eventType) {
    try {
        const processed = await ProcessedEvent.findOne({
            eventId,
            eventType
        });

        if (processed) {
            logger.warn(`🔄 Duplicate event detected and skipped`, {
                eventId,
                eventType,
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
            eventId,
            eventType,
            processedAt: new Date(),
            metadata
        });

        logger.debug(`✅ Event marked as processed`, {
            eventId,
            eventType
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
 * Note: With TTL index, this is automatic, but this function can be used for manual cleanup
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
    ProcessedEvent,
    isEventProcessed,
    markEventAsProcessed,
    processEventOnce,
    cleanupOldEvents
};
