// models/Wishlist.js
const WishlistSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    companyId: { type: String, required: true },
    shopId: { type: String },

    items: [{ productId: String, addedAt: { type: Date, default: Date.now } }],

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

WishlistSchema.index({ userId: 1, companyId: 1 });

module.exports = mongoose.model('Wishlist', WishlistSchema);
