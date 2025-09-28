const mongoose = require('mongoose');
const { Schema } = mongoose;

const favoriteSchema = new Schema({
  companyId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  addedDate: { type: Date, default: Date.now, index: true }
});

// Indexes for performance
favoriteSchema.index({ companyId: 1, userId: 1, productId: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, addedDate: -1 });

favoriteSchema.pre('save', async function (next) {
  const existing = await this.constructor.findOne({
    companyId: this.companyId,
    userId: this.userId,
    productId: this.productId
  });
  if (existing) {
    return next(new Error('Product is already favorited'));
  }
  next();
});

// Static method to get user favorites with pagination
favoriteSchema.statics.getUserFavorites = async function (userId, companyId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const favorites = await this.find({ userId, companyId })
    .populate('productId', 'asin title price stockQty')
    .sort({ addedDate: -1 })
    .skip(skip)
    .limit(limit);
  const total = await this.countDocuments({ userId, companyId });
  return { favorites, total, page, limit };
};

module.exports = mongoose.model('Favorite', favoriteSchema);