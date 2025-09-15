// models/Promotion.js
const PromotionSchema = new mongoose.Schema({
    promotionId: { type: String, required: true, unique: true },
    companyId: { type: String, required: true, index: true },
    shopId: { type: String },

    name: { type: String, required: true },
    code: { type: String, index: true, sparse: true }, // coupon code (optional)
    description: { type: String },

    discountType: { type: String, enum: ['percentage', 'fixed', 'free_shipping'], required: true },
    discountValue: { type: Number, required: true },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    usageLimit: { type: Number, default: 0 },    // total uses allowed
    usedCount: { type: Number, default: 0 },     // increment atomically via DB operation
    perCustomerLimit: { type: Number, default: 1 },

    constraints: { type: mongoose.Schema.Types.Mixed }, // e.g., minOrderValue, includedProducts, excludedProducts (ids as strings)

    status: { type: String, enum: ['active', 'expired', 'disabled'], default: 'active' },

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

PromotionSchema.index({ companyId: 1, code: 1 });
PromotionSchema.index({ startAt: 1, endAt: 1 });

module.exports = mongoose.model('Promotion', PromotionSchema);
