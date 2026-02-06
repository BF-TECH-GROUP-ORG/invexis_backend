const mongoose = require('mongoose');

const FinanceReportSchema = new mongoose.Schema({
    documentId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    type: { type: String, enum: ['EXECUTIVE', 'GENERAL', 'BI', 'BREAKDOWN'], required: true },
    owner: {
        level: { type: String, enum: ['system', 'company', 'shop', 'user'], default: 'company' },
        companyId: String,
        shopId: String
    },
    period: {
        start: Date,
        end: Date
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

FinanceReportSchema.index({ "owner.companyId": 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('FinanceReport', FinanceReportSchema);
