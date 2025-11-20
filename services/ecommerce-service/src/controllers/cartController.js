// const Cart = require('../models/Cart.models');


// // Helper: Validate Cart Item
// function validateCartItem(item) {
//   const errors = [];
//   if (!item.productId || typeof item.productId !== 'string') errors.push('productId (string) is required');
//   if (typeof item.quantity !== 'number' || item.quantity < 1) errors.push('quantity (number >= 1) is required');
//   if (typeof item.priceAtAdd !== 'number') errors.push('priceAtAdd (number) is required');
//   if (!item.currency || typeof item.currency !== 'string') errors.push('currency (string) is required');
//   // metadata is optional
//   return errors;
// }

// // Helper: Validate Cart Body
// function validateCartBody(body, isUpdate = false) {
//   const errors = [];
//   if (!isUpdate) {
//     if (!body.companyId || typeof body.companyId !== 'string') errors.push('companyId (string) is required');
//   }
//   if (body.shopId && typeof body.shopId !== 'string') errors.push('shopId must be string');
//   if (!Array.isArray(body.items)) errors.push('items (array) is required');
//   else {
//     body.items.forEach((item, idx) => {
//       const itemErrors = validateCartItem(item);
//       if (itemErrors.length) errors.push(`items[${idx}]: ` + itemErrors.join(', '));
//     });
//   }
//   if (body.status && !['active','checked_out','abandoned'].includes(body.status)) errors.push('status must be one of active, checked_out, abandoned');
//   if (body.lastActivity && isNaN(Date.parse(body.lastActivity))) errors.push('lastActivity must be a valid date');
//   if (body.isDeleted !== undefined && typeof body.isDeleted !== 'boolean') errors.push('isDeleted must be boolean');
//   return errors;
// }

// // Get active cart (returns all fields)
// exports.getCart = async (req, res) => {
//   try {
//     const { companyId } = req.query;
//     const cart = await Cart.findOne({ companyId, status: 'active', isDeleted: false });
//     if (!cart) return res.status(404).json({ message: 'Cart not found' });
//     res.json(cart.toObject());
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Create or update full cart (all fields required)
// exports.addOrUpdateCart = async (req, res) => {
//   const errors = validateCartBody(req.body);
//   if (errors.length) return res.status(400).json({ errors });
//   try {
//     const { companyId } = req.body;
//     let cart = await Cart.findOne({ companyId, status: 'active', isDeleted: false });
//     if (!cart) {
//       cart = new Cart(req.body);
//     } else {
//       Object.assign(cart, req.body);
//     }
//     cart.lastActivity = new Date();
//     await cart.save();
//     res.json(cart.toObject());
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Remove item from cart (requires all fields, returns full cart)
// exports.removeFromCart = async (req, res) => {
//   const { companyId, productId } = req.body;
//   if (!companyId || !productId) return res.status(400).json({ error: 'companyId and productId are required' });
//   try {
//     const cart = await Cart.findOne({ companyId, status: 'active', isDeleted: false });
//     if (!cart) return res.status(404).json({ message: 'Cart not found' });
//     cart.items = cart.items.filter(i => i.productId !== productId);
//     cart.lastActivity = new Date();
//     await cart.save();
//     res.json(cart.toObject());
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Checkout cart (returns full cart)
// exports.checkoutCart = async (req, res) => {
//   const { companyId } = req.body;
//   if (!companyId) return res.status(400).json({ error: 'companyId is required' });
//   try {
//     const cart = await Cart.findOne({ companyId, status: 'active', isDeleted: false });
//     if (!cart) return res.status(404).json({ message: 'Cart not found' });
//     cart.status = 'checked_out';
//     cart.lastActivity = new Date();
//     await cart.save();
//     res.json(cart.toObject());
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };



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