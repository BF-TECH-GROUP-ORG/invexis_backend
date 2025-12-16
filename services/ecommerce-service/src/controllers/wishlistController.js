const { getWishlist, addOrUpdateWishlist, removeFromWishlist, deleteWishlist } = require('../services/wishlistService');
const { wishlistSchema } = require('../utils/app');

exports.getWishlist = async (req, res) => {
  try {
    const { userId } = req.query || req.user;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const wishlist = await getWishlist(userId);
    res.json(wishlist);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.addOrUpdateWishlist = async (req, res) => {
  try {
    const { error, value } = wishlistSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { userId } = req.body || req.user || req.query;
    const wishlist = await addOrUpdateWishlist(userId, value);
    res.json(wishlist);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { userId, productId } = req.body || req.user || req.query;
    if (!userId || !productId) return res.status(400).json({ error: 'userId, and productId are required' });
    const wishlist = await removeFromWishlist(userId, productId);
    res.json(wishlist);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.deleteWishlist = async (req, res) => {
  try {
    const { userId } = req.body || req.user || req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const wishlist = await deleteWishlist(userId);
    res.json({ message: 'Wishlist deleted successfully', wishlist });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};