const { getWishlist, addOrUpdateWishlist, removeFromWishlist } = require('../services/wishlistService');
const { wishlistSchema } = require('../utils/app');

exports.getWishlist = async (req, res) => {
  try {
    const { userId, companyId } = req.query;
    if (!userId || !companyId) return res.status(400).json({ error: 'userId and companyId are required' });
    const wishlist = await getWishlist(userId, companyId);
    res.json(wishlist);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.addOrUpdateWishlist = async (req, res) => {
  try {
    const { error, value } = wishlistSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { userId, companyId } = req.user;
    const wishlist = await addOrUpdateWishlist(userId, companyId, value);
    res.json(wishlist);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { userId, companyId, productId } = req.body;
    if (!userId || !companyId || !productId) return res.status(400).json({ error: 'userId, companyId, and productId are required' });
    const wishlist = await removeFromWishlist(userId, companyId, { items: [{ productId }] });
    res.json(wishlist);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};