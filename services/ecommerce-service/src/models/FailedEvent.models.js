const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * FailedEvent Model - Dead Letter Queue for Consumers
 * Stores events that failed to be processed by consumers after retries.
 * Acts as a safety net to prevent data loss.
 */
const failedEventSchema = new Schema(
    {
        topic: {
            type: String,
            required: true,
            index: true
        },
        routingKey: {
            type: String,
            required: true,
            index: true
        },
        payload: {
            type: Schema.Types.Mixed,
            required: true
        },
        error: {
            type: String,
            required: true
        },
        consumerName: {
            type: String,
            required: true,
            index: true
        },
        stackTrace: {
            type: String
        },
        createdAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        resolved: {
            type: Boolean,
            default: false
        },
        resolvedAt: {
            type: Date
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('FailedEvent', failedEventSchema);
