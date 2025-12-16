const mongoose = require('mongoose');

const PreferencesSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    language: { type: String, default: 'en' },
    notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
    }
});

PreferencesSchema.index({ userId: 1 });

module.exports = mongoose.model('Preference', PreferencesSchema);