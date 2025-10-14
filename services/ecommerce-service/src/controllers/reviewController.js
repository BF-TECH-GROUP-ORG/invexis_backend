const Review = require('../models/Review.models');

// List reviews for product (all fields)
exports.listReviews = async (req, res) => {
  try {
    const { productId } = req.query;
    const filter = { isDeleted: false };
    if (productId) filter.productId = productId;
    const reviews = await Review.find(filter);
    res.json(reviews.map(r => r.toObject()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get review by id (all fields)
exports.getReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findOne({ reviewId: id, isDeleted: false });
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper: Validate Review
function validateReviewBody(body, isUpdate = false) {
  const errors = [];
  if (!isUpdate) {
    if (!body.reviewId || typeof body.reviewId !== 'string') errors.push('reviewId (string) is required');
    if (!body.userId || typeof body.userId !== 'string') errors.push('userId (string) is required');
    if (!body.productId || typeof body.productId !== 'string') errors.push('productId (string) is required');
    if (!body.companyId || typeof body.companyId !== 'string') errors.push('companyId (string) is required');
    if (typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5) errors.push('rating (1-5) is required');
  }
  if (body.comment && typeof body.comment !== 'string') errors.push('comment must be string');
  if (body.isApproved !== undefined && typeof body.isApproved !== 'boolean') errors.push('isApproved must be boolean');
  if (body.flagged !== undefined && typeof body.flagged !== 'boolean') errors.push('flagged must be boolean');
  if (body.createdBy && typeof body.createdBy !== 'string') errors.push('createdBy must be string');
  if (body.updatedBy && typeof body.updatedBy !== 'string') errors.push('updatedBy must be string');
  if (body.isDeleted !== undefined && typeof body.isDeleted !== 'boolean') errors.push('isDeleted must be boolean');
  return errors;
}
// Create review (all fields)
exports.createReview = async (req, res) => {
  const errors = validateReviewBody(req.body);
  if (errors.length) return res.status(400).json({ errors });
  try {
    const review = new Review(req.body);
    await review.save();
    res.status(201).json(review.toObject());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Approve review (all fields)
exports.approveReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findOneAndUpdate(
      { reviewId: id, isDeleted: false },
      { isApproved: true },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review.toObject());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete review (soft, all fields)
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findOneAndUpdate(
      { reviewId: id, isDeleted: false },
      { isDeleted: true },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review.toObject());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
