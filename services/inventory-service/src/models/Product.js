// models/Product.js — FINAL LOCKED VERSION (POS + E-COMMERCE + SPECS + QR + VISIBILITY)
const mongoose = require('mongoose');
const Money = require('/app/shared/utils/MoneyUtil');
const { Schema } = mongoose;

/* -------------------------------------------------------------------------- */
/*                               MAIN PRODUCT SCHEMA                          */
/* -------------------------------------------------------------------------- */

const ProductSchema = new Schema({
  /* ------------------------------ Ownership ------------------------------ */
  companyId: { type: String, required: true, index: true },
  shopId: { type: String, required: true, index: true },

  /* ------------------------------ Core Info ------------------------------ */
  name: { type: String, required: true, trim: true, maxlength: 200, minlength: 2 },
  slug: { type: String, unique: true, lowercase: true, index: true, sparse: true },
  description: { type: String, required: true },
  brand: { type: String, required: true, trim: true, index: true },
  manufacturer: { type: String, trim: true },
  tags: [{ type: String, trim: true, lowercase: true }],

  supplierName: { type: String, trim: true },

  /* ------------------------------ Category ------------------------------- */
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },

  /* ------------------------------ Condition & Availability -------------- */
  condition: {
    type: String,
    enum: ['new', 'used', 'refurbished'],
    default: 'new'
  },
  availability: {
    type: String,
    enum: ['in_stock', 'out_of_stock', 'limited', 'scheduled', 'pre_order', 'back_order', 'discontinued'],
    default: 'in_stock'
  },
  scheduledAvailabilityDate: { type: Date },

  /* ------------------------------ Status & Visibility -------------------- */
  status: {
    type: String,
    default: 'active',
    index: true
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'hidden'],
    default: 'hidden',
    index: true
  },
  featured: { type: Boolean, default: false, index: true }, // Changed from isFeatured to featured
  isFeatured: { type: Boolean, default: false, index: true }, // Keep for compatibility
  sortOrder: { type: Number, default: 0 },

  /* ------------------------------ Media ---------------------------------- */
  images: [{
    url: { type: String, required: true, trim: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 }
  }],
  videoUrls: [{ type: String, trim: true }],

  /* ------------------------------ SEO ------------------------------------ */
  seo: {
    metaTitle: { type: String, maxlength: 70 },
    metaDescription: { type: String, maxlength: 160 },
    keywords: [String]
  },

  /* ------------------------------ Sales Metrics -------------------------- */
  sales: {
    totalSold: { type: Number, default: 0, min: 0 },
    revenue: {
      type: Number,
      default: 0,
      min: 0,
      get: v => Money.toMajor(v),
      set: v => Money.toMinor(v)
    }
  },

  /* ------------------------------ Links ---------------------------------- */
  pricingId: { type: Schema.Types.ObjectId, ref: 'ProductPricing', default: null, index: true },
  specsId: { type: Schema.Types.ObjectId, ref: 'ProductSpecs', default: null },

  /* ------------------------------ PHYSICAL IDENTIFIERS ------------------- */
  sku: { type: String, unique: true, uppercase: true, sparse: true },
  asin: { type: String, unique: true, sparse: true, uppercase: true },
  upc: { type: String, unique: true, sparse: true },
  ean: { type: String, sparse: true },

  barcode: { type: String, unique: true },
  barcodePayload: { type: String },
  barcodeUrl: { type: String },
  barcodeCloudinaryId: { type: String }, // For deletion tracking

  qrCode: { type: String },
  qrPayload: { type: String },
  qrCodeUrl: { type: String },
  qrCloudinaryId: { type: String }, // For deletion tracking

  scanId: { type: String, unique: true },

  browseNodeId: { type: String },

  /* ------------------------------ Expirations ---------------------------- */
  expiryDate: { type: Date, index: true },
  manufacturingDate: { type: Date },

  /* ------------------------------ Supply Chain --------------------------- */
  costPrice: {
    type: Number,
    min: 0,
    get: v => Money.toMajor(v),
    set: v => Money.toMinor(v)
  },

  /* ------------------------------ Soft Delete ----------------------------- */
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

/* -------------------------------------------------------------------------- */
/*                                   VIRTUALS                                 */
/* -------------------------------------------------------------------------- */

ProductSchema.virtual('variations', {
  ref: 'ProductVariation',
  localField: '_id',
  foreignField: 'productId'
});

ProductSchema.virtual('specs', {
  ref: 'ProductSpecs',
  localField: '_id',
  foreignField: 'productId'
});

ProductSchema.virtual('mainImage').get(function () {
  if (!this.images || this.images.length === 0) return null;
  return this.images.find(i => i.isPrimary) || this.images[0];
});

/* -------------------------------------------------------------------------- */
/*                               PRE-SAVE HOOKS                               */
/* -------------------------------------------------------------------------- */

// 1. Auto slug
ProductSchema.pre('save', async function () {
  if (this.isModified('name') || !this.slug) {
    const base = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 90); // leave room for suffix

    // Ensure slug uniqueness across products
    const Product = this.constructor;
    let candidate = base;
    let attempt = 0;
    // If updating existing doc, exclude self
    const excludeSelf = this._id ? { _id: { $ne: this._id } } : {};
    while (attempt < 10) {
      const exists = await Product.countDocuments({ slug: candidate, ...excludeSelf }).lean();
      if (!exists) break;
      attempt++;
      candidate = `${base}-${Date.now().toString(36).slice(-5)}${attempt > 1 ? `-${attempt}` : ''}`;
      // keep candidate within 100 chars
      if (candidate.length > 100) candidate = candidate.slice(0, 100);
    }
    this.slug = candidate;
  }
});

// 2. Full scanning & identifier generation (your original logic, kept 100%)
ProductSchema.pre('save', async function () {
  const Product = this.constructor;

  const ensureUnique = async (field, genFn, attempts = 5) => {
    for (let i = 0; i < attempts; i++) {
      const candidate = genFn();
      const exists = await Product.countDocuments({ [field]: candidate }).lean();
      if (!exists) return candidate;
    }
    return genFn();
  };

  // SKU
  if (!this.sku) {
    this.sku = await ensureUnique('sku', () => {
      const base = (this.name || 'PROD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      const suffix = Math.random().toString(36).substr(2, 5).toUpperCase();
      return `${base}-${suffix}`;
    });
  }

  // Barcode = SKU (human readable)
  if (!this.barcode) {
    this.barcode = this.sku;
  }

  // Full payload for QR/Barcode
  if (!this.barcodePayload || !this.qrPayload) {
    const obj = this.toObject({ virtuals: false, transform: (doc, ret) => { delete ret.__v; return ret; } });
    const payload = Buffer.from(JSON.stringify(obj)).toString('base64');
    this.barcodePayload = payload;
    this.qrPayload = payload;
  }

  // scanId
  if (!this.scanId) {
    this.scanId = await ensureUnique('scanId', () => `SCAN-${Date.now().toString(36).toUpperCase()}`);
  }

  // ASIN fallback
  if (!this.asin) {
    this.asin = await ensureUnique('asin', () => `ASIN${Date.now().toString().slice(-8)}`);
  }

  // UPC fallback
  if (!this.upc) {
    this.upc = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  }
});

// 3. Scheduled availability
ProductSchema.pre('save', async function () {
  if (this.scheduledAvailabilityDate) {
    if (new Date() < this.scheduledAvailabilityDate) {
      this.availability = 'scheduled';
    } else {
      this.availability = 'in_stock';
    }
  }
});

// 4. Validate category is level 3 (DISABLED - handled in controller)
// ProductSchema.pre('save', async function (next) {
//   try {
//     if (this.isModified('categoryId')) {
//       const Category = mongoose.model('Category');
//       const cat = await Category.findById(this.categoryId);
//       if (!cat || cat.level !== 3) {
//         return next(new Error('Category must be level 3'));
//       }
//       if (cat.companyId && cat.companyId !== this.companyId) {
//         return next(new Error('Category belongs to different company'));
//       }
//     }
//     next();
//   } catch (err) {
//     next(err);
//   }
// });

/* -------------------------------------------------------------------------- */
/*                                   INDEXES                                  */
/* -------------------------------------------------------------------------- */

// POS Ultra-fast lookup (critical for sub-50ms response)
ProductSchema.index({ companyId: 1, sku: 1 }, { unique: true, sparse: true });

// Core filtering indexes
ProductSchema.index({ companyId: 1, shopId: 1, status: 1 });
ProductSchema.index({ companyId: 1, shopId: 1, visibility: 1 });

// Category & featured
ProductSchema.index({ categoryId: 1, status: 1 });
ProductSchema.index({ isFeatured: 1, sortOrder: -1 });

// Status & visibility
ProductSchema.index({ status: 1, visibility: 1 });

// Full text search (name, brand, sku, tags)
ProductSchema.index({ name: 'text', brand: 'text', sku: 'text', tags: 'text' });

// Deletion tracking
ProductSchema.index({ isDeleted: 1, deletedAt: 1 });

// Note: barcode, scanId, sku indexes created automatically by unique: true

module.exports = mongoose.model('Product', ProductSchema);