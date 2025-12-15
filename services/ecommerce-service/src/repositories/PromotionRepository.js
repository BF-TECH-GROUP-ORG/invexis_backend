const Promotion = require('../models/Promotion.models');

class PromotionRepository {
    async findById(id) {
        return Promotion.findOne({ promotionId: id, isDeleted: false });
    }

    async findActive(companyId) {
        const now = new Date();
        return Promotion.find({ companyId, status: 'active', startAt: { $lte: now }, endAt: { $gte: now }, isDeleted: false });
    }

    async create(data) {
        const p = new Promotion(data);
        return p.save();
    }

    async update(promotionId, patch) {
        return Promotion.findOneAndUpdate({ promotionId, isDeleted: false }, { $set: patch }, { new: true });
    }
}

module.exports = new PromotionRepository();
