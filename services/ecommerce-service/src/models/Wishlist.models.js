// models/Wishlist.js
const mongoose = require("mongoose");

const WishlistSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        items: [{ productId: String, addedAt: { type: Date, default: Date.now } }],
        isDeleted: { type: Boolean, default: false }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Wishlist", WishlistSchema);
