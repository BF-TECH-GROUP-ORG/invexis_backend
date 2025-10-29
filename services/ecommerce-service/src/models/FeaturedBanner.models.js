// services/ecommerce-service/src/models/FeaturedBanner.models.js
const mongoose = require('mongoose');

const FeaturedBannerSchema = new mongoose.Schema({
  bannerId: { type: String, required: true, unique: true },
  companyId: { type: String, required: true },
  shopId: { type: String },
  title: {
    type: {
      en: { type: String, required: true }
      // Add other languages if needed, e.g., es: { type: String }
    },
    required: true
  },
  subtitle: {
    type: {
      en: { type: String }
    }
  },
  imageUrl: { type: String, required: true },
  target: { type: mongoose.Schema.Types.Mixed }, // e.g., { type: 'product', id: '...' } or external url
  type: { type: String, enum: ['homepage', 'seasonal', 'product_highlight'], default: 'homepage' },
  priority: { type: Number, default: 0 },
  startAt: Date,
  endAt: Date,
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// FeaturedBannerSchema.index({ companyId: 1, type: 1, isActive: 1, priority: -1 });

module.exports = mongoose.model('FeaturedBanner', FeaturedBannerSchema);