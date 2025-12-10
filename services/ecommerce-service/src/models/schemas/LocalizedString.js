const mongoose = require('mongoose');

// Simple localized string schema used across models (no _id)
const LocalizedString = new mongoose.Schema({
    en: { type: String },
    fr: { type: String },
    es: { type: String }
}, { _id: false });

module.exports = LocalizedString;
