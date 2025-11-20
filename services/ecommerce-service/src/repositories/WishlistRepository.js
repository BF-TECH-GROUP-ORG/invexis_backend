const Wishlist = require('../models/Wishlist.models');

class WishlistRepository {
    async findByUser(companyId, userId) {
        return Wishlist.findOne({ companyId, userId, isDeleted: false });
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
}

module.exports = new WishlistRepository();
