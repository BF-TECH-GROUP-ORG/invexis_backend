const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true },
    deviceId: { type: String, default: 'unknown' },
    ip: String,
    location: {
        city: String,
        country: String,
        latitude: Number,
        longitude: Number
    },
    lastActiveAt: { type: Date, default: Date.now },
    revoked: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

SessionSchema.index({ userId: 1, revoked: 1 });

module.exports = mongoose.model('Session', SessionSchema);