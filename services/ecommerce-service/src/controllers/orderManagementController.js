const Order = require('../models/Order.models');
const cache = require('../utils/cache');
const { publish, exchanges } = require('/app/shared/rabbitmq');
const logger = require('../utils/logger');

// Advanced order filtering
exports.filterOrders = async (req, res, next) => {
    try {
        const { companyId, status, userId, minAmount, maxAmount, startDate, endDate, page = 1, limit = 20 } = req.query;
        const query = { companyId, isDeleted: false };

        if (status) query.status = status;
        if (userId) query.userId = userId;
        if (minAmount || maxAmount) {
            query.totalAmount = {};
            if (minAmount) query.totalAmount.$gte = parseFloat(minAmount);
            if (maxAmount) query.totalAmount.$lte = parseFloat(maxAmount);
        }
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const orders = await Order.find(query).limit(parseInt(limit)).skip(skip).lean();
        const total = await Order.countDocuments(query);

        res.json({ success: true, data: { orders, pagination: { page: parseInt(page), limit: parseInt(limit), total } } });
    } catch (error) {
        logger.error('Error in filterOrders:', error);
        next(error);
    }
};

// Bulk update order status
exports.bulkUpdateOrderStatus = async (req, res, next) => {
    try {
        const { companyId, orderIds, status } = req.body;
        if (!orderIds || !Array.isArray(orderIds)) {
            return res.status(400).json({ success: false, message: 'orderIds array is required' });
        }

        const result = await Order.updateMany({ orderId: { $in: orderIds }, companyId }, { status });
        await publish(exchanges.topic, 'ecommerce.order.bulk_status_updated', { companyId, orderIds, status, timestamp: Date.now() });

        res.json({ success: true, message: `Updated ${result.modifiedCount} orders`, data: result });
    } catch (error) {
        logger.error('Error in bulkUpdateOrderStatus:', error);
        next(error);
    }
};

// Process refund
exports.processRefund = async (req, res, next) => {
    try {
        const { companyId, orderId, refundAmount, reason } = req.body;
        const order = await Order.findOne({ orderId, companyId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        order.refundStatus = 'processed';
        order.refundAmount = refundAmount;
        order.refundReason = reason;
        await order.save();

        await publish(exchanges.topic, 'ecommerce.order.refund_processed', { companyId, orderId, refundAmount, reason, timestamp: Date.now() });

        res.json({ success: true, message: 'Refund processed', data: order });
    } catch (error) {
        logger.error('Error in processRefund:', error);
        next(error);
    }
};

// Request return
exports.requestReturn = async (req, res, next) => {
    try {
        const { companyId, orderId, items, reason } = req.body;
        const order = await Order.findOne({ orderId, companyId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        order.returnStatus = 'requested';
        order.returnItems = items;
        order.returnReason = reason;
        await order.save();

        await publish(exchanges.topic, 'ecommerce.order.return_requested', { companyId, orderId, items, reason, timestamp: Date.now() });

        res.json({ success: true, message: 'Return requested', data: order });
    } catch (error) {
        logger.error('Error in requestReturn:', error);
        next(error);
    }
};

// Approve return
exports.approveReturn = async (req, res, next) => {
    try {
        const { companyId, orderId } = req.body;
        const order = await Order.findOne({ orderId, companyId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        order.returnStatus = 'approved';
        await order.save();

        await publish(exchanges.topic, 'ecommerce.order.return_approved', { companyId, orderId, timestamp: Date.now() });

        res.json({ success: true, message: 'Return approved', data: order });
    } catch (error) {
        logger.error('Error in approveReturn:', error);
        next(error);
    }
};

// Order tracking details
exports.getOrderTracking = async (req, res, next) => {
    try {
        const { companyId, orderId } = req.query;
        const cacheKey = `order_tracking:${companyId}:${orderId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const order = await Order.findOne({ orderId, companyId }).lean();
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const tracking = {
            orderId,
            status: order.status,
            items: order.items,
            totalAmount: order.totalAmount,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            timeline: [
                { event: 'Order Placed', date: order.createdAt },
                { event: 'Status: ' + order.status, date: order.updatedAt }
            ]
        };

        await cache.setJSON(cacheKey, tracking, 1800);
        res.json({ success: true, data: tracking });
    } catch (error) {
        logger.error('Error in getOrderTracking:', error);
        next(error);
    }
};

// Refund analytics
exports.getRefundAnalytics = async (req, res, next) => {
    try {
        const { companyId } = req.query;
        const cacheKey = `refund_analytics:${companyId}`;
        const cached = await cache.getJSON(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        const refundedOrders = await Order.find({ companyId, refundStatus: 'processed' }).lean();
        const totalRefunded = refundedOrders.reduce((sum, o) => sum + (o.refundAmount || 0), 0);

        const refundAnalytics = {
            totalRefunded,
            refundCount: refundedOrders.length,
            refundRate: ((refundedOrders.length / await Order.countDocuments({ companyId })) * 100).toFixed(2) + '%'
        };

        await cache.setJSON(cacheKey, refundAnalytics, 3600);
        res.json({ success: true, data: refundAnalytics });
    } catch (error) {
        logger.error('Error in getRefundAnalytics:', error);
        next(error);
    }
};

module.exports = exports;
