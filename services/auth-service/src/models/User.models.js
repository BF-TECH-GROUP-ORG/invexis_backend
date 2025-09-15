const mongoose = require("mongoose");

// Fingerprint schema
const FingerprintSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    template: { type: Buffer, required: true },
    registeredAt: { type: Date, default: Date.now }
});

// User preferences schema
const PreferencesSchema = new mongoose.Schema({
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    language: { type: String, default: "en" },
    notifications: {
        email: { type: Boolean, default: true },
        smsEnabled: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
    }
});

// Login history schema
const LoginHistorySchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    ip: String,
    device: String,
    location: {
        city: String,
        country: String,
        latitude: Number,
        longitude: Number
    },
    method: { type: String, enum: ["password", "google", "fingerprint", "2FA"] },
    riskScore: { type: Number, default: 0 },
    successful: { type: Boolean, default: true }
});

// Consent schema
const ConsentSchema = new mongoose.Schema({
    termsAccepted: { type: Boolean, required: true },
    termsVersion: { type: String, required: true },
    termsAcceptedAt: { type: Date },
    privacyAccepted: { type: Boolean, required: true },
    privacyVersion: { type: String, required: true },
    privacyAcceptedAt: { type: Date },
    fingerprintConsent: { type: Boolean },
    nationalIdConsent: { type: Boolean },
    ip: String,
    device: String
});

// OTP / Verification schema
const VerificationSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ["email", "phone", "password_reset", "2FA"],
        required: true
    },
    code: { type: String, required: true },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 5 * 60 * 60 * 1000) // 5 hours
    },
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
VerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Device & session schema (with refresh token)
const SessionSchema = new mongoose.Schema({
    refreshToken: { type: String, required: true },
    deviceId: { type: String, required: true },
    ip: String,
    location: {
        city: String,
        country: String,
        latitude: Number,
        longitude: Number
    },
    lastActiveAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    revoked: { type: Boolean, default: false }
});

// Audit trail schema
const AuditSchema = new mongoose.Schema({
    action: String,
    changedBy: { type: String }, // userId or system
    timestamp: { type: Date, default: Date.now },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
});

// Main User schema
const UserSchema = new mongoose.Schema({
    // Core identity
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    username: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true, match: /^[0-9]{10,15}$/ },
    profilePicture: { type: String, default: null },

    // Security
    passwordHash: { type: String, select: false },
    googleId: { type: String, sparse: true },
    fingerprints: [{
        type: FingerprintSchema,
        validate: {
            validator: function (v) {
                return this.role !== "customer";
            },
            message: "Fingerprints only allowed for employees/admins"
        }
    }],
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    twoFAEnabled: { type: Boolean, default: false },
    twoFASecret: { type: String, select: false },

    // Identity details
    nationalId: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },

    // Role & organization
    role: {
        type: String,
        enum: ["super_admin", "company_admin", "shop_manager", "worker", "customer"],
        required: true
    },
    companyId: { type: String, default: null },
    shopId: { type: String, default: null },
    position: { type: String },
    department: { type: String },
    dateJoined: { type: Date },
    employmentStatus: { type: String, enum: ["active", "on_leave", "suspended"], default: "active" },
    emergencyContact: { name: String, phone: String },

    // Address
    address: { street: String, city: String, state: String, postalCode: String, country: String },

    // Preferences
    preferences: PreferencesSchema,

    // Audit & history
    lastLoginAt: { type: Date },
    loginHistory: [LoginHistorySchema],
    sessions: [SessionSchema],
    auditTrail: [AuditSchema],

    // Consent & compliance
    consent: ConsentSchema,

    // OTP / Verification tokens
    verificationTokens: [VerificationSchema],

    // Failed login attempts
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date }, // account temporarily locked

    // Account metadata
    accountStatus: { type: String, enum: ["active", "deactivated", "banned"], default: "active" },
    notes: [{ type: String }]
}, { timestamps: true });

// Indexes for faster queries
// UserSchema.index({ email: 1 });
// UserSchema.index({ phone: 1 });
// UserSchema.index({ username: 1 });
// UserSchema.index({ companyId: 1, shopId: 1 });
// UserSchema.index({ companyId: 1, role: 1 });

module.exports = mongoose.model("User", UserSchema);