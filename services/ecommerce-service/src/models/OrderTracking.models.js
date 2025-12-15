// models/OrderTracking.models.js
const mongoose = require('mongoose');

const OrderTrackingSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    status: { type: String, required: true, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    notes: { type: String },
}, { timestamps: true });

// Index for quick lookup by order
OrderTrackingSchema.index({ orderId: 1, status: 1 });

module.exports = mongoose.model('OrderTracking', OrderTrackingSchema);
