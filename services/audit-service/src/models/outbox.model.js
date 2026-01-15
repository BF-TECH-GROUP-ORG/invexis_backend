"use strict";

const mongoose = require("mongoose");

const outboxSchema = new mongoose.Schema({
    routing_key: { type: String, required: true },
    payload: { type: Object, required: true },
    status: { type: String, enum: ["PENDING", "PROCESSING", "SENT", "FAILED"], default: "PENDING" },
    error: { type: String },
    retries: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});

// Static method to find pending events
outboxSchema.statics.findPending = function (limit = 50) {
    return this.find({ status: "PENDING" }).limit(limit).sort({ created_at: 1 });
};

// Static method to mark as processing
outboxSchema.statics.markAsProcessing = function (id) {
    return this.findByIdAndUpdate(id, { status: "PROCESSING", updated_at: new Date() });
};

// Static method to mark as sent
outboxSchema.statics.markAsSent = function (id) {
    return this.findByIdAndUpdate(id, { status: "SENT", updated_at: new Date() });
};

// Static method to mark as failed
outboxSchema.statics.markAsFailed = function (id, error) {
    return this.findByIdAndUpdate(id, {
        status: "FAILED",
        error: error.message,
        $inc: { retries: 1 },
        updated_at: new Date(),
    });
};

// Static method to reset stale processing events
outboxSchema.statics.resetStaleProcessing = async function (staleMinutes = 5) {
    const staleTime = new Date(Date.now() - staleMinutes * 60 * 1000);
    const result = await this.updateMany(
        {
            status: "PROCESSING",
            updated_at: { $lt: staleTime }
        },
        {
            $set: { status: "PENDING", updated_at: new Date() }
        }
    );
    return result.modifiedCount;
};

// Static method to retry failed events
outboxSchema.statics.retryFailed = async function (maxRetries = 3) {
    return this.updateMany(
        {
            status: "FAILED",
            retries: { $lt: maxRetries }
        },
        {
            $set: { status: "PENDING", updated_at: new Date() }
        }
    );
};

// Static method to cleanup old sent events
outboxSchema.statics.cleanupSent = async function (daysOld = 7) {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    return this.deleteMany({
        status: "SENT",
        updated_at: { $lt: cutoffDate }
    });
};

// Static method to get stats
outboxSchema.statics.getStats = async function () {
    const stats = await this.aggregate([
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 }
            }
        }
    ]);
    return stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
    }, {});
};

module.exports = mongoose.model("Outbox", outboxSchema);
