// models/Cart.js
const CartItemSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    priceAtAdd: { type: Number, required: true },    // snapshot
    currency: { type: String, required: true },      // ISO 4217 snapshot
    metadata: { type: mongoose.Schema.Types.Mixed }  // e.g., options, variant
}, { _id: false });

const CartSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },

    items: { type: [CartItemSchema], default: [] },

    status: { type: String, enum: ['active', 'checked_out', 'abandoned'], default: 'active', index: true },

    // timestamps: updatedAt used to detect abandoned carts
    lastActivity: { type: Date, default: Date.now, index: true },

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// Optional TTL index for auto-clean of abandoned carts (careful in prod)
// CartSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 days

module.exports = mongoose.model('Cart', CartSchema);
