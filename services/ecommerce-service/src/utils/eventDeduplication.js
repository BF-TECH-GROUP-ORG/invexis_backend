/**
 * Event Deduplication Utility
 * Prevents duplicate event processing using FailedEvent model
 * Implements TTL-based cleanup for processed events
 */

const FailedEvent = require('../models/FailedEvent.models');
const logger = require('../utils/logger');

// In-memory cache for recent event IDs (last 1000 events)
const recentEvents = new Map();
const MAX_CACHE_SIZE = 1000;

/**
 * Check if an event has already been processed
 * Uses in-memory cache first, then database
 * @param {String} eventId - Unique event identifier (from event payload or message ID)
 * @param {String} eventType - Type of event (e.g., 'inventory.product.created')
 * @returns {Boolean} - True if event was already processed
 */
async function isEventProcessed(eventId, eventType) {
    try {
        const cacheKey = `${eventType}:${eventId}`;

        // Check in-memory cache first (fast path)
        if (recentEvents.has(cacheKey)) {
            logger.warn(`🔄 Duplicate event detected (cache) and skipped`, {
                eventId,
                eventType
            });
            return true;
        }

        // Check database (slower path)
        const processed = await FailedEvent.findOne({
            eventId,
            eventType,
            status: 'processed'
        });

        if (processed) {
            // Add to cache for future checks
            addToCache(cacheKey);

            logger.warn(`🔄 Duplicate event detected (db) and skipped`, {
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
 * Add event to in-memory cache
 * @param {String} cacheKey - Cache key
 */
function addToCache(cacheKey) {
    // If cache is full, remove oldest entry
    if (recentEvents.size >= MAX_CACHE_SIZE) {
        const firstKey = recentEvents.keys().next().value;
        recentEvents.delete(firstKey);
    }

    recentEvents.set(cacheKey, Date.now());
}

/**
 * Mark an event as processed
 * @param {String} eventId - Unique event identifier
 * @param {String} eventType - Type of event
 * @param {Object} metadata - Optional metadata about the processing
 * @returns {Object} - FailedEvent document
 */
async function markEventAsProcessed(eventId, eventType, metadata = {}) {
    try {
        const cacheKey = `${eventType}:${eventId}`;

        const processedEvent = await FailedEvent.create({
            eventId,
            eventType,
            status: 'processed',
            processedAt: new Date(),
            payload: metadata
        });

        // Add to cache
        addToCache(cacheKey);

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
 * @param {Number} daysOld - Delete events older than this many days (default: 7)
 * @returns {Number} - Number of events deleted
 */
async function cleanupOldEvents(daysOld = 7) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await FailedEvent.deleteMany({
            status: 'processed',
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
