"use strict";

const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    event_type: { type: String, required: true, index: true },
    source_service: { type: String, index: true },
    payload: { type: Object },
    metadata: { type: Object },
    occurred_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
