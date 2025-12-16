/**
 * Event Deduplication Utility - Company Service (Knex Version)
 * Prevents duplicate event processing using database tracking
 * Implements TTL-based cleanup for processed events
 */

const db = require('../config');
const logger = console;

const TABLE_NAME = 'processed_events';

/**
 * Ensure the processed_events table exists
 */
async function ensureTableExists() {
    try {
        const exists = await db.schema.hasTable(TABLE_NAME);
        if (!exists) {
            await db.schema.createTable(TABLE_NAME, (table) => {
                table.string('event_id').notNullable();
                table.string('event_type').notNullable();
                table.timestamp('processed_at').defaultTo(db.fn.now());
                table.jsonb('metadata').defaultTo('{}');
                table.primary(['event_id', 'event_type']);
                table.index('processed_at');
            });
            logger.info(`✅ Created ${TABLE_NAME} table`);
        }
    } catch (error) {
        // Ignore error if table already exists (race condition)
        if (error.code !== '42P07') { // Postgres duplicate table error code
            logger.error(`❌ Error ensuring table exists:`, error);
        }
    }
}

// Run table check once on startup (non-blocking)
ensureTableExists();

/**
 * Check if an event has already been processed
 * @param {String} eventId - Unique event identifier
 * @param {String} eventType - Type of event
 * @returns {Boolean} - True if event was already processed
 */
async function isEventProcessed(eventId, eventType) {
    try {
        const processed = await db(TABLE_NAME)
            .where({
                event_id: eventId,
                event_type: eventType
            })
            .first();

        if (processed) {
            logger.warn(`🔄 Duplicate event detected and skipped`, {
                eventId,
                eventType,
                processedAt: processed.processed_at
            });
            return true;
        }

        return false;
    } catch (error) {
        // If table doesn't exist yet, it might be the first run
        if (error.code === '42P01') { // Undefined table
            await ensureTableExists();
            return false;
        }
        logger.error(`❌ Error checking event deduplication:`, error);
        return false;
    }
}

/**
 * Mark an event as processed
 * @param {String} eventId - Unique event identifier
 * @param {String} eventType - Type of event
 * @param {Object} metadata - Optional metadata
 */
async function markEventAsProcessed(eventId, eventType, metadata = {}) {
    try {
        await db(TABLE_NAME).insert({
            event_id: eventId,
            event_type: eventType,
            processed_at: new Date(),
            metadata: JSON.stringify(metadata)
        });

        logger.info(`✅ Event marked as processed`, {
            eventId,
            eventType
        });
    } catch (error) {
        // Unique constraint violation (23505 is Postgres code)
        if (error.code === '23505') {
            logger.warn(`🔄 Event already marked as processed (race condition)`, {
                eventId,
                eventType
            });
            return;
        }
        logger.error(`❌ Error marking event as processed:`, error);
        throw error;
    }
}

/**
 * Process event with automatic deduplication
 * @param {String} eventId - Unique event identifier
 * @param {String} eventType - Type of event
 * @param {Function} handler - Async function to execute
 * @param {Object} metadata - Optional metadata
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
 * Cleanup old processed events
 * @param {Number} daysOld - Delete events older than this many days
 */
async function cleanupOldEvents(daysOld = 7) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await db(TABLE_NAME)
            .where('processed_at', '<', cutoffDate)
            .del();

        logger.info(`🧹 Cleaned up old processed events`, {
            deletedCount: result,
            olderThan: cutoffDate
        });

        return result;
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
