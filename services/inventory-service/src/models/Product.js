const mongoose = require('mongoose');
const { Schema } = mongoose;

// Product variation schema
const VariationSchema = new mongoose.Schema({
  color: { type: String, trim: true },
  size: { type: String, trim: true },
  sku: { type: String, unique: true, required: true, trim: true },
  stockQty: { type: Number, min: 0, default: 0 },
  price: { type: Number, min: 0, required: true },
  images: [{ type: String, trim: true }]
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

// Product schema
const productSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  asin: { type: String, required: true, unique: true, index: true },
  sku: { type: String, required: true, unique: true },
  upc: { type: String, trim: true },
  title: { type: String, required: true, maxlength: 200, trim: true },
  description: { type: String, required: true, trim: true },
  bulletPoints: [{ type: String, trim: true }],
  brand: { type: String, required: true, trim: true },
  manufacturer: { type: String, trim: true },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  subCategory: { type: String, trim: true },
  price: { type: Number, required: true, min: 0 },
  listPrice: { type: Number, min: 0 },
  stockQty: { type: Number, required: true, default: 0, min: 0 },
  condition: { type: String, enum: ['new', 'used', 'refurbished'], default: 'new' },
  availability: { type: String, enum: ['in_stock', 'out_of_stock', 'limited'], default: 'in_stock' },
  scheduledAvailabilityDate: { type: Date, default: null }, // Date when product becomes available
  variations: [VariationSchema],
  images: [{
    url: { type: String, trim: true },
    alt: { type: String, trim: true },
    isMain: { type: Boolean, default: false }
  }],
  videoUrls: [{ type: String, trim: true }],
  reviewSummary: ReviewSummarySchema,
  salesRank: { type: Number, default: 0, min: 0 },
  browseNodeId: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  auditTrail: [ProductAuditSchema],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for high-query performance
productSchema.index({ companyId: 1, categoryId: 1 });
productSchema.index({ asin: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ title: 'text', description: 'text' }); // Text search for product search
productSchema.index({ price: 1 });
productSchema.index({ stockQty: 1 });
productSchema.index({ scheduledAvailabilityDate: 1 });

// Pre-save middleware to handle scheduled availability
productSchema.pre('save', function(next) {
  this.updatedAt = new Date();

  if (this.scheduledAvailabilityDate && new Date() < this.scheduledAvailabilityDate) {
    this.availability = 'scheduled'; // Custom enum value for scheduled products
  } else if (this.scheduledAvailabilityDate && new Date() >= this.scheduledAvailabilityDate) {
    this.availability = 'in_stock'; // Automatically set to in_stock when date arrives
  }

  next();
});

// Method to calculate discounted price
productSchema.methods.getDiscountedPrice = async function () {
  const discounts = await mongoose.model('Discount').find({ productId: this._id, isActive: true });
  let discountedPrice = this.price;
  discounts.forEach(discount => {
    discountedPrice = discount.calculateDiscountedPrice(discountedPrice);
  });
  return discountedPrice;
};

// Method to check if product is available now
productSchema.methods.isAvailableNow = function () {
  return this.availability === 'in_stock' || this.availability === 'limited' || (this.scheduledAvailabilityDate && new Date() >= this.scheduledAvailabilityDate);
};

// Static method to get low stock products
productSchema.statics.getLowStockProducts = async function (companyId, threshold = 10) {
  return await this.find({ companyId, stockQty: { $lte: threshold } }).sort({ stockQty: 1 });
};

// Static method to get scheduled products
productSchema.statics.getScheduledProducts = async function (companyId) {
  return await this.find({
    companyId,
    scheduledAvailabilityDate: { $ne: null },
    availability: 'scheduled'
  }).sort({ scheduledAvailabilityDate: 1 });
};

// Function to check old product without bought
productSchema.statics.getOldUnboughtProducts = async function (companyId, daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return await this.find({
    companyId,
    createdAt: { $lte: cutoffDate },
    salesRank: 0  // Assuming salesRank = 0 means no sales
  }).sort({ createdAt: 1 });
};

module.exports = mongoose.model('Product', productSchema);