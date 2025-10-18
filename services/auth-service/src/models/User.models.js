const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    username: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    profilePicture: { type: String, default: null },
    password: { type: String, select: false, required: true },
    googleId: { type: String, sparse: true },

    // Verification
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    twoFAEnabled: { type: Boolean, default: false },
    twoFASecret: { type: String, select: false },

    // Identity
    nationalId: { type: String, unique: true, sparse: true, match: /^[A-Z0-9]{5,20}$/ },
    dateOfBirth: Date,
    gender: { type: String, enum: ["male", "female", "other"], default: "other" },

    // Role & Permissions
    role: {
        type: String,
        enum: ["super_admin", "company_admin", "shop_manager", "worker", "customer"],
        required: true
    },
    permissions: [{ type: String }], // granular overrides

    // Multi-tenancy (supports multiple companies/shops)
    companies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Company" }],
    shops: [{ type: mongoose.Schema.Types.ObjectId, ref: "Shop" }],

    // Work details
    position: { type: String },
    department: {
        type: String,
        enum: [
            "sales", "inventory_management", "inventory_operations",
            "sales_manager", "development", "hr", "management", "other"
        ]
    },
    dateJoined: { type: Date },
    employmentStatus: { type: String, enum: ["active", "on_leave", "suspended", "terminated"], default: "active" },

    // Emergency & Address
    emergencyContact: { name: String, phone: String },
    address: {
        street: String,
        city: String,
        state: String,
        postalCode: String,
        country: String
    },

    // References (all optional)
    preferences: { type: mongoose.Schema.Types.ObjectId, ref: "Preference", default: null, required: false },
    loginHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "LoginHistory", default: [] }],
    sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Session", default: [] }],
    consent: { type: mongoose.Schema.Types.ObjectId, ref: "Consent", default: null, required: false },
    verificationTokens: [{ type: mongoose.Schema.Types.ObjectId, ref: "Verification", default: [] }],


    // Auth & Account Management
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    isDeleted: { type: Boolean, default: false },
    accountStatus: { type: String, enum: ["active", "deactivated", "banned"], default: "active" },
    deletedAt: { type: Date }, // soft delete

    notes: [{ type: String }]
}, { timestamps: true });


// Role-specific validations
UserSchema.pre("save", function (next) {
    if (this.role !== "customer") {
        if (!this.nationalId) throw new Error("National ID required for non-customers");
        if (!this.dateOfBirth) throw new Error("Date of birth required for non-customers");
    }
    if (["company_admin", "shop_manager", "worker"].includes(this.role)) {
        if (!this.companies || this.companies.length === 0) {
            throw new Error("At least one company required");
        }
    }
    if (["shop_manager", "worker"].includes(this.role)) {
        if (!this.shops || this.shops.length === 0) {
            throw new Error("At least one shop required");
        }
    }
    if (this.role === "worker" && !this.department) {
        throw new Error("Department required for workers");
    }
    next();
});

// Indexes
UserSchema.index({ companies: 1, role: 1 });
UserSchema.index({ companies: 1, shops: 1 });

module.exports = mongoose.model("User", UserSchema);
