const speakeasy = require('speakeasy');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Imports
const { registerSchema, loginSchema, updateProfileSchema, updateUserSchema, changePasswordSchema, verificationSchema, consentSchema, twoFASchema, bulkUpdateSchema } = require('../utils/validation');
const { hashPassword, comparePassword, hashToken } = require('../utils/hashPassword');
const redis = require('/app/shared/redis.js');
const { publish: publishRabbitMQ, exchanges, subscribe } = require('/app/shared/rabbitmq.js');
const { publishUserEvent } = require('../events/producer');

const User = require('../models/User.models');
const Session = require('../models/Session.models');
const Consent = require('../models/Consent.models');
const Verification = require('../models/Verification.models');
const LoginHistory = require('../models/LoginHistory.models');
const Preference = require('../models/Preference.models');
const tokenService = require('./tokenService');

// Cache TTLs
const CACHE_TTLS = {
    user: 300, // 5min
    sessions: 60, // 1min
    verifications: 900, // 15min
    rateLimit: 900 // 15min
};

// Caching helpers
async function getCachedUser(userId, select = '-password -twoFASecret', populate = []) {
    const cacheKey = `user:${userId}`;
    let userJson = await redis.get(cacheKey);
    if (userJson) return JSON.parse(userJson);

    const user = await User.findById(userId).select(select).populate(populate);
    if (!user) return null;
    userJson = user.toObject({ versionKey: false });
    await redis.set(cacheKey, JSON.stringify(userJson), 'EX', CACHE_TTLS.user);
    return userJson;
}

async function invalidateUserCache(userId) {
    await redis.del(`user:${userId}`);
    await redis.del(`sessions:${userId}`);
}

async function rateLimit(key, max = 10, window = CACHE_TTLS.rateLimit) {
    const countKey = `rate:${key}`;
    let count = await redis.get(countKey);
    count = parseInt(count || 0);
    if (count >= max) return { ok: false, status: 429, message: 'Rate limit exceeded' };
    await redis.set(countKey, (count + 1).toString(), 'EX', window);
    return { ok: true };
}

// Enhanced publishEvent
async function publishEvent(event, data, metadata = {}) {
    const routingKey = `auth.${event}`;
    const payload = { event, data, timestamp: new Date().toISOString(), service: 'auth-service' };
    const traceId = uuidv4();
    const success = await publishRabbitMQ(exchanges.topic, routingKey, payload, { headers: { traceId, ...metadata } });
    if (success) console.debug(`Event emitted: ${event} [trace: ${traceId}]`);
    else console.warn(`Event queued for retry: ${event}`);
}

// Setup subscribers for external updates (call once on startup)
async function setupSubscribers() {
    // Company updates from external service
    await subscribe(
        { queue: 'auth_company_updates', exchange: exchanges.topic, pattern: 'company.user.*' },
        async (content, routingKey) => {
            const { event, data: { userId, companyId, action } } = content;
            if (!['company.user.assigned', 'company.user.removed'].includes(event)) return;
            const user = await User.findById(userId);
            if (!user) return console.warn(`User ${userId} not found for company update`);
            if (action === 'assigned' && !user.companies.includes(companyId)) {
                user.companies.push(companyId);
            } else if (action === 'removed') {
                user.companies = user.companies.filter(id => id !== companyId);
            }
            await user.save();
            await invalidateUserCache(userId);
            await publishEvent('auth.user.tenancy.updated', { userId, companyId, action: 'company' });
            console.log(`Updated company for user ${userId}: ${action} ${companyId}`);
        }
    );

    // Shop updates from external service
    await subscribe(
        { queue: 'auth_shop_updates', exchange: exchanges.topic, pattern: 'shop.user.*' },
        async (content, routingKey) => {
            const { event, data: { userId, shopId, action } } = content;
            if (!['shop.user.assigned', 'shop.user.removed'].includes(event)) return;
            const user = await User.findById(userId);
            if (!user) return console.warn(`User ${userId} not found for shop update`);
            if (action === 'assigned' && !user.shops.includes(shopId)) {
                user.shops.push(shopId);
            } else if (action === 'removed') {
                user.shops = user.shops.filter(id => id !== shopId);
            }
            await user.save();
            await invalidateUserCache(userId);
            await publishEvent('auth.user.tenancy.updated', { userId, shopId, action: 'shop' });
            console.log(`Updated shop for user ${userId}: ${action} ${shopId}`);
        }
    );

    // Department updates from shop service
    await subscribe(
        { queue: 'auth_department_updates', exchange: exchanges.topic, pattern: 'shop.department.user.*' },
        async (content, routingKey) => {
            const { event, data: { userId, departmentId, action } } = content;
            if (!['shop.department.user.assigned', 'shop.department.user.removed'].includes(event)) return;
            const user = await User.findById(userId);
            if (!user) return console.warn(`User ${userId} not found for department update`);

            if (!user.assignedDepartments) user.assignedDepartments = [];

            if (action === 'assigned' && !user.assignedDepartments.includes(departmentId)) {
                user.assignedDepartments.push(departmentId);
            } else if (action === 'removed') {
                user.assignedDepartments = user.assignedDepartments.filter(id => id !== departmentId);
            }
            await user.save();
            await invalidateUserCache(userId);
            await publishEvent('auth.user.tenancy.updated', { userId, departmentId, action: 'department' });
            console.log(`Updated department for user ${userId}: ${action} ${departmentId}`);
        }
    );

    console.log('AuthService: Subscribers set up for external tenancy updates');
}

// === Core Functions ===

// Register (OTP gen + role events)
async function register(data, options = {}) {
    await rateLimit(`register:${options.ip}`, 3);
    if (!data) return { ok: false, status: 400, message: "Request body is required" };

    const { error, value } = registerSchema.validate(data, { abortEarly: false });
    if (error) {
        const message = error.details.map(detail => detail.message).join(', ');
        return { ok: false, status: 400, message }
    }

    // Check for existing user fields one by one to give specific error messages
    if (value.email) {
        const existingEmail = await User.findOne({ email: value.email, isDeleted: { $ne: true } });
        if (existingEmail) return { ok: false, status: 409, message: 'Email address is already registered' };
    }
    if (value.phone) {
        const existingPhone = await User.findOne({ phone: value.phone, isDeleted: { $ne: true } });
        if (existingPhone) return { ok: false, status: 409, message: 'Phone number is already registered' };
    }
    if (value.username) {
        const existingUsername = await User.findOne({ username: value.username, isDeleted: { $ne: true } });
        if (existingUsername) return { ok: false, status: 409, message: 'Username is already taken' };
    }
    if (value.nationalId) {
        const existingNationalId = await User.findOne({ nationalId: value.nationalId, isDeleted: { $ne: true } });
        if (existingNationalId) return { ok: false, status: 409, message: 'National ID is already registered' };
    }

    // Role defaults (model enforces)
    // Create user first without preferences
    const userDataWithoutPrefs = { ...value };
    delete userDataWithoutPrefs.preferences;

    const user = new User(userDataWithoutPrefs);
    await user.save();

    // Create and link preferences if provided
    if (value.preferences) {
        const preference = new Preference({ userId: user._id, ...value.preferences });
        await preference.save();
        user.preferences = preference._id;
        await user.save();
    }

    // Consent
    if (value.consent) {
        const doc = JSON.stringify({ termsVersion: value.consent.termsVersion, privacyVersion: value.consent.privacyVersion, consentGiven: { termsAccepted: value.consent.termsAccepted, privacyAccepted: value.consent.privacyAccepted, nationalIdConsent: value.consent.nationalIdConsent } });
        const documentHash = crypto.createHash('sha256').update(doc).digest('hex');
        const consent = new Consent({
            userId: user._id,
            type: 'terms_and_privacy',
            version: `${value.consent.termsVersion}|${value.consent.privacyVersion}`,
            document: doc,
            documentHash,
            acceptedAt: new Date(),
            ip: value.consent.ip || options.ip,
            device: value.consent.device || options.device,
            location: options.location || {}
        });
        await consent.save();
        user.consent = consent._id;
        await user.save();

        await publishEvent('user.consent.accepted', { userId: user._id, consentId: consent._id, version: consent.version });
    }

    // Generate OTPs for verification & publish events (notification service handles sending based on role/details)
    const verificationTokens = [];
    if (value.email && !user.isEmailVerified) {
        // Generate a 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const v = await Verification.create({ userId: user._id, type: 'email', code, expiresAt: new Date(Date.now() + 15 * 60 * 1000), meta: { email: value.email } });
        verificationTokens.push({ type: 'email', code: process.env.NODE_ENV !== 'production' ? code : undefined });

        await redis.set(`verify:${v._id}`, code, 'EX', CACHE_TTLS.verifications);

        await publishEvent('verification.requested', { userId: user._id, type: 'email', details: { email: value.email }, role: user.role, firstName: user.firstName, lastName: user.lastName });
    }
    if (value.phone && !user.isPhoneVerified) {
        // Generate a 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const v = await Verification.create({ userId: user._id, type: 'phone', code, expiresAt: new Date(Date.now() + 15 * 60 * 1000), meta: { phone: value.phone } });
        verificationTokens.push({ type: 'phone', code: process.env.NODE_ENV !== 'production' ? code : undefined });

        await redis.set(`verify:${v._id}`, code, 'EX', CACHE_TTLS.verifications);

        await publishEvent('verification.requested', { userId: user._id, type: 'phone', details: { phone: value.phone }, role: user.role, firstName: user.firstName, lastName: user.lastName });
    }

    // Publish user.created event for company service to create company-user relationship
    await publishUserEvent.created(user);

    // Role-specific events
    await publishEvent('user.registered', { userId: user._id, role: user.role, email: user.email, phone: user.phone, firstName: user.firstName, lastName: user.lastName });
    if (user.role === 'customer') {
        await publishEvent('customer.registered', { userId: user._id, firstName: user.firstName, lastName: user.lastName, phone: user.phone, email: user.email }); // Notification: OTP/welcome
    } else {
        await publishEvent('internal.user.registered', { userId: user._id, role: user.role, assignedDepartments: user.assignedDepartments, companies: user.companies, shops: user.shops }); // HR/audit
    }

    // Tenancy event if assigned
    if (user.companies.length > 0 || user.shops.length > 0) {
        await publishEvent('auth.user.tenancy.assigned', { userId: user._id, companies: user.companies, shops: user.shops });
    }

    // Cache
    await redis.set(`user:${user._id}`, JSON.stringify(user.toObject({ versionKey: false })), 'EX', CACHE_TTLS.user);

    // Generate refreshToken and session for the new user
    const { refreshToken, session } = await tokenService.createSession(user._id, options.device, options.ip, options.location);
    user.sessions.push(session._id);
    await user.save();

    return {
        user: user.toObject({ versionKey: false, transform: doc => { delete doc.password; return doc; } }),
        verificationTokens,
        refreshToken
    };
}

// Login (cached, rate-limited)
async function login(data, options = {}) {
    try {
        console.log('Login attempt:', { identifier: data.identifier });
        const rateResult = await rateLimit(`login:${data.identifier || options.ip}`, 15);
        if (!rateResult.ok) {
            return { status: 429, message: rateResult.message };
        }

        const { error, value } = loginSchema.validate(data);
        if (error) {
            console.log('Validation error:', error.details[0].message);
            return { status: 400, message: error.details[0].message };
        }

        // Cached partial lookup, then full DB for password
        console.log('Looking up user with identifier:', value.identifier);
        let user = await User.findOne({ $or: [{ email: value.identifier }, { phone: value.identifier }, { username: value.identifier }] }).select('+password');
        console.log('User found:', user ? 'Yes' : 'No');
        if (user) {
            console.log('Account status:', user.accountStatus);
            console.log('Is deleted:', user.isDeleted);
            console.log('Lock until:', user.lockUntil);
            console.log('User object:', JSON.stringify(user.toObject(), null, 2));
        }

        // User not found or invalid status
        if (!user || user.isDeleted || user.accountStatus !== 'active') {
            return { status: 401, message: 'Invalid credentials' };
        }

        // Account locked
        if (user.lockUntil && user.lockUntil > new Date()) {
            return { status: 423, message: 'Account locked' };
        }

        console.log('About to compare passwords:');
        console.log('Provided password:', value.password);
        console.log('Stored hash:', user.password);
        console.log('Starting password comparison...');
        const passwordMatch = await comparePassword(value.password, user.password);
        console.log('Password comparison complete. Result:', passwordMatch);
        console.log('Password match details:', {
            inputLength: value.password.length,
            hashExists: !!user.password,
            hashPrefix: user.password ? user.password.substring(0, 7) : null
        });
        if (!passwordMatch) {
            console.log('Password mismatch - incrementing failed attempts');
            user.failedLoginAttempts += 1;
            if (user.failedLoginAttempts >= 5) {
                user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await user.save();
            await invalidateUserCache(user._id);
            console.log('Failed login attempts:', user.failedLoginAttempts);
            return { status: 401, message: 'Invalid credentials' };
        }

        // 2FA
        let method = 'password';
        if (user.twoFAEnabled) {
            if (!value.otp) return { ok: false, status: 401, message: '2FA code required' };
            const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: value.otp, window: 1 });
            if (!verified) return { ok: false, status: 401, message: 'Invalid 2FA code' };
            method = '2fa';
        }

        user.failedLoginAttempts = 0;
        user.lastLoginAt = new Date();
        await user.save();
        await invalidateUserCache(user._id);

        const { refreshToken, session } = await tokenService.createSession(user._id, options.device, options.ip, options.location);
        user.sessions.push(session._id);
        await user.save();

        const history = new LoginHistory({ userId: user._id, ip: options.ip, device: options.device, location: options.location, method, successful: true, riskScore: 0 });
        await history.save();
        user.loginHistory.push(history._id);
        await user.save();

        await publishEvent('user.logged_in', { userId: user._id, role: user.role, method, ip: options.ip, device: options.device });

        return {
            ok: true,
            accessToken: tokenService.signAccess({ sub: user._id.toString() }),
            refreshToken: refreshToken,
            user: await getCachedUser(user._id, '-password')
        };
    } catch (error) {
        console.error('Login error:', error);
        return { status: 500, message: 'Internal server error' };
    }
}

// Refresh (cached)
async function refresh(refreshToken) {
    const { accessToken, refreshToken: newRefresh, sessionId, userId } = await tokenService.refreshTokens(refreshToken);
    await publishEvent('auth.session.refreshed', { sessionId, userId });
    return { accessToken, refreshToken: newRefresh };
}

// Logout
async function logout(userId, refreshToken) {
    if (refreshToken) await tokenService.revokeSessionByRefresh(refreshToken);
    if (userId) {
        await publishEvent('user.logged_out', { userId });
    }
    return { message: 'Logged out' };
}

// Update Profile (invalidate cache)
async function updateProfile(userId, data, profilePictureUrl = null) {
    const { error, value } = updateProfileSchema.validate(data);
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const user = await User.findById(userId);
    if (!user) return { ok: false, status: 404, message: 'User not found' };

    if (profilePictureUrl) value.profilePicture = profilePictureUrl;
    if (value.preferences) {
        let pref = await Preference.findOne({ userId });
        if (!pref) pref = new Preference({ userId });
        Object.assign(pref, value.preferences);
        await pref.save();
    }

    Object.assign(user, value);
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.profile.updated', { userId, role: user.role });

    return { user: await getCachedUser(userId) };
}

// Change Password (invalidate)
async function changePassword(userId, data) {
    const { error, value } = changePasswordSchema.validate(data);
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const user = await User.findById(userId).select('+password');
    if (!await comparePassword(value.oldPassword, user.password)) return { ok: false, status: 401, message: 'Old password wrong' };

    user.password = await hashPassword(value.newPassword);
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.password.changed', { userId });

    return { message: 'password is successfully Changed', user: await getCachedUser(userId) };
}

// Verify (cached code check)
async function verify(userId, data) {
    const { error, value } = verificationSchema.validate(data);
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const cacheKey = `verify:${userId}:${value.type}:${value.code}`;
    let code = await redis.get(cacheKey);
    let token;
    if (!code) {
        token = await Verification.findOne({ userId, type: value.type, code: value.code, used: false, expiresAt: { $gt: new Date() } });
        if (!token) return { ok: false, status: 400, message: 'Invalid verification code' };
        code = token.code;
        await redis.set(cacheKey, code, 'EX', CACHE_TTLS.verifications);
    }

    if (code !== value.code) return { ok: false, status: 400, message: 'Invalid verification code' };

    token.used = true;
    await token.save();
    await redis.del(cacheKey);

    const user = await User.findById(userId);
    if (value.type === 'email') user.isEmailVerified = true;
    if (value.type === 'phone') user.isPhoneVerified = true;
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent(`user.verification.${value.type}_completed`, { userId, role: user.role });

    return { verified: true };
}

// Setup 2FA
async function setup2FA(userId, data) {
    const { error, value } = setup2FASchema.validate(data);
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const user = await User.findById(userId).select('+password');
    if (user.twoFAEnabled) return { ok: false, status: 400, message: '2FA is already enabled' };

    const passwordMatch = await comparePassword(value.password, user.password);
    if (!passwordMatch) return { ok: false, status: 401, message: 'Invalid password' };

    const secret = speakeasy.generateSecret({ name: `Invexis (${user.email || user.phone})` });
    user.twoFASecret = secret.base32;
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.2fa.setup_requested', { userId });

    return { secret: secret.ascii, qr: secret.otpauth_url };
}

// Verify 2FA Setup
async function verify2FASetup(userId, data) {
    const { error, value } = verify2FASetupSchema.validate(data);
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const user = await User.findById(userId).select('+twoFASecret');
    const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: value.otp, window: 1 });
    if (!verified) return { ok: false, status: 400, message: 'Invalid code' };

    user.twoFAEnabled = true;
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.2fa.enabled', { userId });

    return { enabled: true };
}

// Disable 2FA
async function disable2FA(userId, data) {
    const { error, value } = disable2FASchema.validate(data);
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const user = await User.findById(userId).select('+password +twoFASecret');
    if (!user.twoFAEnabled) return { ok: false, status: 400, message: '2FA is not enabled' };

    const passwordMatch = await comparePassword(value.password, user.password);
    if (!passwordMatch) return { ok: false, status: 401, message: 'Invalid password' };

    const verified = speakeasy.totp.verify({
        secret: user.twoFASecret,
        encoding: 'base32',
        token: value.otp,
        window: 1
    });
    if (!verified) return { ok: false, status: 400, message: 'Invalid code' };

    user.twoFAEnabled = false;
    user.twoFASecret = undefined;
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.2fa.disabled', { userId });

    return { disabled: true };
}

// Change Email
async function changeEmail(userId, newEmail, currentPassword) {
    const user = await User.findById(userId).select('+password');
    if (!await comparePassword(currentPassword, user.password)) return { ok: false, status: 401, message: 'Password wrong' };

    const existing = await User.findOne({ email: newEmail });
    if (existing) return { ok: false, status: 409, message: 'Email in use' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Verification.create({ userId, type: 'email_change', code, meta: { newEmail } });

    await redis.set(`verify:${userId}:email_change:${code}`, code, 'EX', CACHE_TTLS.verifications);

    await publishEvent('verification.requested', { userId, type: 'email_change', details: { newEmail }, role: user.role });

    return { message: 'Code sent' };
}

// Confirm Change Email
async function confirmChangeEmail(userId, data) {
    const result = await verify(userId, { ...data, type: 'email_change' });
    const user = await User.findById(userId);
    user.email = data.meta?.newEmail || user.email;
    user.isEmailVerified = true;
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.email.changed', { userId, newEmail: user.email });

    return result;
}

// Request Password Reset
async function requestPasswordReset(identifier) {
    const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
    if (!user) return { ok: false, status: 404, message: 'Not found' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Verification.create({ userId: user._id, type: 'password_reset', code, meta: { identifier } });

    await redis.set(`verify:${user._id}:password_reset:${code}`, code, 'EX', CACHE_TTLS.verifications);

    await publishEvent('verification.requested', { userId: user._id, type: 'password_reset', details: { identifier } });

    return { message: 'request initialized and code is sent', code, user: await getCachedUser(user._id) };
}

// Confirm Password Reset
async function confirmPasswordReset(identifier, code, newPassword) {
    const token = await Verification.findOne({ type: 'password_reset', code, used: false, expiresAt: { $gt: new Date() }, 'meta.identifier': identifier });
    if (!token) return { ok: false, status: 400, message: 'Invalid code' };

    token.used = true;
    await token.save();
    await redis.del(`verify:${token.userId}:password_reset:${code}`);

    const user = await User.findById(token.userId);
    user.password = await hashPassword(newPassword);
    user.failedLoginAttempts = 0;
    await user.save();
    await invalidateUserCache(user._id);

    await publishEvent('user.password.reset_completed', { userId: token.userId });

    return { message: 'password is successfully reset', user };
}

// Resend Verification
async function resendVerification(userId, type) {
    const user = await getCachedUser(userId);
    if (!user) return { ok: false, status: 404, message: 'Not found' };
    if (type === 'email' && user.isEmailVerified) return { ok: false, status: 400, message: 'Verified' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Verification.create({ userId, type, code, meta: { [type]: user[type] } });

    await redis.set(`verify:${userId}:${type}:${code}`, code, 'EX', CACHE_TTLS.verifications);

    await publishEvent('verification.requested', { userId, type, details: { [type]: user[type] }, role: user.role });

    return { message: 'Resent' };
}

// Get Sessions (cached)
async function getSessions(userId) {
    const cacheKey = `sessions:${userId}`;
    let sessionsJson = await redis.get(cacheKey);
    if (sessionsJson) return { sessions: JSON.parse(sessionsJson) };

    const sessions = await Session.find({ userId }).sort({ lastActiveAt: -1 }).map(s => s.toObject({ versionKey: false }));
    sessionsJson = JSON.stringify(sessions);
    await redis.set(cacheKey, sessionsJson, 'EX', CACHE_TTLS.sessions);

    return { sessions };
}

// Revoke Session
async function revokeSession(userId, sessionId) {
    const session = await Session.findOne({ _id: sessionId, userId });
    if (!session) return { ok: false, status: 404, message: 'Not found' };

    session.revoked = true;
    await session.save();
    await redis.del(`session:${sessionId}`);
    await redis.del(`sessions:${userId}`);

    await publishEvent('auth.session.revoked', { userId, sessionId });

    return { message: 'Revoked' };
}

// Get Consents
async function getConsents(userId) {
    const consents = await Consent.find({ userId }).sort({ acceptedAt: -1 });
    return { consents: consents.map(c => c.toObject({ versionKey: false })) };
}

// Revoke Consent
async function revokeConsent(userId, type) {
    const consent = await Consent.findOne({ userId, type });
    if (!consent) return { ok: false, status: 404, message: 'Not found' };

    consent.revoked = true;
    consent.revokedAt = new Date();
    await consent.save();

    await publishEvent('user.consent.revoked', { userId, type });

    return { message: 'Revoked' };
}

// Delete Account
async function deleteAccount(userId) {
    const user = await User.findById(userId);
    if (!user) return { ok: false, status: 404, message: 'Not found' };

    user.isDeleted = true;
    user.accountStatus = 'deactivated';
    user.deletedAt = new Date();
    await user.save();
    await invalidateUserCache(userId);
    await Session.updateMany({ userId }, { revoked: true });

    await publishEvent('user.account.deleted', { userId, role: user.role });

    return { message: 'Deleted' };
}

// Unlock Account
async function unlockAccount(adminId, targetUserId) {
    const user = await User.findById(targetUserId);
    if (!user) return { ok: false, status: 404, message: 'Not found' };

    user.lockUntil = undefined;
    user.failedLoginAttempts = 0;
    await user.save();
    await invalidateUserCache(targetUserId);

    await publishEvent('admin.account.unlocked', { adminId, userId: targetUserId });

    return { message: 'Unlocked' };
}

// Bulk Update
async function bulkUpdateUsers(userIds, action) {
    const { error, value } = bulkUpdateSchema.validate({ userIds, action });
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const statusMap = { activate: 'active', deactivate: 'deactivated', ban: 'banned' };
    const results = await User.updateMany({ _id: { $in: userIds } }, { accountStatus: statusMap[action] });
    userIds.forEach(id => invalidateUserCache(id));

    await publishEvent('admin.users.bulk_updated', { action, count: results.modifiedCount, userIds });

    return { updated: results.modifiedCount };
}

// Check Compliance
async function checkConsentCompliance(termsVersion, privacyVersion) {
    const users = await User.find({ consent: { $exists: true } }).populate('consent');
    const compliant = users.filter(u => !u.consent.revoked && u.consent.version.includes(termsVersion) && u.consent.version.includes(privacyVersion));
    await publishEvent('admin.consent.compliance_checked', { termsVersion, privacyVersion, compliantCount: compliant.length, total: users.length });

    return { compliantCount: compliant.length, total: users.length };
}

// Admin: Create User
async function createUser(adminId, data, options = {}) {
    const out = await register(data, options);
    await publishEvent('admin.user.created', { adminId, newUserId: out.user._id, role: out.user.role });

    return out;
}

// Admin: Update User
async function updateUser(adminId, targetUserId, data) {
    const { error, value } = updateUserSchema.validate(data);
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const user = await User.findById(targetUserId);
    if (!user) return { ok: false, status: 404, message: 'Not found' };

    // Uniqueness for changes
    const or = [];
    if (value.email && value.email !== user.email) or.push({ email: value.email });
    if (value.phone && value.phone !== user.phone) or.push({ phone: value.phone });
    if (value.username && value.username !== user.username) or.push({ username: value.username });
    if (value.nationalId && value.nationalId !== user.nationalId) or.push({ nationalId: value.nationalId });

    if (or.length > 0) {
        const exists = await User.findOne({ $or: or, _id: { $ne: targetUserId } });
        if (exists) return { ok: false, status: 409, message: 'Field in use' };
    }

    if (value.password) value.password = await hashPassword(value.password);
    Object.assign(user, value);
    await user.save();
    await invalidateUserCache(targetUserId);

    await publishEvent('admin.user.updated', { adminId, targetUserId, changes: Object.keys(value) });

    return { user: await getCachedUser(targetUserId) };
}

// Admin: Delete User
async function deleteUser(adminId, targetUserId) {
    const user = await User.findById(targetUserId);
    if (!user || user._id.toString() === adminId) return { ok: false, status: 400, message: 'Cannot delete' };

    user.isDeleted = true;
    user.accountStatus = 'deactivated';
    user.deletedAt = new Date();
    await user.save();
    await invalidateUserCache(targetUserId);

    await publishEvent('admin.user.deleted', { adminId, targetUserId });

    return { message: 'Deleted' };
}

// Admin: Get User By ID
async function getUserById(adminId, targetUserId) {
    const user = await getCachedUser(targetUserId, '-password -twoFASecret', ['preferences', 'consent']);
    if (!user) return { ok: false, status: 404, message: 'Not found' };

    await publishEvent('admin.user.viewed', { adminId, targetUserId });

    return { user };
}

// Get Current User (cached)
async function getCurrentUser(userId) {
    return await getCachedUser(userId, '-password -twoFASecret', ['preferences', 'consent']);
}

// Admin: Get Users (cached paginated)
async function getUsers(adminId, roleFilter, query = {}) {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;
    const cacheKey = `users:${roleFilter}:${status || 'active'}:${page}:${limit}`;
    let usersJson = await redis.get(cacheKey);
    if (usersJson) return JSON.parse(usersJson);

    const filter = { accountStatus: status || 'active' };
    if (roleFilter !== 'super_admin') filter.role = { $ne: 'super_admin' };
    const [users, total] = await Promise.all([
        User.find(filter).select('-password -twoFASecret').populate('preferences consent').limit(limit).skip(skip).sort({ createdAt: -1 }),
        User.countDocuments(filter)
    ]);
    const result = { users: users.map(u => u.toObject({ versionKey: false })), total, page, limit };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTLS.sessions * 10);

    await publishEvent('admin.users.listed', { adminId, count: users.length, filter });

    return result;
}

// Accept Consent (full impl: snapshot document, hash, immutable)
async function acceptConsent(userId, data) {
    const { error, value } = consentSchema.validate({ ...data, userId });
    if (error) return { ok: false, status: 400, message: error.details[0].message };

    const user = await User.findById(value.userId || userId);
    if (!user) return { ok: false, status: 404, message: 'User not found' };

    // Snapshot document (immutable)
    const doc = JSON.stringify({
        termsVersion: value.termsVersion,
        privacyVersion: value.privacyVersion,
        consentGiven: {
            termsAccepted: value.termsAccepted,
            privacyAccepted: value.privacyAccepted,
            nationalIdConsent: value.nationalIdConsent
        }
    });
    const documentHash = crypto.createHash('sha256').update(doc).digest('hex');

    // Check for existing (prevent duplicates)
    const existing = await Consent.findOne({ userId: user._id, type: 'terms_and_privacy', version: `${value.termsVersion}|${value.privacyVersion}` });
    if (existing && !existing.revoked) return { ok: false, status: 409, message: 'Consent already accepted for this version' };

    const consent = new Consent({
        userId: user._id,
        type: 'terms_and_privacy',
        version: `${value.termsVersion}|${value.privacyVersion}`,
        document: doc,
        documentHash,
        acceptedAt: new Date(),
        ip: value.ip || '',
        device: value.device || '',
        location: {}
    });
    await consent.save();

    // Link to user (override if newer version)
    user.consent = consent._id;
    await user.save();
    await invalidateUserCache(user._id);

    await publishEvent('user.consent.accepted', { userId: user._id, consentId: consent._id, version: consent.version, role: user.role });

    return { message: 'Consent accepted', consentId: consent._id };
}

// Request OTP Login
async function requestOtpLogin(identifier, options = {}) {
    const rateCheck = await rateLimit(`otp:${identifier}`, 3);
    if (!rateCheck.ok) return rateCheck;

    const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
    if (!user || user.accountStatus !== 'active') return { ok: false, status: 401, message: 'Invalid credentials' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Verification.create({ userId: user._id, type: 'otp_login', code, meta: { identifier } });

    await redis.set(`verify:${user._id}:otp_login:${code}`, code, 'EX', CACHE_TTLS.verifications);

    await publishEvent('verification.requested', { userId: user._id, type: 'otp_login', details: { identifier }, role: user.role });

    return { ok: true, status: 200, message: 'OTP sent successfully', user, code };
}

// Verify OTP Login
async function verifyOtpLogin(identifier, code, options = {}) {
    const cacheKey = `verify:*:otp_login:${code}`;
    let token = await redis.get(cacheKey);
    if (!token) {
        token = await Verification.findOne({ type: 'otp_login', code, used: false, expiresAt: { $gt: new Date() }, 'meta.identifier': identifier });
        if (!token) return { ok: false, status: 401, message: 'Invalid OTP' };
    }

    token.used = true;
    await token.save();
    await redis.del(cacheKey);

    const user = await User.findById(token.userId);
    if (!user || user.accountStatus !== 'active') {
        return { ok: false, status: 401, message: 'User not found or inactive' };
    }

    const { refreshToken, session } = await tokenService.createSession(user._id, options.device, options.ip, options.location);
    user.sessions.push(session._id);
    await user.save();

    await publishEvent('user.otp.login_completed', { userId: token.userId, role: user.role, method: 'otp' });

    return {
        ok: true,
        accessToken: tokenService.signAccess({ sub: user._id.toString() }),
        refreshToken,
        user: await getCachedUser(user._id)
    };
}

module.exports = {
    setupSubscribers,
    register,
    login,
    refresh,
    logout,
    updateProfile,
    changePassword,
    verify,
    setup2FA,
    verify2FASetup,
    disable2FA,
    changeEmail,
    confirmChangeEmail,
    requestPasswordReset,
    confirmPasswordReset,
    resendVerification,
    getSessions,
    revokeSession,
    getConsents,
    revokeConsent,
    deleteAccount,
    unlockAccount,
    bulkUpdateUsers,
    checkConsentCompliance,
    requestOtpLogin,
    verifyOtpLogin,
    createUser,
    updateUser,
    getCurrentUser,
    deleteUser,
    getUserById,
    getUsers,
    acceptConsent
};