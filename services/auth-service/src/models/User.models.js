const mongoose = require("mongoose");
const { hashPassword } = require('../utils/hashPassword');

const UserSchema = new mongoose.Schema({
    // Core Personal (all roles)
    firstName: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    lastName: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    username: { type: String, unique: true, sparse: true, trim: true, minlength: 3, maxlength: 30 }, // Optional for social-only, but req for email/phone login
    email: { type: String, unique: true, lowercase: true, sparse: true },
    phone: { type: String, unique: true, sparse: true, match: /^\+?[1-9]\d{1,14}$/ }, // E.164 for all (SMS/analytics)
    profilePicture: { type: String, default: null },
    password: { type: String, select: false, required: function () { return !this.googleId; } }, // Optional if social
    googleId: { type: String, sparse: true },

    // Analytics/Compliance (DOB req for customer; optional else)
    dateOfBirth: {
        type: Date,
        required: function () {
            return this.role === 'customer' && !this.googleId;  // Not required for Google OAuth users initially
        }
    },
    gender: { type: String, enum: ["male", "female", "other"], default: "other" },

    // Verification (all)
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    twoFAEnabled: { type: Boolean, default: false },
    twoFASecret: { type: String, select: false },

    // Identity/HR (non-customer only)
    nationalId: { type: String, unique: true, sparse: true, match: /^[A-Z0-9]{5,20}$/, required: function () { return this.role !== 'customer'; } },

    // Role & Permissions (all)
    role: {
        type: String,
        enum: ["super_admin", "company_admin", "shop_manager", "worker", "customer"],
        required: true
    },
    permissions: [{ type: String }], // Granular (e.g., 'create_shop')

    // Multi-Tenancy (strings from external services; conditional)
    companies: [{ type: String, default: [] }], // e.g., ['company-uuid-123'] – updated via events
    shops: [{ type: String, default: [] }], // e.g., ['shop-uuid-456'] – updated via events

    // Work Details (non-customer only)
    position: { type: String, default: null, required: function () { return this.role !== 'customer' && this.role !== 'super_admin'; } }, // e.g., 'Admin', 'Manager', 'Sales Rep'
    department: {
        type: String,
        enum: [
            "sales", "inventory_management", "inventory_operations",
            "sales_manager", "development", "hr", "management", "other"
        ],
        default: null,
        required: function () { return ['worker', 'shop_manager'].includes(this.role); } // Specific for them
    },
    dateJoined: { type: Date, default: Date.now },
    employmentStatus: { type: String, enum: ["active", "on_leave", "suspended", "terminated"], default: "active" },

    // HR/Compliance (non-customer)
    emergencyContact: {
        name: { type: String, required: function () { return this.role !== 'customer'; } },
        phone: { type: String, required: function () { return this.role !== 'customer'; }, match: /^\+?[1-9]\d{1,14}$/ }
    },
    address: {
        street: { type: String, required: function () { return this.role !== 'customer'; } },
        city: String,
        state: String,
        postalCode: String,
        country: { type: String, required: function () { return this.role !== 'customer'; } }
    },

    // References (all)
    preferences: { type: mongoose.Schema.Types.ObjectId, ref: "Preference", default: null },
    loginHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "LoginHistory", default: [] }],
    sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Session", default: [] }],
    consent: [{ type: mongoose.Schema.Types.ObjectId, ref: "Consent", default: null }],
    verificationTokens: [{ type: mongoose.Schema.Types.ObjectId, ref: "Verification", default: [] }],

    // Auth Mgmt (all)
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    isDeleted: { type: Boolean, default: false },
    accountStatus: { type: String, enum: ["active", "deactivated", "banned"], default: "active" },
    deletedAt: { type: Date },
    notes: [{ type: String }]

}, { timestamps: true });

// Pre-save: Deep role enforcement + hash
UserSchema.pre("save", async function (next) {
    // Only hash password if it's not already hashed
    if (this.isModified('password') && this.password && !this.password.startsWith('$2b$')) {
        this.password = await hashPassword(this.password);
    }

    // Role-specific defaults & validation
    switch (this.role) {
        case 'customer':
            this.companies = [];
            this.shops = [];
            this.nationalId = undefined;
            this.emergencyContact = null;
            this.address = null;
            this.department = null;
            this.position = null;
            if (!this.dateOfBirth && !this.googleId) return next(new Error("Date of birth required for customers (analytics)"));
            break;
        case 'super_admin':
            this.companies = [];
            this.shops = [];
            this.department = null;
            this.position = null;
            // DOB/phone optional
            break;
        case 'company_admin':
            // Companies can be empty strings array—external service assigns later
            if (!this.companies) this.companies = [];
            this.shops = [];
            this.department = this.department || 'management';
            this.position = this.position || 'Admin';
            if (!this.nationalId) return next(new Error("National ID required"));
            if (!this.dateOfBirth) return next(new Error("Date of birth required"));
            break;
        case 'shop_manager':
            if (!this.companies || this.companies.length === 0) return next(new Error("At least one company required"));
            if (!this.shops || this.shops.length === 0) return next(new Error("At least one shop required"));
            this.department = this.department || 'sales_manager';
            this.position = this.position || 'Manager';
            if (!this.nationalId) return next(new Error("National ID required"));
            if (!this.dateOfBirth) return next(new Error("Date of birth required"));
            break;
        case 'worker':
            if (!this.companies || this.companies.length === 0) return next(new Error("At least one company required"));
            if (!this.shops || this.shops.length === 0) return next(new Error("At least one shop required"));
            if (!this.department) return next(new Error("Department required"));
            this.position = this.position || 'Worker';
            if (!this.nationalId) return next(new Error("National ID required"));
            if (!this.dateOfBirth) return next(new Error("Date of birth required"));
            break;
        default:
            return next(new Error("Invalid role"));
    }

    // Validate string IDs (UUID-like for external)
    if (this.companies && !this.companies.every(id => typeof id === 'string' && /^[a-z0-9-]{5,50}$/i.test(id))) {
        return next(new Error("Invalid company IDs: must be strings"));
    }
    if (this.shops && !this.shops.every(id => typeof id === 'string' && /^[a-z0-9-]{5,50}$/i.test(id))) {
        return next(new Error("Invalid shop IDs: must be strings"));
    }

    // Phone fallback for all (analytics/comms)
    if (!this.phone && this.role !== 'super_admin') {
        console.warn(`Phone recommended for ${this.role} users`);
    }

    next();
});

// Indexes (analytics + perf, strings for companies/shops)
UserSchema.index({ role: 1, dateOfBirth: 1 }); // Analytics queries
UserSchema.index({ companies: 1, shops: 1, role: 1 }); // Org queries (string $in works)
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ accountStatus: 1, role: 1 });

module.exports = mongoose.model("User", UserSchema);