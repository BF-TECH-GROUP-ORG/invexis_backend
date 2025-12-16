// src/models/Preference.js
const mongoose = require('mongoose');

const preferenceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    companyId: { type: String, required: true },
    preferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true }
    }
}, { timestamps: true });

module.exports = mongoose.model('Preference', preferenceSchema);