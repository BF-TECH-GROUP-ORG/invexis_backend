const Review = require('../models/Review.models');
const { publish, exchanges } = require('/app/shared/rabbitmq');

async function listReviews(companyId, opts = {}) {
    const cache = require('../utils/cache');
    const key = `reviews:company:${companyId}:opts:${JSON.stringify(opts)}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const q = { companyId, isDeleted: false };
    if (opts.productId) q.productId = opts.productId;
    if (opts.approved !== undefined) q.isApproved = opts.approved === 'true' || opts.approved === true;
    const limit = parseInt(opts.limit || 20, 10);
    const page = Math.max(parseInt(opts.page || 1, 10), 1);
    const reviews = await Review.find(q).limit(limit).skip((page - 1) * limit).lean();
    const res = { reviews, pagination: { page, limit, total: reviews.length } };
    await cache.setJSON(key, res, 60);
    return res;
}

async function getReview(reviewId, companyId) {
    const cache = require('../utils/cache');
    const key = `review:${companyId}:${reviewId}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const r = await Review.findOne({ _id: reviewId, companyId, isDeleted: false });
    if (!r) throw new Error('not found');
    await cache.setJSON(key, r);
    return r;
}

async function createReview(userId, companyId, data) {
    data.userId = userId;
    data.companyId = companyId;
    const r = new Review(data);
    await r.save();
    try { await publish(exchanges.topic, 'ecommerce.review.created', r); } catch (e) { }
    return r;
}

async function approveReview(reviewId, companyId) {
    const r = await Review.findOneAndUpdate({ _id: reviewId, companyId, isDeleted: false }, { isApproved: true }, { new: true });
    if (!r) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.review.approved', r); } catch (e) { }
    return r;
}

async function deleteReview(reviewId, companyId) {
    const r = await Review.findOneAndUpdate({ _id: reviewId, companyId, isDeleted: false }, { isDeleted: true }, { new: true });
    if (!r) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.review.deleted', { reviewId, companyId }); } catch (e) { }
    return r;
}

module.exports = { listReviews, getReview, createReview, approveReview, deleteReview };
