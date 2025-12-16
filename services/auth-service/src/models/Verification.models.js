const mongoose = require('mongoose');

const VerificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['email', 'phone', 'password_reset', '2FA_setup', 'email_change', 'otp_login'], required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 60 * 1000) },
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed }
});

VerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
VerificationSchema.index({ userId: 1, type: 1, used: 1 });

module.exports = mongoose.model('Verification', VerificationSchema);