const Cart = require('../models/Cart.models');

class CartRepository {
    async findActiveByCompanyAndUser(companyId, userId) {
        return Cart.findOne({ companyId, userId, status: 'active', isDeleted: false });
    }

    async findById(id) {
        return Cart.findById(id);
    }

    async findActiveByCompany(companyId) {
        return Cart.find({ companyId, status: 'active', isDeleted: false });
    }

    async create(data) {
        const cart = new Cart(data);
        return cart.save();
    }

    async update(id, patch) {
        return Cart.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
    }

    async createOrUpdateByCompanyAndUser(companyId, userId, data) {
        return Cart.findOneAndUpdate({ companyId, userId, isDeleted: false }, { $set: data }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    async markAbandoned(id, reason) {
        return Cart.findByIdAndUpdate(id, { status: 'abandoned', abandonedReason: reason, lastActivity: new Date() }, { new: true });
    }

    async listAbandonedBefore(cutoffDate) {
        return Cart.find({ status: 'active', lastActivity: { $lt: cutoffDate }, isDeleted: false });
    }
}

module.exports = new CartRepository();
