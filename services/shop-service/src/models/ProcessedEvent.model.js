"use strict";

const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");

/**
 * ProcessedEvent Model
 * Tracks processed events to prevent duplicate processing
 */
class ProcessedEvent {
    static table = "processed_events";

    constructor(data) {
        this.id = data.id || uuidv4();
        this.eventId = data.eventId;
        this.eventType = data.eventType;
        this.processedAt = data.processedAt || new Date();
        this.metadata = data.metadata || null;
        this.created_at = data.created_at || new Date();
    }

    /**
     * Create a new processed event record
     */
    static async create(data, trx = null) {
        const processedEvent = new ProcessedEvent(data);
        const query = db(this.table).insert({
            id: processedEvent.id,
            event_id: processedEvent.eventId,
            event_type: processedEvent.eventType,
            processed_at: processedEvent.processedAt,
            metadata: processedEvent.metadata,
            created_at: processedEvent.created_at
        });

        if (trx) query.transacting(trx);
        await query;
        return processedEvent;
    }

    /**
     * Find a processed event by eventId and eventType
     */
    static async findOne({ where }, trx = null) {
        let query = db(this.table)
            .where({
                event_id: where.eventId,
                event_type: where.eventType
            })
            .first();

        if (trx) query = query.transacting(trx);
        const result = await query;

        if (!result) return null;

        // Map database columns to model properties
        return {
            id: result.id,
            eventId: result.event_id,
            eventType: result.event_type,
            processedAt: result.processed_at,
            metadata: result.metadata,
            created_at: result.created_at
        };
    }

    /**
     * Delete old processed events
     */
    static async destroy({ where }, trx = null) {
        let query = db(this.table);

        if (where.processedAt) {
            // Handle Sequelize-style operators
            const processedAtCondition = where.processedAt;
            if (processedAtCondition.$lt || processedAtCondition.lt) {
                const cutoffDate = processedAtCondition.$lt || processedAtCondition.lt;
                query = query.where('processed_at', '<', cutoffDate);
            }
        }

        if (trx) query = query.transacting(trx);
        const deletedCount = await query.del();
        return deletedCount;
    }
}

module.exports = ProcessedEvent;
