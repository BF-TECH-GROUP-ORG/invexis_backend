"use strict";

const mongoose = require('mongoose');
const LocalizedString = require('./LocalizedString');

// MediaSchema: lightweight schema for media objects used across models
const MediaSchema = new mongoose.Schema({
    url: { type: String, required: true },
    alt: { type: LocalizedString, default: {} },
    mimeType: { type: String },
    width: { type: Number },
    height: { type: Number },
    provider: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

// Export the schema. Keep export explicit to avoid accidental undefined exports.
module.exports = MediaSchema;
