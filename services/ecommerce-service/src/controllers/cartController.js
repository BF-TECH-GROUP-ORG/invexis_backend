const { getCart, addOrUpdateCart, removeItem, checkoutCart } = require('../services/cartService');
const { cartSchema } = require('../utils/app');

exports.getCart = async (req, res) => {
  try {
    const { userId } = req.query || req.body || req.user;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const cart = await getCart(userId);
    res.json(cart);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.addOrUpdateCart = async (req, res) => {
  try {
    const { error, value } = cartSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { userId } = req.user || req.body; // Get from auth or request body
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const cart = await addOrUpdateCart(userId, value);
    res.json(cart);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { userId, productId } = req.body;
    if (!userId || !productId) return res.status(400).json({ error: 'userId and productId are required' });
    const cart = await removeItem(userId, productId);

    // If cart is null, it means all items were removed and cart was deleted
    if (!cart) {
      return res.json({
        success: true,
        message: 'Successfully removed item from cart. Cart deleted as it was empty.',
        data: null
      });
    }

    res.json({
      success: true,
      message: 'Successfully removed item from cart',
      data: cart
    });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.checkoutCart = async (req, res) => {
  try {
    const { userId } = req.body || req.user || req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const order = await checkoutCart(userId);
    res.json(order);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};