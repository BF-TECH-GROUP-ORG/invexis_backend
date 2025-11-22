const mongoose = require('mongoose');

const TimelineSchema = new mongoose.Schema({
    status: { type: String, required: true },
    description: { type: String },
    timestamp: { type: Date, default: Date.now },
    location: { type: String }
}, { _id: false });

module.exports = TimelineSchema;
