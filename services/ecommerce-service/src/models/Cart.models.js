// models/Cart.js
const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        priceAtAdd: { type: Number, required: true },
        currency: { type: String, required: true },
        discount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { _id: false }
);

const CartSchema = new mongoose.Schema(
    {
        userId: { type: String }, // optional for guest carts
        items: { type: [CartItemSchema], default: [] },
        total: { type: Number, default: 0 },
        currency: { type: String, default: "USD" },
        discount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        status: { type: String, enum: ["active", "checked_out", "abandoned"], default: "active" },
        lastActivity: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Cart", CartSchema);
