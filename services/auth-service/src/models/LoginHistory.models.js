const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now },
    ip: String,
    device: String,
    location: {
        city: String,
        country: String,
        latitude: Number,
        longitude: Number
    },
    method: { type: String, enum: ['password', 'google', '2FA', 'otp_login'] },
    riskScore: { type: Number, default: 0 },
    successful: { type: Boolean, default: true }
});

LoginHistorySchema.index({ userId: 1, timestamp: -1 });
LoginHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('LoginHistory', LoginHistorySchema);