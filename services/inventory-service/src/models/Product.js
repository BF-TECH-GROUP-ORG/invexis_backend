// models/Product.js (Updated for warehouse support: added inventory.perWarehouse array)
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Product variant schema
const VariantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  options: [{ type: String, trim: true }],
});

// Product variation schema
const VariationSchema = new mongoose.Schema({
  attributes: [{
    name: String,
    value: mongoose.Schema.Types.Mixed,
  }],
  sku: { type: String, unique: true, required: true, trim: true, uppercase: true },
  stockQty: { type: Number, min: 0, default: 0 },
  price: { type: Number, min: 0, required: true },
  images: [{
    url: { type: String, trim: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  }],
  weight: {
    value: Number,
    unit: { type: String, enum: ['kg', 'g', 'lb', 'oz'], default: 'kg' },
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: { type: String, enum: ['cm', 'in', 'm'], default: 'cm' },
  },
});

// Product review summary schema
const ReviewSummarySchema = new mongoose.Schema({
  averageRating: { type: Number, min: 0, max: 5, default: 0 },
  reviewCount: { type: Number, default: 0 },
  ratingsDistribution: {
    1: { type: Number, default: 0 },
    2: { type: Number, default: 0 },
    3: { type: Number, default: 0 },
    4: { type: Number, default: 0 },
    5: { type: Number, default: 0 }
  }
});

// Product audit schema
const ProductAuditSchema = new mongoose.Schema({
  action: { type: String, enum: ['create', 'update', 'delete', 'stock_change'], required: true },
  changedBy: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  oldValue: Schema.Types.Mixed,
  newValue: Schema.Types.Mixed
});

// New: Per-warehouse inventory sub-schema
const WarehouseInventorySchema = new mongoose.Schema({
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  quantity: { type: Number, default: 0, min: [0, 'Quantity cannot be negative'] },
  lowStockThreshold: { type: Number, default: 10, min: [0, 'Low stock threshold cannot be negative'] },
});

// Product schema
const productSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  asin: { type: String, required: true, unique: true, index: true },
  sku: { type: String, required: true, unique: true, uppercase: true, index: true },
  upc: { type: String, trim: true },
  name: { type: String, required: [true, 'Product name is required'], maxlength: 200, minlength: 2, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, index: true },
  description: {
    short: { type: String, required: [true, 'Short description is required'], maxLength: [250, 'Short description cannot exceed 250 characters'] },
    long: { type: String, maxLength: [5000, 'Long description cannot exceed 5000 characters'] },
  },
  bulletPoints: [{ type: String, trim: true }],
  brand: { type: String, required: true, trim: true, index: true },
  manufacturer: { type: String, trim: true },
  tags: [String],
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: [true, 'Category is required'], index: true },
  subcategory: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  subSubcategory: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  pricing: {
    basePrice: { type: Number, required: [true, 'Base price is required'], min: [0, 'Price cannot be negative'] },
    salePrice: { type: Number, min: [0, 'Sale price cannot be negative'] },
    listPrice: { type: Number, min: 0 },
    cost: { type: Number, min: [0, 'Cost cannot be negative'] },
    currency: { type: String, default: 'USD', enum: ['USD', 'EUR', 'GBP', 'INR'] },
    taxRate: { type: Number, default: 0, min: [0, 'Tax rate cannot be negative'], max: [100, 'Tax rate cannot exceed 100%'] },
  },
  inventory: {
    trackQuantity: { type: Boolean, default: true },
    quantity: { type: Number, default: 0, min: [0, 'Quantity cannot be negative'] }, // Total across warehouses
    lowStockThreshold: { type: Number, default: 10, min: [0, 'Low stock threshold cannot be negative'] },
    allowBackorder: { type: Boolean, default: false },
    perWarehouse: [WarehouseInventorySchema] // New: Breakdown by warehouse
  },
  condition: { type: String, enum: ['new', 'used', 'refurbished'], default: 'new' },
  availability: { type: String, enum: ['in_stock', 'out_of_stock', 'limited', 'scheduled'], default: 'in_stock' },
  scheduledAvailabilityDate: { type: Date, default: null },
  variants: [VariantSchema],
  variations: [VariationSchema],
  attributes: [{
    name: String,
    value: mongoose.Schema.Types.Mixed,
  }],
  images: [{
    url: { type: String, required: true, trim: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  }],
  videoUrls: [{ type: String, trim: true }],
  status: { type: String, enum: ['draft', 'active', 'inactive', 'discontinued'], default: 'draft', index: true },
  visibility: { type: String, enum: ['public', 'private', 'hidden'], default: 'public', index: true },
  seo: {
    metaTitle: { type: String, maxLength: [60, 'Meta title cannot exceed 60 characters'] },
    metaDescription: { type: String, maxLength: [160, 'Meta description cannot exceed 160 characters'] },
    keywords: [String],
  },
  reviewSummary: ReviewSummarySchema,
  sales: {
    totalSold: { type: Number, default: 0, min: [0, 'Total sold cannot be negative'] },
    revenue: { type: Number, default: 0, min: [0, 'Revenue cannot be negative'] },
    salesRank: { type: Number, default: 0, min: 0 },
  },
  browseNodeId: { type: String, trim: true },
  featured: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
  auditTrail: [ProductAuditSchema],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Updated indexes
productSchema.index({ companyId: 1, category: 1, subcategory: 1, subSubcategory: 1 });
productSchema.index({ name: 'text', 'description.short': 'text', 'description.long': 'text' });
productSchema.index({ 'pricing.basePrice': 1 });
productSchema.index({ 'inventory.quantity': 1 });
productSchema.index({ status: 1, visibility: 1 });
productSchema.index({ brand: 1, status: 1 });
productSchema.index({ featured: 1, sortOrder: 1 });
productSchema.index({ 'reviewSummary.averageRating': -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ scheduledAvailabilityDate: 1 });

// Virtual for effective price
productSchema.virtual('effectivePrice').get(function() {
  return this.pricing.salePrice || this.pricing.basePrice;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (!this.inventory.trackQuantity) return 'in-stock';
  if (this.inventory.quantity <= 0) {
    return this.inventory.allowBackorder ? 'backorder' : 'out-of-stock';
  }
  if (this.inventory.quantity <= this.inventory.lowStockThreshold) {
    return 'low-stock';
  }
  return 'in-stock';
});

// Middleware to generate slug
productSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Middleware to handle scheduled availability
productSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  if (this.scheduledAvailabilityDate && new Date() < this.scheduledAvailabilityDate) {
    this.availability = 'scheduled';
  } else if (this.scheduledAvailabilityDate && new Date() >= this.scheduledAvailabilityDate) {
    this.availability = 'in_stock';
  }

  // Aggregate total quantity from perWarehouse ONLY if perWarehouse has entries
  if (this.inventory.perWarehouse && this.inventory.perWarehouse.length > 0) {
    this.inventory.quantity = this.inventory.perWarehouse.reduce((total, wh) => total + wh.quantity, 0);
  }
  // Else, keep the manually set quantity (for single-warehouse or non-warehouse updates)

  next();
});
// Middleware to validate category hierarchy
productSchema.pre('save', async function(next) {
  if (this.isModified('category') || this.isModified('subcategory') || this.isModified('subSubcategory')) {
    const Category = mongoose.model('Category');
   
    const category = await Category.findById(this.category);
    if (!category || category.level !== 1) {
      return next(new Error('Invalid category selection'));
    }
   
    if (this.subcategory) {
      const subcategory = await Category.findById(this.subcategory);
      if (!subcategory || subcategory.level !== 2 || !subcategory.parentCategory.equals(this.category)) {
        return next(new Error('Invalid subcategory selection'));
      }
     
      if (this.subSubcategory) {
        const subSubcategory = await Category.findById(this.subSubcategory);
        if (!subSubcategory || subSubcategory.level !== 3 || !subSubcategory.parentCategory.equals(this.subcategory)) {
          return next(new Error('Invalid sub-subcategory selection'));
        }
      }
    }
  }
  next();
});

// Method to check if product is available now
productSchema.methods.isAvailableNow = function () {
  return this.availability === 'in_stock' || this.availability === 'limited' || (this.scheduledAvailabilityDate && new Date() >= this.scheduledAvailabilityDate);
};

productSchema.statics.getProductsByCategory = async function (categoryId, includeSubcategories = false) {
  const Category = mongoose.model('Category');

  let filter = { category: categoryId };

  if (includeSubcategories) {
    // Recursive function to fetch all descendant category IDs
    const getAllSubcategoryIds = async (parentIds) => {
      const subs = await Category.find({ parentCategory: { $in: parentIds } }).select('_id');
      if (!subs.length) return [];
      const subIds = subs.map(s => s._id);
      const nestedSubIds = await getAllSubcategoryIds(subIds);
      return subIds.concat(nestedSubIds);
    };

    const allSubIds = await getAllSubcategoryIds([categoryId]);

    if (allSubIds.length > 0) {
      filter = {
        $or: [
          { category: categoryId },
          { subcategory: { $in: allSubIds } },
          { subSubcategory: { $in: allSubIds } } // optional if your schema has this
        ]
      };
    }
  }

  // Return a Query object
  return this.find(filter).populate('category subcategory subSubcategory');
};

// Static method to get low stock products
productSchema.statics.getLowStockProducts = async function (companyId, threshold = 10) {
  return await this.find({ companyId, 'inventory.quantity': { $lte: threshold } }).sort({ 'inventory.quantity': 1 });
};

// Static method to get scheduled products
productSchema.statics.getScheduledProducts = async function (companyId) {
  return await this.find({
    companyId,
    scheduledAvailabilityDate: { $ne: null },
    availability: 'scheduled'
  }).sort({ scheduledAvailabilityDate: 1 });
};

// New static method for old unbought products (as per earlier discussion)
productSchema.statics.getOldUnboughtProducts = async function (companyId, daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  return await this.find({
    companyId,
    'sales.totalSold': 0,
    createdAt: { $lt: cutoffDate }
  }).sort({ createdAt: 1 });
};

module.exports = mongoose.model('Product', productSchema);