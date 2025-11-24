const FeaturedBanner = require('../models/FeaturedBanner.models');

class FeaturedBannerRepository {
    async findById(bannerId, companyId) {
        return FeaturedBanner.findOne({ bannerId, companyId, isDeleted: false });
    }

    async list(query = {}, opts = {}) {
        const q = { isDeleted: false, ...query };
        const limit = parseInt(opts.limit || 10, 10);
        const page = Math.max(parseInt(opts.page || 1, 10), 1);
        const sort = opts.sort || { priority: -1 };
        return FeaturedBanner.find(q).sort(sort).limit(limit).skip((page - 1) * limit).lean();
    }

    async create(data) {
        const b = new FeaturedBanner(data);
        return b.save();
    }

    async update(bannerId, companyId, patch) {
        return FeaturedBanner.findOneAndUpdate({ bannerId, companyId, isDeleted: false }, { $set: patch }, { new: true });
    }
}

module.exports = new FeaturedBannerRepository();
