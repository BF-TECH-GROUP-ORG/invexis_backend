const Wishlist = require('../models/Wishlist.models');

// Helper: Validate Wishlist Item
function validateWishlistItem(item) {
  const errors = [];
  if (!item.productId || typeof item.productId !== 'string') errors.push('productId (string) is required');
  if (item.addedAt && isNaN(Date.parse(item.addedAt))) errors.push('addedAt must be a valid date');
  return errors;
}
function validateWishlistBody(body, isUpdate = false) {
  const errors = [];
  if (!isUpdate) {
    if (!body.userId || typeof body.userId !== 'string') errors.push('userId (string) is required');
    if (!body.companyId || typeof body.companyId !== 'string') errors.push('companyId (string) is required');
  }
  if (body.shopId && typeof body.shopId !== 'string') errors.push('shopId must be string');
  if (!Array.isArray(body.items)) errors.push('items (array) is required');
  else {
    body.items.forEach((item, idx) => {
      const itemErrors = validateWishlistItem(item);
      if (itemErrors.length) errors.push(`items[${idx}]: ` + itemErrors.join(', '));
    });
  }
  if (body.isDeleted !== undefined && typeof body.isDeleted !== 'boolean') errors.push('isDeleted must be boolean');
  return errors;
}
// Get wishlist for user (all fields)
exports.getWishlist = async (req, res) => {
  try {
    const { userId, companyId } = req.query;
    const wishlist = await Wishlist.findOne({ userId, companyId, isDeleted: false });
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });
    res.json(wishlist.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Add or update wishlist (all fields)
exports.addOrUpdateWishlist = async (req, res) => {
  const errors = validateWishlistBody(req.body);
  if (errors.length) return res.status(400).json({ errors });
  try {
    const { userId, companyId } = req.body;
    let wishlist = await Wishlist.findOne({ userId, companyId, isDeleted: false });
    if (!wishlist) {
      wishlist = new Wishlist(req.body);
    } else {
      Object.assign(wishlist, req.body);
    }
    await wishlist.save();
    res.json(wishlist.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Remove item from wishlist (all fields)
exports.removeFromWishlist = async (req, res) => {
  const { userId, companyId, productId } = req.body;
  if (!userId || !companyId || !productId) return res.status(400).json({ error: 'userId, companyId, and productId are required' });
  try {
    const wishlist = await Wishlist.findOne({ userId, companyId, isDeleted: false });
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });
    wishlist.items = wishlist.items.filter(i => i.productId !== productId);
    await wishlist.save();
    res.json(wishlist.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
