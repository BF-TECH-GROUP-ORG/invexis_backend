// src/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    templateName: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    channels: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // For personal
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, index: true },
    roles: [{ type: String }],
    scope: {
        type: String,
        enum: ['personal', 'department', 'company', 'admin', 'system'],
        required: true
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sendAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' }
}, { timestamps: true });

// Indexes
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, createdAt: -1 });
notificationSchema.index({ departmentId: 1, createdAt: -1 });
notificationSchema.index({ scope: 1, sendAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);