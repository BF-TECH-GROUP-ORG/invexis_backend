const redis = require('redis');
const joi = require('joi');
const speakeasy = require('speakeasy');
const crypto = require('crypto');
// const amqp = require('amqplib');

const User = require('../models/User.models');
const Session = require('../models/Session.models');
const Consent = require('../models/Consent.models');
const Verification = require('../models/Verification.models');
const LoginHistory = require('../models/LoginHistory.models');
const Preference = require('../models/Preference.models');
const { hashPassword, comparePassword, hashToken } = require('../utils/hashPassword');
const tokenService = require('./tokenService');

// Redis client
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.connect().catch(err => console.error('Redis connection error:', err));

// // RabbitMQ setup
// let rabbitMQChannel;
// async function setupRabbitMQ() {
//     try {
//         const conn = await amqp.connect(process.env.RABBITMQ_URI);
//         rabbitMQChannel = await conn.createChannel();
//         await rabbitMQChannel.assertQueue('auth.events', { durable: true });
//     } catch (err) {
//         console.error('RabbitMQ connection error:', err);
//     }
// }
// setupRabbitMQ();

// async function publishEvent(event, data) {
//     if (rabbitMQChannel) {
//         rabbitMQChannel.sendToQueue('auth.events', Buffer.from(JSON.stringify({ event, data })));
//     }
// }

// Custom error for auth
class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

// === Joi Schemas ===
const registerSchema = joi.object({
    firstName: joi.string().min(2).max(30).required(),
    lastName: joi.string().min(2).max(30).required(),
    username: joi.string().alphanum().min(3).max(30).required(),
    email: joi.string().email().optional(),
    phone: joi.string().optional(),
    profilePicture: joi.string().optional(),
    password: joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).required(),
    role: joi.string().valid("super_admin", "company_admin", "shop_manager", "worker", "customer").required(),
    nationalId: joi.string().alphanum().min(5).max(20).optional(),
    dateOfBirth: joi.date().less('now').optional(),
    gender: joi.string().valid("male", "female", "other").optional(),
    companies: joi.array().items(joi.string()).optional(),  // Changed to array
    shops: joi.array().items(joi.string()).optional(),    // Changed to array
    position: joi.string().optional().allow(null, ''),
    department: joi.string().valid("sales", "inventory_management", "inventory_operations", "sales_manager", "development", "hr", "management", "other").optional().allow(null, ''),
    employmentStatus: joi.string().valid("active", "on_leave", "suspended", "terminated").optional(),
    emergencyContact: joi.object({
        name: joi.string().min(2).max(50).required(),
        phone: joi.string().required()
    }).optional(),
    address: joi.object({
        street: joi.string().max(100).optional().allow(null, ''),
        city: joi.string().max(50).optional().allow(null, ''),
        state: joi.string().max(50).optional().allow(null, ''),
        postalCode: joi.string().max(20).optional().allow(null, ''),
        country: joi.string().max(50).optional().allow(null, '')
    }),
    preferences: joi.object({
        theme: joi.string().valid("light", "dark", "system").optional(),
        language: joi.string().optional(),
        notifications: joi.object({
            email: joi.boolean().optional(),
            sms: joi.boolean().optional(),
            inApp: joi.boolean().optional()
        })
    }).optional(),
    consent: joi.object({
        termsAccepted: joi.boolean().required().valid(true),
        termsVersion: joi.string().required(),
        privacyAccepted: joi.boolean().required().valid(true),
        privacyVersion: joi.string().required(),
        nationalIdConsent: joi.boolean().optional(),
        ip: joi.string().ip().optional(),
        device: joi.string().optional()
    }).optional()
}).xor('email', 'phone', 'username').custom((value, helpers) => {
    if (value.role !== 'customer') {
        if (!value.nationalId) return helpers.error('any.required', { key: 'nationalId' });
        if (!value.dateOfBirth) return helpers.error('any.required', { key: 'dateOfBirth' });
    }
    if (['company_admin', 'shop_manager', 'worker'].includes(value.role)) {
        if (!value.companies || value.companies.length === 0) return helpers.error('any.required', { key: 'companies' });
    }
    if (['shop_manager', 'worker'].includes(value.role)) {
        if (!value.shops || value.shops.length === 0) return helpers.error('any.required', { key: 'shops' });
    }
    if (value.role === 'worker' && !value.department) {
        return helpers.error('any.required', { key: 'department' });
    }
    if (value.preferences?.notifications?.sms && !value.phone) {
        return helpers.error('any.required', { key: 'phone' });
    }
    return value;
});

const loginSchema = joi.object({
    identifier: joi.string().required(),
    password: joi.string().min(8).required(),
    otp: joi.string().optional()
});

const verificationSchema = joi.object({
    type: joi.string().valid('email', 'phone').required(),
    code: joi.string().length(6).required(),
});

const changeEmailSchema = joi.object({
    newEmail: joi.string().email().required(),
});

const passwordResetSchema = joi.object({
    emailOrPhone: joi.string().required(),
});

const passwordChangeSchema = joi.object({
    oldPassword: joi.string().required(),
    newPassword: joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).required(),
});

const otpLoginSchema = joi.object({
    identifier: joi.string().required(),
});

const otpVerifySchema = joi.object({
    identifier: joi.string().required(),
    code: joi.string().length(6).required(),
});

const revokeConsentSchema = joi.object({
    type: joi.string().valid('terms_and_privacy_sbapshop').required(),
});

const bulkUpdateSchema = joi.object({
    userIds: joi.array().items(joi.string()).required(),
    action: joi.string().valid('activate', 'deactivate').required(),
});

const complianceSchema = joi.object({
    termsVersion: joi.string().required(),
    privacyVersion: joi.string().required(),
});

const updateUserSchema = joi.object({
    firstName: joi.string().min(2).max(30).optional(),
    lastName: joi.string().min(2).max(30).optional(),
    username: joi.string().alphanum().min(3).max(30).optional(),
    email: joi.string().email().optional(),
    phone: joi.string().pattern(/^\+\d{10,15}$/).optional(),
    role: joi.string().valid("super_admin", "company_admin", "shop_manager", "worker", "customer").optional(),
    nationalId: joi.string().alphanum().min(5).max(20).optional(),
    dateOfBirth: joi.date().less('now').optional(),
    gender: joi.string().valid("male", "female", "other").optional(),
    companies: joi.array().items(joi.string()).optional(),  // Changed to array
    shops: joi.array().items(joi.string()).optional(),    // Changed to array
    position: joi.string().optional().allow(null, ''),
    department: joi.string().valid("sales", "inventory_management", "inventory_operations", "sales_manager", "development", "hr", "management", "other").optional().allow(null, ''),
    employmentStatus: joi.string().valid("active", "on_leave", "suspended", "terminated").optional(),
    accountStatus: joi.string().valid("active", "deactivated", "banned").optional(),
    address: joi.object({
        street: joi.string().max(100).optional().allow(null, ''),
        city: joi.string().max(50).optional().allow(null, ''),
        state: joi.string().max(50).optional().allow(null, ''),
        postalCode: joi.string().max(20).optional().allow(null, ''),
        country: joi.string().max(50).optional().allow(null, '')
    }).optional()
}).custom((value, helpers) => {
    if (value.role && value.role !== 'customer') {
        if (value.nationalId === undefined || value.nationalId === null) return helpers.error('any.required', { key: 'nationalId (required for non-customers)' });
        if (value.dateOfBirth === undefined || value.dateOfBirth === null) return helpers.error('any.required', { key: 'dateOfBirth (required for non-customers)' });
    }
    if (value.role && ['company_admin', 'shop_manager', 'worker'].includes(value.role)) {
        if (value.companies && value.companies.length === 0) return helpers.error('any.required', { key: 'companies' });
    }
    if (value.role && ['shop_manager', 'worker'].includes(value.role)) {
        if (value.shops && value.shops.length === 0) return helpers.error('any.required', { key: 'shops' });
    }
    if (value.role === 'worker' && value.department === undefined) {
        return helpers.error('any.required', { key: 'department' });
    }
    return value;
});

// Generate numeric code
function generateNumericCode(digits = 6) {
    const min = 10 ** (digits - 1);
    const max = 10 ** digits - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

// Redis rate limit helpers
async function checkRateLimit(userId) {
    const rateLimitKey = `rate_limit:${userId}`;
    const lockoutKey = `lockout:${userId}`;
    const pipeline = redisClient.multi();
    pipeline.get(lockoutKey);
    pipeline.get(rateLimitKey);
    const [[, lockout], [, attempts]] = await pipeline.exec();
    if (lockout) {
        // await publishEvent('login.locked', { userId });
        throw new AuthError('Too many attempts. Try again later.', 429);
    }
    const count = parseInt(attempts || '0');
    if (count >= 5) {
        await redisClient.set(lockoutKey, 'locked', { EX: 5 * 60 });
        // await publishEvent('login.locked', { userId });
        throw new AuthError('Too many failed attempts. Account locked temporarily.', 429);
    }
    return count;
}

async function incrementRateLimit(userId) {
    const rateLimitKey = `rate_limit:${userId}`;
    await redisClient.incr(rateLimitKey);
    await redisClient.expire(rateLimitKey, 5 * 60);
}

async function resetRateLimit(userId) {
    const rateLimitKey = `rate_limit:${userId}`;
    const lockoutKey = `lockout:${userId}`;
    const pipeline = redisClient.multi();
    pipeline.del(rateLimitKey);
    pipeline.del(lockoutKey);
    await pipeline.exec();
}

async function register(data, options = {}) {
    const { ip, device, location, sendVerification = true } = options;
    const { error, value } = registerSchema.validate(data);
    if (error) throw new AuthError(`Validation error: ${error.details.map(x => x.message).join(', ')}`);

    const or = [];
    if (value.email) or.push({ email: value.email });
    if (value.phone) or.push({ phone: value.phone });
    if (value.username) or.push({ username: value.username });
    if (value.nationalId) or.push({ nationalId: value.nationalId });

    if (or.length) {
        const exists = await User.findOne({ $or: or });
        if (exists) throw new AuthError('User with provided email, phone, username, or national ID already exists', 409);
    }

    const hashedPassword = await hashPassword(value.password);

    const user = new User({
        firstName: value.firstName,
        lastName: value.lastName,
        username: value.username,
        email: value.email,
        phone: value.phone,
        profilePicture: value.profilePicture || null,
        password: hashedPassword,
        role: value.role,
        nationalId: value.nationalId,
        dateOfBirth: value.dateOfBirth,
        gender: value.gender,
        companyId: value.companyId || [],
        shopId: value.shopId || [],
        position: value.position,
        department: value.department,
        employmentStatus: value.employmentStatus || 'active',
        emergencyContact: value.emergencyContact,
        address: value.address,
        loginHistory: [],
        sessions: [],
        verificationTokens: [],
        consent: null,
        preferences: null,
        lastLoginAt: null,
        failedLoginAttempts: 0,
        lockUntil: null,
        accountStatus: 'active',
        dateJoined: new Date()
    });
    await user.save();

    const preference = new Preference({
        userId: user._id,
        theme: value.preferences?.theme || 'system',
        language: value.preferences?.language || 'en',
        notifications: value.preferences?.notifications || { email: true, sms: false, inApp: true }
    });
    await preference.save();
    user.preferences = preference._id;
    await user.save();

    const doc = JSON.stringify({
        termsVersion: value.consent.termsVersion,
        privacyVersion: value.consent.privacyVersion,
        consentGiven: {
            termsAccepted: !!value.consent.termsAccepted,
            privacyAccepted: !!value.consent.privacyAccepted,
            nationalIdConsent: !!value.consent.nationalIdConsent
        }
    });
    const documentHash = crypto.createHash('sha256').update(doc).digest('hex');
    const consent = new Consent({
        userId: user._id,
        type: 'terms_and_privacy_sbapshop',
        version: value.consent.termsVersion + '|' + value.consent.privacyVersion,
        document: doc,
        documentHash,
        acceptedAt: new Date(),
        ip: value.consent.ip || ip,
        device: value.consent.device || device,
        location
    });
    await consent.save();
    user.consent = consent._id;
    await user.save();

    const verifications = [];
    if (value.email) {
        const code = generateNumericCode(6);
        const verification = new Verification({ userId: user._id, type: 'email', code });
        await verification.save();
        verifications.push(verification);
        user.verificationTokens.push(verification._id);
    }
    if (value.phone) {
        const code = generateNumericCode(6);
        const verification = new Verification({ userId: user._id, type: 'phone', code });
        await verification.save();
        verifications.push(verification);
        user.verificationTokens.push(verification._id);
    }
    await user.save();

    if (sendVerification && verifications.length) {
        for (const v of verifications) {
            await publishEvent('verification.code.generated', { userId: user._id, type: v.type, code: v.code });
            console.log('something')
        }
    }

    const loginHistory = new LoginHistory({
        userId: user._id,
        ip,
        device,
        location,
        method: 'password',
        successful: true
    });
    await loginHistory.save();
    user.loginHistory.push(loginHistory._id);
    await user.save();

    await publishEvent('user.registered', { userId: user._id, email: user.email, phone: user.phone, username: user.username });
    return { user, verificationTokens: process.env.NODE_ENV !== 'production' ? verifications : [] };
}

async function login(credentials, options = {}) {
    const { ip, device, location } = options;
    const { error, value } = loginSchema.validate(credentials);
    if (error) throw new AuthError(error.details[0].message);

    const { identifier, password, otp } = value;
    const or = [{ email: identifier }, { phone: identifier }, { username: identifier }, { nationalId: identifier }];

    const user = await User.findOne({ $or: or }).select('+password +twoFASecret');
    if (!user || user.accountStatus !== 'active') {
        await publishEvent('login.failed', { identifier, ip, device, method: 'password' });
        throw new AuthError('User not found or inactive', 401);
    }

    const attempts = await checkRateLimit(user._id.toString());
    let authenticated = false;
    let loginMethod = 'password';
    if (password) {
        authenticated = await comparePassword(password, user.password);
    }

    if (!authenticated) {
        await incrementRateLimit(user._id.toString());
        const loginHistory = new LoginHistory({
            userId: user._id,
            ip,
            device,
            location,
            method: loginMethod,
            successful: false
        });
        await loginHistory.save();
        user.loginHistory.push(loginHistory._id);
        await user.save();
        await publishEvent('login.failed', { userId: user._id, ip, device, method: loginMethod });
        throw new AuthError('Invalid credentials', 401);
    }

    if (user.twoFAEnabled && !otp) {
        throw new AuthError('2FA code required', 401);
    }
    if (user.twoFAEnabled && otp) {
        const ok = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: otp, window: 1 });
        if (!ok) {
            await incrementRateLimit(user._id.toString());
            const loginHistory = new LoginHistory({
                userId: user._id,
                ip,
                device,
                location,
                method: '2FA',
                successful: false
            });
            await loginHistory.save();
            user.loginHistory.push(loginHistory._id);
            await user.save();
            await publishEvent('2fa.failed', { userId: user._id, ip, device });
            throw new AuthError('Invalid 2FA code', 401);
        }
        loginMethod = '2FA';
    }

    await resetRateLimit(user._id.toString());
    user.lastLoginAt = new Date();
    await user.save();

    const { refreshToken, session } = await tokenService.createSession(user._id, device, ip, location);
    user.sessions.push(session._id);
    await user.save();

    const loginHistory = new LoginHistory({
        userId: user._id,
        ip,
        device,
        location,
        method: loginMethod,
        successful: true
    });
    await loginHistory.save();
    user.loginHistory.push(loginHistory._id);
    await user.save();

    await publishEvent('login.success', { userId: user._id, ip, device, method: loginMethod });
    return { accessToken: tokenService.signAccess({ sub: user._id.toString() }), refreshToken, user: user.toJSON() };
}

async function requestOtpLogin(identifier, options = {}) {
    const { ip, device, location } = options;
    const { error } = otpLoginSchema.validate({ identifier });
    if (error) throw new AuthError(error.details[0].message);

    const or = [{ email: identifier }, { phone: identifier }];
    const user = await User.findOne({ $or }).select('+accountStatus');
    if (!user || user.accountStatus !== 'active') {
        await publishEvent('otp_login.requested.invalid', { identifier, ip, device });
        throw new AuthError('User not found or inactive', 404);
    }

    const code = generateNumericCode(6);
    const verification = new Verification({ userId: user._id, type: 'otp_login', code });
    await verification.save();
    user.verificationTokens.push(verification._id);
    await user.save();

    await publishEvent('otp_login.requested', { userId: user._id, identifier, code });
    return { message: 'OTP sent' };
}

async function verifyOtpLogin(identifier, code, options = {}) {
    const { ip, device, location } = options;
    const { error } = otpVerifySchema.validate({ identifier, code });
    if (error) throw new AuthError(error.details[0].message);

    const or = [{ email: identifier }, { phone: identifier }];
    const user = await User.findOne({ $or }).select('+accountStatus');
    if (!user || user.accountStatus !== 'active') throw new AuthError('User not found or inactive', 404);

    const v = await Verification.findOne({ userId: user._id, type: 'otp_login', code, used: false });
    if (!v || v.expiresAt < new Date()) {
        await publishEvent('otp_login.failed', { userId: user._id, ip, device });
        throw new AuthError('Invalid or expired OTP', 400);
    }
    v.used = true;
    await v.save();

    await resetRateLimit(user._id.toString());
    user.lastLoginAt = new Date();
    await user.save();

    const { refreshToken, session } = await tokenService.createSession(user._id, device, ip, location);
    user.sessions.push(session._id);
    await user.save();

    const loginHistory = new LoginHistory({ userId: user._id, ip, device, location, method: 'otp_login', successful: true });
    await loginHistory.save();
    user.loginHistory.push(loginHistory._id);
    await user.save();

    await publishEvent('login.success', { userId: user._id, ip, device, method: 'otp_login' });
    return { accessToken: tokenService.signAccess({ sub: user._id.toString() }), refreshToken, user: user.toJSON() };
}

async function refresh(refreshToken) {
    const tokens = await tokenService.refreshTokens(refreshToken);
    await publishEvent('token.refreshed', { sessionId: tokens.sessionId, userId: tokens.userId });
    return tokens;
}

async function logout(userId, refreshToken) {
    await tokenService.revokeSessionByRefresh(refreshToken);
    if (userId) {
        await publishEvent('logout.success', { userId });
    }
    return true;
}

async function verify(userId, payload) {
    const { error, value } = verificationSchema.validate(payload);
    if (error) throw new AuthError(error.details[0].message);

    const { type, code } = value;
    const token = await Verification.findOne({ userId, type, code, used: false });
    if (!token || token.expiresAt < new Date()) throw new AuthError('Invalid or expired code', 400);
    token.used = true;
    await token.save();

    const user = await User.findById(userId);
    if (!user) throw new AuthError('User not found', 404);
    if (type === 'email') user.isEmailVerified = true;
    if (type === 'phone') user.isPhoneVerified = true;
    await user.save();
    await publishEvent('verification.success', { userId, type });
    return { verified: type, user: user.toJSON() };
}

async function setup2FA(userId) {
    const user = await User.findById(userId).select('+twoFASecret');
    if (!user) throw new AuthError('User not found', 404);
    if (user.twoFAEnabled) throw new AuthError('2FA already enabled', 400);

    const secret = speakeasy.generateSecret({ length: 20 });
    const code = generateNumericCode(6);
    const verification = new Verification({ userId, type: '2FA_setup', code });
    await verification.save();
    user.verificationTokens.push(verification._id);
    user.twoFASecret = secret.base32;
    await user.save();

    await publishEvent('2fa.setup.initiated', { userId, code });
    return { secret: secret.base32, otpauth_url: secret.otpauth_url };
}

async function verify2FASetup(userId, otp) {
    const user = await User.findById(userId).select('+twoFASecret');
    if (!user) throw new AuthError('User not found', 404);
    const token = await Verification.findOne({ userId, type: '2FA_setup', used: false });
    if (!token || token.expiresAt < new Date()) throw new AuthError('Invalid or expired 2FA setup token', 400);

    if (token.code === otp || speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: otp, window: 1 })) {
        token.used = true;
        await token.save();
        user.twoFAEnabled = true;
        await user.save();
        // await publishEvent('2fa.enabled', { userId });
        return { message: '2FA enabled' };
    }
    await publishEvent('2fa.setup.failed', { userId });
    throw new AuthError('Invalid 2FA code', 400);
}

async function disable2FA(userId, password) {
    const user = await User.findById(userId).select('+password +twoFASecret');
    if (!user.twoFAEnabled) throw new AuthError('2FA not enabled', 400);
    if (!(await comparePassword(password, user.password))) throw new AuthError('Invalid password', 401);

    user.twoFASecret = null;
    user.twoFAEnabled = false;
    await user.save();
    await publishEvent('2fa.disabled', { userId });
    return { message: '2FA disabled' };
}

async function changeEmail(userId, data, options = {}) {
    const { error, value } = changeEmailSchema.validate(data);
    if (error) throw new AuthError(error.details[0].message);

    const user = await User.findById(userId);
    if (user.email === value.newEmail) throw new AuthError('Email unchanged', 400);

    const exists = await User.findOne({ email: value.newEmail });
    if (exists) throw new AuthError('Email already in use', 409);

    const code = generateNumericCode(6);
    const verification = new Verification({ userId, type: 'email_change', code, meta: { newEmail: value.newEmail } });
    await verification.save();
    user.verificationTokens.push(verification._id);
    await user.save();

    await publishEvent('email.change.requested', { userId, newEmail: value.newEmail, code });
    return { message: 'Verification code sent to new email' };
}

async function confirmChangeEmail(userId, payload) {
    const { error, value } = verificationSchema.validate(payload);
    if (error) throw new AuthError(error.details[0].message);

    const { code } = value;
    const token = await Verification.findOne({ userId, type: 'email_change', code, used: false });
    if (!token || token.expiresAt < new Date()) throw new AuthError('Invalid or expired code', 400);

    const user = await User.findById(userId);
    user.email = token.meta.newEmail;
    user.isEmailVerified = false;
    token.used = true;
    await token.save();
    await user.save();

    await publishEvent('email.changed', { userId, newEmail: user.email });
    return { message: 'Email changed successfully' };
}

async function requestPasswordReset(data) {
    const { error, value } = passwordResetSchema.validate(data);
    if (error) throw new AuthError(error.details[0].message);

    const or = [{ email: value.emailOrPhone }, { phone: value.emailOrPhone }];
    const user = await User.findOne({ $or });
    if (!user) {
        await publishEvent('password.reset.requested.invalid', { emailOrPhone: value.emailOrPhone });
        throw new AuthError('User not found', 404);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashed = hashToken(resetToken);
    const verification = new Verification({
        userId: user._id,
        type: 'password_reset',
        code: hashed
    });
    await verification.save();
    user.verificationTokens.push(verification._id);
    await user.save();

    await publishEvent('password.reset.requested', { userId: user._id, resetToken });
    return { message: 'Reset instructions sent' };
}

async function confirmPasswordReset(token, newPassword) {
    const { error } = passwordChangeSchema.validate({ newPassword });
    if (error) throw new AuthError(error.details[0].message);

    const hashedToken = hashToken(token);
    const v = await Verification.findOne({ type: 'password_reset', code: hashedToken, used: false });
    if (!v || v.expiresAt < new Date()) throw new AuthError('Invalid or expired reset token', 400);

    const user = await User.findById(v.userId);
    user.password = await hashPassword(newPassword);
    v.used = true;
    await v.save();
    await user.save();

    await publishEvent('password.reset.success', { userId: user._id });
    return { message: 'Password reset successfully' };
}

async function changePassword(userId, data, options = {}) {
    const { error, value } = passwordChangeSchema.validate(data);
    if (error) throw new AuthError(error.details[0].message);

    const user = await User.findById(userId).select('+password');
    if (!(await comparePassword(value.oldPassword, user.password))) throw new AuthError('Invalid old password', 401);

    user.password = await hashPassword(value.newPassword);
    await user.save();
    await publishEvent('password.changed', { userId });
    return { message: 'Password changed successfully' };
}

async function deleteAccount(userId) {
    const user = await User.findById(userId);
    if (!user) throw new AuthError('User not found', 404);

    await Session.deleteMany({ userId });
    await Consent.deleteMany({ userId });
    await Verification.deleteMany({ userId });
    await LoginHistory.deleteMany({ userId });
    await Preference.deleteMany({ userId });
    await resetRateLimit(userId.toString());

    await user.deleteOne();
    await publishEvent('user.deleted', { userId });
    return { message: 'Account deleted' };
}

async function revokeConsent(userId, type) {
    const { error } = revokeConsentSchema.validate({ type });
    if (error) throw new AuthError(error.details[0].message);

    const consent = await Consent.findOne({ userId, type, revoked: false });
    if (!consent) throw new AuthError('Consent not found', 404);
    consent.revoked = true;
    consent.revokedAt = new Date();
    await consent.save();
    await publishEvent('consent.revoked', { userId, type });
    return { message: 'Consent revoked' };
}

async function unlockAccount(userId) {
    const user = await User.findById(userId);
    if (!user) throw new AuthError('User not found', 404);
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    await resetRateLimit(userId.toString());
    await publishEvent('admin.account.unlocked', { targetUserId: userId });
    return { message: 'Account unlocked' };
}

async function bulkUpdateUsers(userIds, action) {
    const { error } = bulkUpdateSchema.validate({ userIds, action });
    if (error) throw new AuthError(error.details[0].message);

    const status = action === 'activate' ? 'active' : 'deactivated';
    const result = await User.updateMany({ _id: { $in: userIds }, accountStatus: { $ne: status } }, { accountStatus: status });
    await publishEvent('admin.users.bulk_updated', { targetUserIds: userIds, action });
    return { updated: result.modifiedCount };
}

async function checkConsentCompliance(termsVersion, privacyVersion) {
    const { error } = complianceSchema.validate({ termsVersion, privacyVersion });
    if (error) throw new AuthError(error.details[0].message);

    const users = await User.find({}).populate('consent');
    const requiredVersion = `${termsVersion}|${privacyVersion}`;
    const nonCompliant = users.filter(u => !u.consent || u.consent.version !== requiredVersion);
    await publishEvent('admin.consent.compliance_checked', { nonCompliantUserIds: nonCompliant.map(u => u._id) });
    return { nonCompliant: nonCompliant.length, userIds: nonCompliant.map(u => u._id) };
}

async function getSessions(userId) {
    const sessions = await Session.find({ userId }).sort({ lastActiveAt: -1 });
    return { sessions: sessions.map(s => ({ id: s._id, device: s.deviceId, ip: s.ip, lastActiveAt: s.lastActiveAt, revoked: s.revoked })) };
}

async function revokeSession(userId, sessionId) {
    const session = await Session.findOne({ userId, _id: sessionId });
    if (!session) throw new AuthError('Session not found', 404);
    session.revoked = true;
    await session.save();
    const user = await User.findById(userId);
    user.sessions = user.sessions.filter(s => s.toString() !== sessionId);
    await user.save();
    await publishEvent('session.revoked', { userId, sessionId });
    return { message: 'Session revoked' };
}

async function getConsents(userId) {
    const consents = await Consent.find({ userId }).sort({ acceptedAt: -1 });
    return { consents };
}

async function updateProfile(userId, data, profilePictureUrl = null) {
    const schema = joi.object({
        firstName: joi.string().min(2).max(30).optional(),
        lastName: joi.string().min(2).max(30).optional(),
        gender: joi.string().valid("male", "female", "other").optional(),
        address: joi.object({
            street: joi.string().max(100).optional().allow(null, ''),
            city: joi.string().max(50).optional().allow(null, ''),
            state: joi.string().max(50).optional().allow(null, ''),
            postalCode: joi.string().max(20).optional().allow(null, ''),
            country: joi.string().max(50).optional().allow(null, '')
        }).optional()
    });
    const { error, value } = schema.validate(data);
    if (error) throw new AuthError(error.details[0].message);

    if (profilePictureUrl) value.profilePicture = profilePictureUrl;

    const user = await User.findByIdAndUpdate(userId, value, { new: true });
    await publishEvent('profile.updated', { userId });
    return { user: user.toJSON() };
}

async function resendVerification(userId, type) {
    const user = await User.findById(userId);
    if (type === 'email' && user.email) {
        const code = generateNumericCode(6);
        const verification = new Verification({ userId, type, code });
        await verification.save();
        user.verificationTokens.push(verification._id);
        await user.save();
        await publishEvent('verification.resend', { userId, type, code });
        return { message: 'Code resent' };
    }
    if (type === 'phone' && user.phone) {
        const code = generateNumericCode(6);
        const verification = new Verification({ userId, type, code });
        await verification.save();
        user.verificationTokens.push(verification._id);
        await user.save();
        await publishEvent('verification.resend', { userId, type, code });
        return { message: 'Code resent' };
    }
    throw new AuthError('Invalid type or contact', 400);
}

async function getUsers(adminId, role, query = {}) {
    const allowedRoles = role === 'super_admin' ? ['super_admin', 'company_admin', 'shop_manager', 'worker', 'customer'] : ['shop_manager', 'worker', 'customer'];
    const filter = { role: { $in: allowedRoles }, ...query };
    const users = await User.find(filter).select('-password -twoFASecret');
    await publishEvent('admin.users.listed', { userId: adminId, role });
    return { users: users.map(u => u.toJSON()) };
}

async function createUser(adminId, data, options = {}) {
    const { ip, device, location } = options;
    const { error, value } = registerSchema.validate(data);
    if (error) throw new AuthError(`Validation error: ${error.details.map(x => x.message).join(', ')}`);

    const or = [];
    if (value.email) or.push({ email: value.email });
    if (value.phone) or.push({ phone: value.phone });
    if (value.username) or.push({ username: value.username });
    if (value.nationalId) or.push({ nationalId: value.nationalId });

    if (or.length) {
        const exists = await User.findOne({ $or: or });
        if (exists) throw new AuthError('User with provided email, phone, username, or national ID already exists', 409);
    }

    const hashedPassword = await hashPassword(value.password);
    const user = new User({
        firstName: value.firstName,
        lastName: value.lastName,
        username: value.username,
        email: value.email,
        phone: value.phone,
        password: hashedPassword,
        role: value.role,
        nationalId: value.nationalId,
        dateOfBirth: value.dateOfBirth,
        gender: value.gender,
        companyId: value.companyId,
        shopId: value.shopId,
        position: value.position,
        department: value.department,
        employmentStatus: value.employmentStatus || 'active',
        emergencyContact: value.emergencyContact,
        address: value.address,
        accountStatus: 'active',
        dateJoined: new Date()
    });
    await user.save();

    const preference = new Preference({
        userId: user._id,
        theme: value.preferences?.theme || 'system',
        language: value.preferences?.language || 'en',
        notifications: value.preferences?.notifications || { email: true, sms: false, inApp: true }
    });
    await preference.save();
    user.preferences = preference._id;

    const doc = JSON.stringify({
        termsVersion: value.consent.termsVersion,
        privacyVersion: value.consent.privacyVersion,
        consentGiven: {
            termsAccepted: !!value.consent.termsAccepted,
            privacyAccepted: !!value.consent.privacyAccepted,
            nationalIdConsent: !!value.consent.nationalIdConsent
        }
    });
    const documentHash = crypto.createHash('sha256').update(doc).digest('hex');
    const consent = new Consent({
        userId: user._id,
        type: 'terms_and_privacy_sbapshop',
        version: value.consent.termsVersion + '|' + value.consent.privacyVersion,
        document: doc,
        documentHash,
        acceptedAt: new Date(),
        ip: value.consent.ip || ip,
        device: value.consent.device || device,
        location
    });
    await consent.save();
    user.consent = consent._id;
    await user.save();

    await publishEvent('admin.user.created', { userId: adminId, newUserId: user._id });
    return { user: user.toJSON() };
}

async function updateUser(adminId, targetUserId, data) {
    const { error, value } = updateUserSchema.validate(data);
    if (error) throw new AuthError(`Validation error: ${error.details.map(x => x.message).join(', ')}`);

    const user = await User.findById(targetUserId);
    if (!user) throw new AuthError('User not found', 404);

    const or = [];
    if (value.email && value.email !== user.email) or.push({ email: value.email });
    if (value.phone && value.phone !== user.phone) or.push({ phone: value.phone });
    if (value.username && value.username !== user.username) or.push({ username: value.username });
    if (value.nationalId && value.nationalId !== user.nationalId) or.push({ nationalId: value.nationalId });

    if (or.length) {
        const exists = await User.findOne({ $or: or, _id: { $ne: targetUserId } });
        if (exists) throw new AuthError('Email, phone, username, or national ID already in use', 409);
    }

    Object.assign(user, value);
    await user.save();
    // await publishEvent('admin.user.updated', { userId: adminId, targetUserId });
    return { user: user.toJSON() };
}

async function deleteUser(adminId, targetUserId) {
    const user = await User.findById(targetUserId);
    if (!user) throw new AuthError('User not found', 404);
    if (user._id.toString() === adminId.toString()) throw new AuthError('Cannot delete self', 400);
    user.isDeleted = true;
    await user.save();
    // await publishEvent('admin.user.deleted', { userId: adminId, targetUserId });
    return { message: 'User deleted' };
}

async function getUserById(adminId, targetUserId) {
    const user = await User.findById(targetUserId).select('-password -twoFASecret');
    if (!user) throw new AuthError('User not found', 404);
    // await publishEvent('admin.user.viewed', { userId: adminId, targetUserId });
    return { user: user.toJSON() };
}


async function acceptConsent(adminId, data) {
    const schema = joi.object({
        userId: joi.string().required(),
        termsVersion: joi.string().required(),
        privacyVersion: joi.string().required(),
        termsAccepted: joi.boolean().required().valid(true),
        privacyAccepted: joi.boolean().required().valid(true),
        nationalIdConsent: joi.boolean().optional(),
        ip: joi.string().ip().optional(),
        device: joi.string().optional()
    });
    const { error, value } = schema.validate(data);
    if (error) throw new AuthError(error.details[0].message);

    const user = await User.findById(value.userId);
    if (!user) throw new AuthError('User not found', 404);

    const doc = JSON.stringify({
        termsVersion: value.termsVersion,
        privacyVersion: value.privacyVersion,
        consentGiven: {
            termsAccepted: !!value.termsAccepted,
            privacyAccepted: !!value.privacyAccepted,
            nationalIdConsent: !!value.nationalIdConsent
        }
    });
    const documentHash = crypto.createHash('sha256').update(doc).digest('hex');
    const consent = new Consent({
        userId: user._id,
        type: 'terms_and_privacy_sbapshop',
        version: value.termsVersion + '|' + value.privacyVersion,
        document: doc,
        documentHash,
        acceptedAt: new Date(),
        ip: value.ip || '',
        device: value.device || '',
        location: {}  // Can enhance with geolocation if needed
    });
    await consent.save();

    user.consent = consent._id;  // Override previous consent reference
    await user.save();

    // await publishEvent('admin.consent.updated', { adminId, userId: user._id, consentId: consent._id });
    return { message: 'Consent updated' };
}

module.exports = {
    register, login, refresh, logout, verify, setup2FA, verify2FASetup,
    disable2FA, changeEmail, confirmChangeEmail, requestPasswordReset,
    confirmPasswordReset, changePassword, getSessions, revokeSession,
    getConsents, updateProfile, resendVerification,
    requestOtpLogin, verifyOtpLogin, deleteAccount, revokeConsent,
    unlockAccount, bulkUpdateUsers, checkConsentCompliance,
    getUsers, createUser, updateUser, deleteUser, getUserById, acceptConsent
};