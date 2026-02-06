const mongoose = require('mongoose');

const PerformanceReportSchema = new mongoose.Schema({
    documentId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    target: { type: String, enum: ['STAFF', 'BRANCH', 'COMPANY'], required: true },
    targetId: String, // ID of the staff or branch
    owner: {
        level: { type: String, enum: ['system', 'company', 'shop', 'user'], default: 'company' },
        companyId: String,
        shopId: String
    },
    period: {
        start: Date,
        end: Date
    },
    metrics: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    },
    storage: {
        provider: { type: String, default: 'cloudinary' },
        url: String,
        public_id: String,
        format: String,
        size: Number
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, { timestamps: true });

PerformanceReportSchema.index({ "owner.companyId": 1, target: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('PerformanceReport', PerformanceReportSchema);
