const mongoose = require('mongoose');
const Media = require('./schemas/Media');
const LocalizedString = require('./schemas/LocalizedString');

const FeaturedBannerSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  shopId: { type: String },

  title: { type: LocalizedString, required: true },
  subtitle: { type: LocalizedString },
  image: { type: Media, required: true },

  type: { type: String, enum: ['homepage', 'seasonal', 'product_highlight'], default: 'homepage' },
  priority: { type: Number, default: 0 },
  startAt: Date,
  endAt: Date,

  ctaAction: { type: String, enum: ['product', 'category', 'url', 'none'], default: 'none' },
  ctaPayload: mongoose.Schema.Types.Mixed,

  clicks: { type: Number, default: 0 },
  views: { type: Number, default: 0 },

  relatedPromotions: [{ type: String }],
  relatedProducts: [{ type: String }],

  status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
  visibility: { type: String, enum: ['public', 'private', 'unlisted'], default: 'public' }
}, { timestamps: true });

module.exports = mongoose.model('FeaturedBanner', FeaturedBannerSchema);
