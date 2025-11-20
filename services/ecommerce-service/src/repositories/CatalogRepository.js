const Catalog = require('../models/Catalog.models');

class CatalogRepository {
    async findByProductId(productId) {
        return Catalog.findOne({ productId, isDeleted: false });
    }

    async search(query = {}, opts = {}) {
        const q = { isDeleted: false, ...query };
        const limit = parseInt(opts.limit || 20, 10);
        const page = Math.max(parseInt(opts.page || 1, 10), 1);
        const sort = opts.sort || { featured: -1 };
        return Catalog.find(q).sort(sort).limit(limit).skip((page - 1) * limit).lean();
    }

    async create(data) {
        const c = new Catalog(data);
        return c.save();
    }

    async update(productId, patch) {
        return Catalog.findOneAndUpdate({ productId, isDeleted: false }, { $set: patch }, { new: true });
    }
}

module.exports = new CatalogRepository();
