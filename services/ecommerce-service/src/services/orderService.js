const Order = require('../models/Order.models');
const { v4: uuidv4 } = require('uuid');
const { publish, exchanges } = require('/app/shared/rabbitmq');

async function listOrders(userId, companyId, opts = {}) {
    const q = { isDeleted: false, userId, companyId };
    if (opts.status) q.status = opts.status;
    const limit = parseInt(opts.limit || 20, 10);
    const page = Math.max(parseInt(opts.page || 1, 10), 1);
    const orders = await Order.find(q).limit(limit).skip((page - 1) * limit).lean();
    return { orders, pagination: { page, limit, total: orders.length } };
}

async function getOrder(orderId, companyId) {
    const cache = require('../utils/cache');
    const key = `order:${companyId}:${orderId}`;
    const cached = await cache.getJSON(key);
    if (cached) return cached;
    const o = await Order.findOne({ orderId, companyId, isDeleted: false });
    if (!o) throw new Error('not found');
    await cache.setJSON(key, o);
    return o;
}

async function createOrder(userId, companyId, data) {
    const orderId = data.orderId || `order_${uuidv4()}`;
    const order = new Order(Object.assign({ orderId, userId, companyId }, data));
    await order.save();
    try { await publish(exchanges.topic, 'ecommerce.order.created', order); } catch (e) { }
    // invalidate order cache if any
    try { const cache = require('../utils/cache'); await cache.del(`order:${companyId}:${orderId}`); } catch (e) { }
    return order;
}

async function updateOrder(orderId, companyId, patch) {
    const o = await Order.findOneAndUpdate({ orderId, companyId, isDeleted: false }, { $set: patch }, { new: true });
    if (!o) throw new Error('not found');
    try { await publish(exchanges.topic, 'ecommerce.order.updated', o); } catch (e) { }
    return o;
}

module.exports = { listOrders, getOrder, createOrder, updateOrder };
