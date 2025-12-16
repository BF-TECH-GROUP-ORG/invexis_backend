const mongoose = require('mongoose');

const ProcessedEventSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, index: true }, // traceId or type:entityId
        type: { type: String },
        payloadSummary: { type: mongoose.Schema.Types.Mixed },
        processedAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

module.exports = mongoose.model('ProcessedEvent', ProcessedEventSchema);
