
const { listReviews, getReview, createReview, approveReview, deleteReview } = require('../services/reviewService');
const { reviewSchema, paginationSchema } = require('../utils/app');

exports.listReviews = async (req, res) => {
  try {
    const { companyId, productId, approved, page, limit } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });

    const { error, value } = paginationSchema.validate({ page, limit }, { stripUnknown: true });
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });

    const reviews = await listReviews(companyId, { productId, approved, page: value.page, limit: value.limit });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getReview = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const review = await getReview(reviewId, companyId);
    res.json(review);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.createReview = async (req, res) => {
  try {
    const { error, value } = reviewSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { userId, companyId } = req.user;
    const review = await createReview(userId, companyId, value);
    res.status(201).json(review);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.approveReview = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { companyId } = req.user;
    const review = await approveReview(reviewId, companyId);
    res.json(review);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { companyId } = req.user;
    const result = await deleteReview(reviewId, companyId);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};