
const { listOrders, getOrder, createOrder, updateOrder } = require('../services/orderService');
const { orderSchema, paginationSchema } = require('../utils/app');

exports.listOrders = async (req, res) => {
  try {
    const { userId, companyId, status, page, limit } = req.query;
    if (!userId || !companyId) return res.status(400).json({ error: 'userId and companyId are required' });

    const { error, value } = paginationSchema.validate({ page, limit }, { stripUnknown: true });
    if (error) return res.status(400).json({ errors: error.details.map(d => d.message) });

    const orders = await listOrders(userId, companyId, { status, page: value.page, limit: value.limit });
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