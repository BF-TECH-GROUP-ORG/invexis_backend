const { getCart, addOrUpdateCart, removeFromCart, checkoutCart } = require('../services/cartService');
const { cartSchema } = require('../utils/app');

exports.getCart = async (req, res) => {
  try {
    const { userId, companyId } = req.query;
    if (!userId || !companyId) return res.status(400).json({ error: 'userId and companyId are required' });
    const cart = await getCart(userId, companyId);
    res.json(cart);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.addOrUpdateCart = async (req, res) => {
  try {
    const { error, value } = cartSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { userId, companyId } = req.user; // Assume auth middleware
    const cart = await addOrUpdateCart(userId, companyId, value);
    res.json(cart);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { userId, companyId, productId } = req.body;
    if (!userId || !companyId || !productId) return res.status(400).json({ error: 'userId, companyId, and productId are required' });
    const cart = await removeFromCart(userId, companyId, { items: [{ productId }] });
    res.json(cart);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.checkoutCart = async (req, res) => {
  try {
    const { userId, companyId } = req.body;
    if (!userId || !companyId) return res.status(400).json({ error: 'userId and companyId are required' });
    const order = await checkoutCart(userId, companyId);
    res.json(order);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};