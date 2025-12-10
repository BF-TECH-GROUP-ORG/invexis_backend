const mongoose = require("mongoose");
const { hashPassword } = require('../utils/hashPassword');

const UserSchema = new mongoose.Schema({
    // Core Personal (all roles)
    firstName: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    lastName: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    username: { type: String, sparse: true, trim: true, minlength: 3, maxlength: 30 }, // Optional for social-only, but req for email/phone login
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

    // Push Notifications (all)
    fcmToken: { type: String, default: null }, // Firebase Cloud Messaging token for push notifications

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
    companies: [{ type: String, trim: true, default: [] }], // e.g., ['company-uuid-123'] – updated via events
    shops: [{ type: String, trim: true, default: [] }], // e.g., ['shop-uuid-456'] – updated via events

    // Work Details (non-customer only)

    assignedDepartments: [{ type: String, trim: true, default: [] }], // e.g., ['dept-uuid-789'] – updated via events
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
    // Auto-generate username from first and last name when not provided
    try {
        if ((!this.username || this.username.trim() === '') && this.firstName && this.lastName) {
            const sanitize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
            let base = `${sanitize(this.firstName)} ${sanitize(this.lastName)}`.slice(0, 30);
            // Ensure there's no leading/trailing spaces
            base = base.replace(/(^ | $)/g, '') || 'user';

            const Model = this.constructor;
            // Find existing usernames that start with the base (case-insensitive)
            const existing = await Model.find({ username: { $regex: `^${base}(?:\\d+)?$`, $options: 'i' } }).select('username').lean();

            if (!existing || existing.length === 0) {
                this.username = base;
            } else {
                // Compute numeric suffixes and pick next
                const suffixes = existing.map(e => {
                    const m = String(e.username).match(new RegExp(`^${base}(\\d+)$`, 'i'));
                    return m ? parseInt(m[1], 10) : 0;
                });
                const max = suffixes.length ? Math.max(...suffixes) : 0;
                this.username = `${base}${max + 1}`;
            }
        }
    } catch (err) {
        return next(err);
    }
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
            this.assignedDepartments = [];
            if (!this.dateOfBirth && !this.googleId) return next(new Error("Date of birth required for customers (analytics)"));
            break;
        case 'super_admin':
            this.companies = [];
            this.shops = [];
            this.assignedDepartments = [];
            // DOB/phone optional
            break;
        case 'company_admin':
            // Companies can be empty strings array—external service assigns later
            if (!this.companies) this.companies = [];
            this.shops = [];
            this.assignedDepartments = [];
            if (!this.nationalId) return next(new Error("National ID required"));
            if (!this.dateOfBirth) return next(new Error("Date of birth required"));
            break;
        case 'shop_manager':
            if (!this.companies || this.companies.length === 0) return next(new Error("At least one company required"));
            if (!this.shops || this.shops.length === 0) return next(new Error("At least one shop required"));
            // assignedDepartments optional for shop_manager
            if (!this.nationalId) return next(new Error("National ID required"));
            if (!this.dateOfBirth) return next(new Error("Date of birth required"));
            break;
        case 'worker':
            if (!this.companies || this.companies.length === 0) return next(new Error("At least one company required"));
            if (!this.shops || this.shops.length === 0) return next(new Error("At least one shop required"));
            // assignedDepartments optional for worker
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
UserSchema.index({ accountStatus: 1, role: 1 });
UserSchema.index({ email: 1 }); // Login lookups
UserSchema.index({ phone: 1 }); // Communication lookups
UserSchema.index({ companies: 1 }); // Worker filtering by company
UserSchema.index({ isDeleted: 1 }); // Soft-delete filtering
UserSchema.index({ role: 1, accountStatus: 1 }); // Admin filtering
UserSchema.index({ companies: 1, isDeleted: 1 }); // Company workers query
UserSchema.index({ shops: 1 }); // Shop manager filtering

module.exports = mongoose.model("User", UserSchema);