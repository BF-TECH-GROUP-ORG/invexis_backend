"use strict";

const mongoose = require("mongoose");

const outboxSchema = new mongoose.Schema({
    routing_key: { type: String, required: true },
    payload: { type: Object, required: true },
    status: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING" },
    error: { type: String },
    retries: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});

// Static method to find pending events
outboxSchema.statics.findPending = function (limit = 50) {
    return this.find({ status: "PENDING" }).limit(limit).sort({ created_at: 1 });
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

module.exports = mongoose.model("Outbox", outboxSchema);
