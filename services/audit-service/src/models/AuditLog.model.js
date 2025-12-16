"use strict";

const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    event_type: { type: String, required: true, index: true },
    source_service: { type: String, index: true },
    companyId: { type: String, index: true }, // Extracted from payload
    userId: { type: String, index: true },    // Extracted from payload
    entityId: { type: String, index: true },  // Primary entity ID (e.g. orderId, productId)
    entityType: { type: String, index: true }, // Type of entity (e.g. 'order', 'product')
    payload: { type: Object },
    metadata: { type: Object },
    occurred_at: { type: Date, default: Date.now, index: true }, // Added index for date range queries
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
