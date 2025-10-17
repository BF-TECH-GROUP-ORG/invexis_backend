const mongoose = require("mongoose");

const ConsentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Which type of consent
    type: {
        type: String,
        // enum: ["terms_of_service", "privacy_policy", "fingerprint", "national_id", "marketing", "custom"],
        required: true
    },

    // Version of the consent document
    version: { type: String, required: true },

    // Full snapshot of the consent document the user saw
    document: { type: String, required: true }, // e.g., raw text or markdown
    documentHash: { type: String, required: true }, // cryptographic hash for tamper-proof proof

    // Metadata about acceptance
    acceptedAt: { type: Date, default: Date.now },
    ip: String,
    device: String,
    location: {
        city: String,
        country: String,
        latitude: Number,
        longitude: Number
    },

    // Immutable: once accepted, cannot be changed
    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date }
}, { timestamps: true });

// Prevent modifying an existing consent
ConsentSchema.pre("save", function (next) {
    if (!this.isNew && this.isModified("document")) {
        return next(new Error("Consent documents cannot be modified once saved."));
    }
    next();
});

// Index for queries
ConsentSchema.index({ userId: 1, type: 1, version: 1 }, { unique: true });

module.exports = mongoose.model("Consent", ConsentSchema);