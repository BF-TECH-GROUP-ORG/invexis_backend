// src/models/Template.js
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['email', 'sms', 'push', 'inApp'], required: true },
    content: { type: String, required: true }, // Handlebars template string
    subject: { type: String }, // For email
    variables: { type: [String], default: [] } // Expected vars like {{userName}}
}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);