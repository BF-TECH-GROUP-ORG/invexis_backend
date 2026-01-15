const mongoose = require('mongoose');

const userDeviceSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    fcmToken: {
        type: String,
        required: true,
        unique: true
    },
    deviceType: {
        type: String,
        enum: ['android', 'ios', 'web'],
        default: 'android'
    },
    deviceName: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Composite index for efficient querying
userDeviceSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('UserDevice', userDeviceSchema);
