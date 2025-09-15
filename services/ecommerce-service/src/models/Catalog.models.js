// models/CatalogProduct.js
const mongoose = require('mongoose');

const LocalizedString = new mongoose.Schema({
    en: String,
    fr: String,
    es: String,
    // add languages as needed
}, { _id: false });

const ImageSchema = new mongoose.Schema({
    url: { type: String, required: true },
    alt: { type: LocalizedString, default: {} },
    width: Number,
    height: Number,
}, { _id: false });

const CatalogProductSchema = new mongoose.Schema({
    // references (IDs from other services)
    productId: { type: String, required: true, index: true }, // inventory-service id
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },

    // localized content
    title: { type: LocalizedString, required: true },
    shortDescription: { type: LocalizedString },
    longDescription: { type: LocalizedString },

    // media & SEO
    images: { type: [ImageSchema], default: [] },
    seo: {
        slug: { type: String, index: true },
        metaTitle: { type: LocalizedString },
        metaDescription: { type: LocalizedString }
    },

    // pricing snapshot (ecommerce-specific); inventoryService is the source of truth for base price
    price: { type: Number, required: true },
    currency: { type: String, required: true, default: 'USD' }, // ISO 4217
    compareAtPrice: Number, // optional sale price original

    tags: [String],
    featured: { type: Boolean, default: false },

    // visibility & lifecycle
    visibility: { type: String, enum: ['public', 'private', 'unlisted'], default: 'public', index: true },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active', index: true },

    // security & audit
    createdBy: { type: String }, // auth-service user id
    updatedBy: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    // region & localization defaults
    defaultLocale: { type: String, default: 'en' },
    defaultCurrency: { type: String, default: 'USD' },

    // extensible metadata (for feature flags, vendor info, compliance)
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// Indexes
CatalogProductSchema.index({ companyId: 1, shopId: 1, status: 1 });
CatalogProductSchema.index({ 'seo.slug': 1 }, { unique: false, sparse: true });
CatalogProductSchema.index({ tags: 1 });

module.exports = mongoose.model('CatalogProduct', CatalogProductSchema);
