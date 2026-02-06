const mongoose = require('mongoose');

const InventoryReportSchema = new mongoose.Schema({
    documentId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    category: { type: String, enum: ['STOCK_LEVEL', 'VALUATION', 'MOVEMENT'], required: true },
    owner: {
        level: { type: String, enum: ['system', 'company', 'shop', 'user'], default: 'shop' },
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

InventoryReportSchema.index({ "owner.companyId": 1, category: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryReport', InventoryReportSchema);
