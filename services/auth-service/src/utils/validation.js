const Joi = require('joi');

// Base (all roles)
const baseUserSchema = Joi.object({
    firstName: Joi.string().min(2).max(30).required().trim(),
    lastName: Joi.string().min(2).max(30).required().trim(),
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(), // Required for all (SMS/analytics)
    profilePicture: Joi.string().uri().optional(),
    password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).required(),
    googleId: Joi.string().optional(),
    gender: Joi.string().valid("male", "female", "other").optional(),
    role: Joi.string().valid("super_admin", "company_admin", "shop_manager", "worker", "customer").required(),
    permissions: Joi.array().items(Joi.string()).optional(),
    // External strings (UUID-like)
    companies: Joi.array().items(Joi.string().pattern(/^[a-z0-9-]{5,50}$/i)).optional(), // e.g., ['company-uuid-123']
    shops: Joi.array().items(Joi.string().pattern(/^[a-z0-9-]{5,50}$/i)).optional(), // e.g., ['shop-uuid-456']
    position: Joi.string().max(100).optional(),
    department: Joi.string().valid("sales", "inventory_management", "inventory_operations", "sales_manager", "development", "hr", "management", "other").optional(),
    employmentStatus: Joi.string().valid("active", "on_leave", "suspended", "terminated").default("active"),
    emergencyContact: Joi.object({
        name: Joi.string().min(2).max(50).optional(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional()
    }).optional(),
    address: Joi.object({
        street: Joi.string().max(100).optional(),
        city: Joi.string().max(50).optional(),
        state: Joi.string().max(50).optional(),
        postalCode: Joi.string().max(20).optional(),
        country: Joi.string().max(50).optional()
    }).optional(),
    notes: Joi.array().items(Joi.string()).optional(),
    preferences: Joi.object({
        theme: Joi.string().valid("light", "dark", "system").default("system"),
        language: Joi.string().default("en"),
        notifications: Joi.object({
            email: Joi.boolean().default(true),
            sms: Joi.boolean().default(false),
            inApp: Joi.boolean().default(true)
        }).optional()
    }).optional(),
    consent: Joi.object({
        termsAccepted: Joi.boolean().truthy().optional(),
        termsVersion: Joi.string().optional(),
        privacyAccepted: Joi.boolean().truthy().optional(),
        privacyVersion: Joi.string().optional(),
        nationalIdConsent: Joi.boolean().optional(),
        ip: Joi.string().ip().optional(),
        device: Joi.string().optional()
    }).optional()
});

// Register (role-conditional, strings)
const registerSchema = baseUserSchema.keys({
    dateOfBirth: Joi.date().max('now').required(), // Req for customer; optional else
    nationalId: Joi.string().pattern(/^[A-Z0-9]{5,20}$/).optional() // Req non-customer
}).custom((value, helpers) => {
    // Role-specific prompts/reqs
    if (value.role === 'customer') {
        if (!value.dateOfBirth) return helpers.error('any.required', { key: 'dateOfBirth' });
        value.companies = []; // No prompt
        value.shops = [];
        value.nationalId = undefined;
        value.department = undefined;
        value.position = undefined;
        value.emergencyContact = null;
        value.address = null;
        value.consent = null
    } else {
        // Non-customer
        if (!value.nationalId) return helpers.error('any.required', { key: 'nationalId' });
        if (!value.dateOfBirth) return helpers.error('any.required', { key: 'dateOfBirth' });

        // Initialize arrays for roles that need them
        if (value.role === 'company_admin') {
            value.companies = value.companies || []; // Allow empty array for later assignment
            value.shops = []; // No shops for company admin
        } else if (['shop_manager', 'worker'].includes(value.role)) {
            if (!value.companies?.length) return helpers.error('any.required', { key: 'companies' });
            if (!value.shops?.length) return helpers.error('any.required', { key: 'shops' });
            value.companies = value.companies.map(id => id.toString());
            value.shops = value.shops.map(id => id.toString());
        }
        if (['shop_manager', 'worker'].includes(value.role)) {
            if (!value.shops?.length) return helpers.error('any.required', { key: 'shops' });
            value.shops = value.shops.map(id => id.toString()); // Ensure strings
        }
        if (value.role === 'worker' && !value.department) {
            return helpers.error('any.required', { key: 'department' });
        }
        // Company admin: No shops req
        if (value.role === 'company_admin') value.shops = [];
    }
    // Super admin: Minimal
    if (value.role === 'super_admin') {
        value.companies = [];
        value.shops = [];
        value.department = null;
        value.position = null;
    }
    // Phone encouraged
    if (!value.phone && value.role !== 'super_admin') {
        console.warn('Phone recommended for comms/analytics');
    }
    return value;
});

// Login schema (unchanged)
const loginSchema = Joi.object({
    identifier: Joi.string().required().label('Email, Phone, or Username'),
    password: Joi.string().min(8).required(),
    otp: Joi.string().length(6).optional() // For 2FA
});

// Update profile (partial, strings)
const updateProfileSchema = baseUserSchema.keys({
    firstName: Joi.string().min(2).max(30).optional(),
    lastName: Joi.string().min(2).max(30).optional(),
    dateOfBirth: Joi.date().max('now').optional(), // Analytics update
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    // No role/password change
    companies: Joi.array().items(Joi.string().pattern(/^[a-z0-9-]{5,50}$/i)).optional(), // External updates
    shops: Joi.array().items(Joi.string().pattern(/^[a-z0-9-]{5,50}$/i)).optional(),
    preferences: Joi.object({
        theme: Joi.string().valid("light", "dark", "system").optional(),
        language: Joi.string().optional(),
        notifications: Joi.object({
            email: Joi.boolean().optional(),
            sms: Joi.boolean().optional(),
            inApp: Joi.boolean().optional()
        }).optional()
    }).optional()
}).min(1);

// Update user (admin, full, strings)
const updateUserSchema = baseUserSchema.keys({
    // All optional for partial
    email: Joi.string().email({ tlds: { allow: false } }).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    username: Joi.string().alphanum().min(3).max(30).optional(),
    nationalId: Joi.string().pattern(/^[A-Z0-9]{5,20}$/).optional(),
    companies: Joi.array().items(Joi.string().pattern(/^[a-z0-9-]{5,50}$/i)).optional(), // External sync
    shops: Joi.array().items(Joi.string().pattern(/^[a-z0-9-]{5,50}$/i)).optional(),
    // ... other fields optional
}).min(1);

// Change password (unchanged)
const changePasswordSchema = Joi.object({
    oldPassword: Joi.string().min(8).required(),
    newPassword: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).required(),
    confirmPassword: Joi.any().valid(Joi.ref('newPassword')).required()
});

// Verification (unchanged)
const verificationSchema = Joi.object({
    type: Joi.string().valid('email', 'phone', 'password_reset', '2FA_setup', 'email_change', 'otp_login').required(),
    code: Joi.string().length(6).required()
});

// Consent (unchanged)
const consentSchema = Joi.object({
    userId: Joi.string().required(), // String ID
    termsVersion: Joi.string().required(),
    privacyVersion: Joi.string().required(),
    termsAccepted: Joi.boolean().truthy().required(),
    privacyAccepted: Joi.boolean().truthy().required(),
    nationalIdConsent: Joi.boolean().optional(),
    ip: Joi.string().ip().optional(),
    device: Joi.string().optional()
});

// 2FA (unchanged)
const twoFASchema = Joi.object({
    otp: Joi.string().length(6).required()
});

// Bulk update (unchanged)
const bulkUpdateSchema = Joi.object({
    userIds: Joi.array().items(Joi.string()).min(1).required(), // String IDs
    action: Joi.string().valid('activate', 'deactivate', 'ban').required()
});

module.exports = {
    registerSchema,
    loginSchema,
    updateProfileSchema,
    updateUserSchema,
    changePasswordSchema,
    verificationSchema,
    consentSchema,
    twoFASchema,
    bulkUpdateSchema
};