// const Order = require('../models/Order.models');

// // List orders for user/company (all fields)
// exports.listOrders = async (req, res) => {
//   try {
//     const { userId, companyId } = req.query;
//     const filter = { isDeleted: false };
//     if (userId) filter.userId = userId;
//     if (companyId) filter.companyId = companyId;
//     const orders = await Order.find(filter);
//     res.json(orders.map(o => o.toObject()));
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get order by id (all fields)
// exports.getOrder = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const order = await Order.findOne({ orderId: id, isDeleted: false });
//     if (!order) return res.status(404).json({ message: 'Order not found' });
//     res.json(order.toObject());
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Helper: Validate Order Item
// function validateOrderItem(item) {
//   const errors = [];
//   if (!item.productId || typeof item.productId !== 'string') errors.push('productId (string) is required');
//   if (typeof item.quantity !== 'number') errors.push('quantity (number) is required');
//   if (typeof item.priceAtOrder !== 'number') errors.push('priceAtOrder (number) is required');
//   if (!item.currency || typeof item.currency !== 'string') errors.push('currency (string) is required');
//   // metadata is optional
//   return errors;
// }
// function validateOrderBody(body, isUpdate = false) {
//   const errors = [];
//   if (!isUpdate) {
//     if (!body.orderId || typeof body.orderId !== 'string') errors.push('orderId (string) is required');
//     if (!body.userId || typeof body.userId !== 'string') errors.push('userId (string) is required');
//     if (!body.companyId || typeof body.companyId !== 'string') errors.push('companyId (string) is required');
//     if (!Array.isArray(body.items) || !body.items.length) errors.push('items (array) is required');
//     if (typeof body.subtotal !== 'number') errors.push('subtotal (number) is required');
//     if (typeof body.totalAmount !== 'number') errors.push('totalAmount (number) is required');
//     if (!body.currency || typeof body.currency !== 'string') errors.push('currency (string) is required');
//   }
//   if (body.shopId && typeof body.shopId !== 'string') errors.push('shopId must be string');
//   if (body.items) body.items.forEach((item, idx) => {
//     const itemErrors = validateOrderItem(item);
//     if (itemErrors.length) errors.push(`items[${idx}]: ` + itemErrors.join(', '));
//   });
//   if (body.shippingAmount && typeof body.shippingAmount !== 'number') errors.push('shippingAmount must be number');
//   if (body.taxes && typeof body.taxes !== 'number') errors.push('taxes must be number');
//   if (body.status && !['pending','confirmed','paid','shipped','delivered','cancelled','refunded'].includes(body.status)) errors.push('status must be valid');
//   if (body.paymentStatus && !['unpaid','processing','paid','failed','refunded'].includes(body.paymentStatus)) errors.push('paymentStatus must be valid');
//   // payment, shippingAddress, billingAddress, createdBy, updatedBy, isDeleted, deletedAt, retentionExpiresAt are optional
//   return errors;
// }
// // Create order (all fields)
// exports.createOrder = async (req, res) => {
//   const errors = validateOrderBody(req.body);
//   if (errors.length) return res.status(400).json({ errors });
//   try {
//     const order = new Order(req.body);
//     await order.save();
//     res.status(201).json(order.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };

// // Update order (all fields)
// exports.updateOrder = async (req, res) => {
//   const errors = validateOrderBody(req.body, true);
//   if (errors.length) return res.status(400).json({ errors });
//   try {
//     const { id } = req.params;
//     const order = await Order.findOneAndUpdate(
//       { orderId: id, isDeleted: false },
//       req.body,
//       { new: true }
//     );
//     if (!order) return res.status(404).json({ message: 'Order not found' });
//     res.json(order.toObject());
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// };



const { listOrders, getOrder, createOrder, updateOrder } = require('../services/orderService');
const { orderSchema } = require('../utils/app');

exports.listOrders = async (req, res) => {
  try {
    const { userId, companyId, status, page, limit } = req.query;
    if (!userId || !companyId) return res.status(400).json({ error: 'userId and companyId are required' });
    const orders = await listOrders(userId, companyId, { status, page, limit });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const order = await getOrder(orderId, companyId);
    res.json(order);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { error, value } = orderSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { userId, companyId } = req.user;
    const order = await createOrder(userId, companyId, value);
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const { error, value } = orderSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { id: orderId } = req.params;
    const { companyId } = req.user;
    const order = await updateOrder(orderId, companyId, value);
    res.json(order);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};