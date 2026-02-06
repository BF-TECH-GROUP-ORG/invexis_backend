const mongoose = require('mongoose');

const DebtDocumentSchema = new mongoose.Schema({
    documentId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    type: {
        type: String,
        enum: ['payment_receipt', 'debt_statement', 'dunning_letter'],
        required: true
    },
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
    reference: {
        invoiceNo: String,
        saleId: String,
        customerId: String
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
    },
    version: { type: Number, default: 1 }
}, { timestamps: true });

DebtDocumentSchema.index({ "owner.companyId": 1, "reference.customerId": 1 });
DebtDocumentSchema.index({ "reference.saleId": 1 });

module.exports = mongoose.model('DebtDocument', DebtDocumentSchema);
