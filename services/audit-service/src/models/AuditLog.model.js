"use strict";

const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    // Core event data
    event_type: { type: String, required: true, index: true },
    source_service: { type: String, index: true },

    // Multi-tenancy & hierarchy
    companyId: { type: String, index: true },
    shopId: { type: String, index: true },

    // Actor tracking
    userId: { type: String, index: true },
    workerId: { type: String, index: true }, // Employee/staff who performed action

    // Entity tracking
    entityId: { type: String, index: true },
    entityType: { type: String, index: true },

    // Change tracking
    changes: {
        before: { type: mongoose.Schema.Types.Mixed },
        after: { type: mongoose.Schema.Types.Mixed },
        fields: [String] // List of changed field names
    },

    // Categorization
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
        index: true
    },
    category: { type: String, index: true }, // 'data_access', 'data_modification', 'auth', 'config'
    tags: [String],

    // Context
    description: { type: String },

    // Request metadata
    ipAddress: { type: String },
    userAgent: { type: String },
    requestId: { type: String, index: true },
    sessionId: { type: String },

    // Original data
    payload: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed },

    // Timestamps
    occurred_at: { type: Date, default: Date.now, index: true }
}, {
    timestamps: true // Adds createdAt, updatedAt
});

// Compound indexes for common queries
auditLogSchema.index({ companyId: 1, occurred_at: -1 });
auditLogSchema.index({ shopId: 1, occurred_at: -1 });
auditLogSchema.index({ workerId: 1, occurred_at: -1 });
auditLogSchema.index({ companyId: 1, shopId: 1, occurred_at: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, occurred_at: -1 });
auditLogSchema.index({ category: 1, severity: 1, occurred_at: -1 });

// Static methods
auditLogSchema.statics.getActivityByShop = async function (companyId, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                companyId,
                occurred_at: { $gte: new Date(startDate), $lte: new Date(endDate) }
            }
        },
        {
            $group: {
                _id: '$shopId',
                count: { $sum: 1 },
                events: { $push: '$event_type' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

auditLogSchema.statics.getActivityByWorker = async function (companyId, shopId, startDate, endDate) {
    const match = { companyId, occurred_at: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    if (shopId) match.shopId = shopId;

    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$workerId',
                count: { $sum: 1 },
                eventTypes: { $addToSet: '$event_type' }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 50 }
    ]);
};

auditLogSchema.statics.getEventDistribution = async function (filters) {
    return this.aggregate([
        { $match: filters },
        {
            $group: {
                _id: '$event_type',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
