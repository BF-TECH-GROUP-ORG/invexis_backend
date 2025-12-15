const Order = require('../models/Order.models');
const { emit } = require('../events/producer');

async function listOrders(userId, opts = {}) {
    const q = { userId };
    if (opts.status) q.status = opts.status;
    const limit = parseInt(opts.limit || 20, 10);
    const page = Math.max(parseInt(opts.page || 1, 10), 1);
    const orders = await Order.find(q).limit(limit).skip((page - 1) * limit).lean();
    return { orders, pagination: { page, limit, total: orders.length } };
}

async function getOrder(orderId) {
    const cache = require('../utils/cache');
    const key = `order:${orderId}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const o = await Order.findById(orderId);
    if (!o) throw new Error('not found');
    await cache.setJSON(key, o);
    return o;
}

async function createOrder(userId, data) {
    const order = new Order(Object.assign({ userId }, data));
    await order.save();
    try { await emit('ecommerce.order.created', order); } catch (e) { }
    // invalidate order cache if any
    try { const cache = require('../utils/cache'); await cache.del(`order:${order._id}`); } catch (e) { }
    return order;
}

async function updateOrder(orderId, patch) {
    const o = await Order.findByIdAndUpdate(orderId, { $set: patch }, { new: true });
    if (!o) throw new Error('not found');
    try { await emit('ecommerce.order.updated', o); } catch (e) { }
    return o;
}

module.exports = { listOrders, getOrder, createOrder, updateOrder };
