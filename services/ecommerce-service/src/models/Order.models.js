// models/Order.js
const OrderItemSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    quantity: { type: Number, required: true },
    priceAtOrder: { type: Number, required: true },
    currency: { type: String, required: true },
    metadata: mongoose.Schema.Types.Mixed
}, { _id: false });

const AddressSchema = new mongoose.Schema({
    name: String,
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    phone: String
}, { _id: false });

const PaymentMetadataSchema = new mongoose.Schema({
    paymentRef: String,        // payment-service id/reference
    provider: String,         // 'mtn_money', 'stripe', 'paypal', etc.
    providerMetadata: mongoose.Schema.Types.Mixed // e.g., transaction code, provider fees
}, { _id: false });

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true, index: true }, // ecommerce-generated id
    userId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },
    shopId: { type: String, index: true },

    items: { type: [OrderItemSchema], required: true },

    subtotal: { type: Number, required: true },
    shippingAmount: { type: Number, default: 0 },
    taxes: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, required: true },

    status: { type: String, enum: ['pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'], default: 'pending', index: true },
    paymentStatus: { type: String, enum: ['unpaid', 'processing', 'paid', 'failed', 'refunded'], default: 'unpaid' },

    payment: PaymentMetadataSchema,

    shippingAddress: AddressSchema,
    billingAddress: AddressSchema,

    // audit & compliance
    createdBy: { type: String },
    updatedBy: { type: String },

    isDeleted: { type: Boolean, default: false }, // do not hard delete orders
    deletedAt: { type: Date, default: null },

    // GDPR flags: mark data retention expiry
    retentionExpiresAt: { type: Date, default: null }
}, { timestamps: true });

// Indexes
OrderSchema.index({ companyId: 1, shopId: 1, status: 1 });
OrderSchema.index({ userId: 1 });
OrderSchema.index({ orderId: 1 });

module.exports = mongoose.model('Order', OrderSchema);
