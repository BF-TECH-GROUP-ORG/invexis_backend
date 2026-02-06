const mongoose = require('mongoose');

const PaymentDocumentSchema = new mongoose.Schema({
    documentId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    type: { type: String, enum: ['REMITTANCE', 'SETTLEMENT', 'MONEY_TRAIL', 'RECONCILIATION'], required: true },
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

PaymentDocumentSchema.index({ "owner.companyId": 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentDocument', PaymentDocumentSchema);
