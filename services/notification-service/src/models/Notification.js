// src/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    // Legacy fields for backward compatibility
    title: { type: String, required: true },
    body: { type: String, required: true },

    templateName: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Channel configuration
    channels: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
    },

    // Channel-specific compiled content
    compiledContent: {
        email: {
            subject: { type: String },
            html: { type: String },
            text: { type: String } // Plain text fallback
        },
        sms: {
            message: { type: String }
        },
        push: {
            title: { type: String },
            body: { type: String },
            data: { type: mongoose.Schema.Types.Mixed },
            sound: { type: String },
            badge: { type: Number },
            priority: { type: String },
            category: { type: String }
        },
        inApp: {
            title: { type: String },
            body: { type: String },
            data: { type: mongoose.Schema.Types.Mixed },
            actionUrl: { type: String },
            imageUrl: { type: String }
        }
    },

    // Targeting
    userId: { type: mongoose.Schema.Types.ObjectId, index: true }, // For personal
    companyId: { type: String, required: true, index: true },
    departmentId: { type: String, index: true },
    roles: [{ type: String }],
    scope: {
        type: String,
        enum: ['personal', 'department', 'company', 'admin', 'system'],
        required: true
    },

    // Delivery tracking
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sendAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'sent', 'failed', 'partial'], default: 'pending' },

    // Channel delivery status
    deliveryStatus: {
        email: {
            status: { type: String, enum: ['pending', 'sent', 'delivered', 'failed', 'skipped'], default: 'pending' },
            providerId: { type: String },
            error: { type: String },
            sentAt: { type: Date },
            deliveredAt: { type: Date }
        },
        sms: {
            status: { type: String, enum: ['pending', 'sent', 'delivered', 'failed', 'skipped'], default: 'pending' },
            providerId: { type: String },
            error: { type: String },
            sentAt: { type: Date },
            deliveredAt: { type: Date }
        },
        push: {
            status: { type: String, enum: ['pending', 'sent', 'delivered', 'failed', 'skipped'], default: 'pending' },
            providerId: { type: String },
            error: { type: String },
            sentAt: { type: Date },
            deliveredAt: { type: Date }
        },
        inApp: {
            status: { type: String, enum: ['pending', 'sent', 'delivered', 'failed', 'skipped'], default: 'pending' },
            error: { type: String },
            sentAt: { type: Date },
            readAt: { type: Date }
        }
    }
}, { timestamps: true });

// Indexes
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, createdAt: -1 });
notificationSchema.index({ departmentId: 1, createdAt: -1 });
notificationSchema.index({ scope: 1, sendAt: 1 });
notificationSchema.index({ status: 1, sendAt: 1 });

// Instance methods
notificationSchema.methods.getContentForChannel = function(channel) {
    return this.compiledContent?.[channel] || null;
};

notificationSchema.methods.setChannelDeliveryStatus = function(channel, status, providerId = null, error = null) {
    if (!this.deliveryStatus) {
        this.deliveryStatus = {};
    }
    if (!this.deliveryStatus[channel]) {
        this.deliveryStatus[channel] = {};
    }

    this.deliveryStatus[channel].status = status;
    if (providerId) this.deliveryStatus[channel].providerId = providerId;
    if (error) this.deliveryStatus[channel].error = error;

    if (status === 'sent') {
        this.deliveryStatus[channel].sentAt = new Date();
    } else if (status === 'delivered') {
        this.deliveryStatus[channel].deliveredAt = new Date();
    }

    // Update overall status
    this.updateOverallStatus();
};

notificationSchema.methods.updateOverallStatus = function() {
    const enabledChannels = Object.keys(this.channels).filter(channel => this.channels[channel]);
    const channelStatuses = enabledChannels.map(channel =>
        this.deliveryStatus?.[channel]?.status || 'pending'
    );

    if (channelStatuses.every(status => status === 'sent' || status === 'delivered')) {
        this.status = 'sent';
    } else if (channelStatuses.every(status => status === 'failed' || status === 'skipped')) {
        this.status = 'failed';
    } else if (channelStatuses.some(status => status === 'sent' || status === 'delivered')) {
        this.status = 'partial';
    } else {
        this.status = 'pending';
    }
};

notificationSchema.methods.hasContentForChannel = function(channel) {
    return !!(this.compiledContent?.[channel] &&
             Object.keys(this.compiledContent[channel]).length > 0);
};

// Static methods
notificationSchema.statics.findPendingForDelivery = function() {
    return this.find({
        status: { $in: ['pending', 'partial'] },
        sendAt: { $lte: new Date() }
    });
};

module.exports = mongoose.model('Notification', notificationSchema);