// services/orderTrackingService.js
const OrderTracking = require('../models/OrderTracking.models');
const { publish, exchanges } = require('/app/shared/rabbitmq');

/**
 * Update or create order tracking entry and publish status change event.
 * @param {String} orderId - Order ObjectId string
 * @param {String} status - New status (pending|processing|shipped|delivered|cancelled)
 * @param {String} [notes] - Optional notes
 */
async function updateOrderStatus(orderId, status, notes) {
    // Upsert tracking record
    const tracking = await OrderTracking.findOneAndUpdate(
        { orderId },
        { status, notes },
        { new: true, upsert: true }
    );

    // Publish event for listeners (e.g., notification service)
    const payload = { orderId, status, notes };
    try {
        await publish(exchanges.ORDER_STATUS, payload);
    } catch (err) {
        console.error('Failed to publish order status event', err);
    }

    return tracking;
}

/** Retrieve tracking info for an order */
async function getTracking(orderId) {
    return await OrderTracking.findOne({ orderId });
}

module.exports = { updateOrderStatus, getTracking };
