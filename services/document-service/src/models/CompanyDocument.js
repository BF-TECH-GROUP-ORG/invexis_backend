const mongoose = require('mongoose');

const CompanyDocumentSchema = new mongoose.Schema({
    documentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: {
        type: String,
        enum: ['pdf', 'image', 'verification_document'],
        required: true
    },
    owner: {
        level: { type: String, enum: ['system', 'company', 'shop', 'user'], default: 'company' },
        companyId: String,
        shopId: String,
        userId: String
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

module.exports = mongoose.model('CompanyDocument', CompanyDocumentSchema);
