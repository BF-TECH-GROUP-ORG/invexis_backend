// controllers/orderTrackingController.js
const orderTrackingService = require('../services/orderTrackingService');

/**
 * Get tracking info for a specific order
 */
async function getTracking(req, res) {
    const { orderId } = req.params;
    try {
        const tracking = await orderTrackingService.getTracking(orderId);
        if (!tracking) return res.status(404).json({ error: 'Tracking not found' });
        res.json(tracking);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

/**
 * Update order status (create or modify tracking)
 */
async function updateTracking(req, res) {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    try {
        const tracking = await orderTrackingService.updateOrderStatus(orderId, status, notes);
        res.json(tracking);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { getTracking, updateTracking };
