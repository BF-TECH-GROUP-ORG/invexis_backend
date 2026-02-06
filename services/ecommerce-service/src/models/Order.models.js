// models/Order.js
const mongoose = require("mongoose");
const Money = require("/app/shared/utils/MoneyUtil");

const OrderItemSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true },
        quantity: { type: Number, required: true },
        priceAtOrder: {
            type: Number,
            required: true,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
        },
        currency: { type: String, required: true },
        metadata: mongoose.Schema.Types.Mixed,
    },
    { _id: false }
);

const AddressSchema = new mongoose.Schema({
    name: String,
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    phone: String,
}, { _id: false });

const PaymentSchema = new mongoose.Schema({
    paymentRef: String,
    provider: String,
    providerMetadata: mongoose.Schema.Types.Mixed,
}, { _id: false });

const OrderSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        items: { type: [OrderItemSchema], required: true },
        subtotal: {
            type: Number,
            required: true,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
        },
        shippingAmount: {
            type: Number,
            default: 0,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
        },
        taxes: {
            type: Number,
            default: 0,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
        },
        totalAmount: {
            type: Number,
            required: true,
            get: v => Money.toMajor(v),
            set: v => Money.toMinor(v)
        },
        currency: { type: String, required: true },
        status: {
            type: String,
            enum: ["pending", "confirmed", "paid", "shipped", "delivered", "cancelled", "refunded"],
            default: "pending",
        },
        paymentStatus: {
            type: String,
            enum: ["unpaid", "processing", "paid", "failed", "refunded"],
            default: "unpaid",
        },
        payment: PaymentSchema,
        shippingAddress: AddressSchema,
        billingAddress: AddressSchema,
        createdBy: { type: String },
        updatedBy: { type: String },
    },
    {
        timestamps: true,
        toJSON: { getters: true },
        toObject: { getters: true }
    }
);

module.exports = mongoose.model("Order", OrderSchema);
