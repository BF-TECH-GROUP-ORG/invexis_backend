const mongoose = require('mongoose');
const Address = require('./schemas/Address');
const Timeline = require('./schemas/Timeline');

const DeliverySchema = new mongoose.Schema({
    orderId: { type: String, required: true, index: true },
    companyId: { type: String, required: true, index: true },
    shopId: { type: String },

    provider: { type: String, required: true }, // e.g., 'dhl', 'mtn_express', 'pickup'
    trackingNumber: String,
    trackingUrl: String,

    shippingAddress: { type: Address, required: true },
    deliveryMethod: { type: String }, // e.g., 'standard', 'express', 'pickup'
    expectedAt: Date,
    deliveredAt: Date,
    status: { type: String, enum: ['pending', 'in_transit', 'delivered', 'cancelled', 'failed'], default: 'pending' },

    timeline: { type: [Timeline], default: [] },
    notes: String,
    metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

DeliverySchema.index({ orderId: 1, companyId: 1 });
DeliverySchema.index({ trackingNumber: 1 });

module.exports = mongoose.model('Delivery', DeliverySchema);
