const Wishlist = require('../models/Wishlist.models');

class WishlistRepository {
    async findByUser(userId) {
        return Wishlist.findOne({ userId, isDeleted: { $ne: true } });
    }

    async addItem(wishlistId, productId) {
        return Wishlist.findByIdAndUpdate(wishlistId, { $addToSet: { items: { productId, addedAt: new Date() } } }, { new: true });
    }

    async removeItem(wishlistId, productId) {
        return Wishlist.findByIdAndUpdate(wishlistId, { $pull: { items: { productId } } }, { new: true });
    }

    async create(data) {
        const w = new Wishlist(data);
        return w.save();
    }

    async deleteWishlist(wishlistId) {
        return Wishlist.findByIdAndUpdate(wishlistId, { isDeleted: true }, { new: true });
    }
}

module.exports = new WishlistRepository();
