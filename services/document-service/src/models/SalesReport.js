const mongoose = require('mongoose');

const SalesReportSchema = new mongoose.Schema({
    documentId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true }, // e.g. "Sales Report - Feb 2026"
    owner: {
        level: { type: String, enum: ['system', 'company', 'shop', 'user'], default: 'shop' },
        companyId: String,
        shopId: String,
        userId: String
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
    filters: {
        staffId: String,
        branchId: String,
        category: String
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, { timestamps: true });

SalesReportSchema.index({ "owner.companyId": 1, "owner.shopId": 1, createdAt: -1 });

module.exports = mongoose.model('SalesReport', SalesReportSchema);
