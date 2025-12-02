
const { listOrders, getOrder, createOrder, updateOrder } = require('../services/orderService');
const { orderSchema, paginationSchema } = require('../utils/app');

exports.listOrders = async (req, res) => {
  try {
    const { userId, status, page, limit } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const { error, value } = paginationSchema.validate({ page, limit }, { stripUnknown: true });
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });

    const orders = await listOrders(userId, { status, page: value.page, limit: value.limit });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const order = await getOrder(orderId);
    res.json(order);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { error, value } = orderSchema.validate(req.body);
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });
    const { userId } = req.user || req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const order = await createOrder(userId, value);
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
    const order = await updateOrder(orderId, value);
    res.json(order);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
};