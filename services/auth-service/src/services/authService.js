const User = require('../models/User.models');
const speakeasy = require('speakeasy');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const Joi = require('joi');

const registerSchema = Joi.object({
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required(),
    username: Joi.string().min(3).max(30).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^[0-9]{10,15}$/).optional(),
    profilePicture: Joi.string().uri().optional(),
    password: Joi.string().min(8).required(),
    role: Joi.string().valid('super_admin', 'company_admin', 'shop_manager', 'worker', 'customer').required(),
    nationalId: Joi.string().optional(),
    dateOfBirth: Joi.date().optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    companyId: Joi.string().optional(),
    shopId: Joi.string().optional(),
    position: Joi.string().optional().allow(null, ''),
    department: Joi.string().optional().allow(null, ''),
    dateJoined: Joi.date().optional(),
    employmentStatus: Joi.string().valid('active', 'inactive', 'suspended', 'terminated').default('active'),
    emergencyContact: Joi.object({
        name: Joi.string().optional(),
        phone: Joi.string().pattern(/^[0-9]{10,15}$/).optional()
    }).optional(),
    address: Joi.object({
        street: Joi.string().optional(),
        city: Joi.string().optional(),
        state: Joi.string().optional(),
        postalCode: Joi.string().optional(),
        country: Joi.string().optional()
    }).optional(),
    preferences: Joi.object({
        theme: Joi.string().valid('light', 'dark', 'system').optional(),
        language: Joi.string().optional(),
        notifications: Joi.object({
            email: Joi.boolean().optional(),
            smsEnabled: Joi.boolean().optional(),
            inApp: Joi.boolean().optional()
        }).optional()
    }).optional(),
    consent: Joi.object({
        termsAccepted: Joi.boolean().required().valid(true).error(new Error('"termsAccepted" must be true')),
        termsVersion: Joi.string().required(),
        termsAcceptedAt: Joi.date().optional(),
        privacyAccepted: Joi.boolean().required().valid(true).error(new Error('"privacyAccepted" must be true')),
        privacyVersion: Joi.string().required(),
        privacyAcceptedAt: Joi.date().optional(),
        fingerprintConsent: Joi.boolean().optional(),
        nationalIdConsent: Joi.boolean().optional(),
        ip: Joi.string().ip().optional(),
        device: Joi.string().optional()
    }).required(),
    fingerprints: Joi.array().items(Joi.object({
        deviceId: Joi.string().required(),
        template: Joi.binary().required()
    })).optional().when('role', {
        is: Joi.string().valid('super_admin', 'company_admin', 'shop_manager', 'worker'),
        then: Joi.array().min(0).optional(),
        otherwise: Joi.forbidden().error(new Error('Fingerprints only allowed for employees/admins'))
    })
}).xor('email', 'phone', 'username')
    .custom((value, helpers) => {
        if (['worker', 'shop_manager'].includes(value.role) && !value.companyId) {
            return helpers.error('any.required', { key: 'companyId' });
        }
        if (value.preferences?.notifications?.smsEnabled && !value.phone) {
            return helpers.error('any.required', { key: 'phone' });
        }
        return value;
    });

const loginSchema = Joi.object({
    identifier: Joi.string().optional(),
    password: Joi.string().optional().min(8),
    companyAdminPhone: Joi.string().pattern(/^[0-9]{10,15}$/).optional(),
    fingerprint: Joi.object({
        deviceId: Joi.string().required(),
        template: Joi.binary().required()
    }).optional()
}).xor('identifier', 'fingerprint')
    .custom((value, helpers) => {
        if (value.identifier && !value.password) {
            return helpers.error('any.required', { key: 'password' });
        }
        if (value.companyAdminPhone && !/^[0-9]{10,15}$/.test(value.companyAdminPhone)) {
            return helpers.error('any.invalid', { key: 'companyAdminPhone' });
        }
        return value;
    });

exports.register = async (data) => {
    const { error } = registerSchema.validate(data, { allowUnknown: true });
    if (error) throw new Error(error.details[0].message);

    const { email, phone, username, password, role, companyId, shopId, fingerprints, preferences } = data;
    const existingUser = await User.findOne({ $or: [{ email }, { phone }, { username }] });
    if (existingUser) throw new Error('User already exists');

    const twoFASecret = speakeasy.generateSecret({ length: 20 });
    const passwordHash = await hashPassword(password);
    const userData = { ...data, passwordHash, twoFASecret: twoFASecret.base32 };
    if (preferences && !preferences.notifications) {
        userData.preferences = { notifications: { email: true, smsEnabled: false, inApp: true } };
    }
    const user = await User.create(userData);
    return user;
};


exports.login = async (credentials) => {
    const { error } = loginSchema.validate(credentials);
    if (error) throw new Error(error.details[0].message);

    const { identifier, password, companyAdminPhone, fingerprint } = credentials;

    let user;
    if (fingerprint) {
        user = await User.findOne({
            fingerprints: { $elemMatch: { deviceId: fingerprint.deviceId, template: fingerprint.template } }
        }).select('+passwordHash');
        if (!user) throw new Error('Invalid fingerprint');
    } else {
        user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }, { phone: identifier }]
        }).select('+passwordHash');
        if (!user) throw new Error('User not found');
        if (!(await comparePassword(password, user.passwordHash))) throw new Error('Invalid password');
    }

    if (['shop_manager', 'worker'].includes(user.role) && !fingerprint) {
        if (!companyAdminPhone) throw new Error('Company admin phone number is required for workers');
        const admin = await User.findOne({ phone: companyAdminPhone, role: { $in: ['company_admin', 'super_admin'] } });
        if (!admin) throw new Error('Invalid company admin phone number');
        if (!admin.companyId || user.companyId !== admin.companyId) {
            throw new Error('User does not belong to the specified company');
        }
    }

    // Update login history and last login
    user.loginHistory.push({
        timestamp: new Date(),
        method: fingerprint ? 'fingerprint' : 'password',
        successful: true
    });
    user.lastLoginAt = new Date();
    await user.save();

    // publishEvent('user.logged_in', { userId: user._id, method: fingerprint ? 'fingerprint' : 'password', companyId: user.companyId });
    return user;
};