const speakeasy = require('speakeasy');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Imports
const { registerSchema, loginSchema, updateProfileSchema, updateUserSchema, changePasswordSchema, verificationSchema, consentSchema, twoFASchema, bulkUpdateSchema } = require('../utils/validation');
const { hashPassword, comparePassword, hashToken } = require('../utils/hashPassword');
const redis = require('/app/shared/redis.js');
const { publish: publishRabbitMQ, exchanges, subscribe } = require('/app/shared/rabbitmq.js');

const User = require('../models/User.models');
const Session = require('../models/Session.models');
const Consent = require('../models/Consent.models');
const Verification = require('../models/Verification.models');
const LoginHistory = require('../models/LoginHistory.models');
const Preference = require('../models/Preference.models');
const tokenService = require('./tokenService');

// AuthError
class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
        this.name = 'AuthError';
    }
}

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
    if (count >= max) throw new AuthError('Rate limited', 429);
    await redis.set(countKey, (count + 1).toString(), 'EX', window);
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

    console.log('AuthService: Subscribers set up for external tenancy updates');
}

// === Core Functions ===

// Register (OTP gen + role events)
async function register(data, options = {}) {
    await rateLimit(`register:${options.ip}`, 3);
    const { error, value } = registerSchema.validate(data);
    if (error) throw new AuthError(error.details[0].message, 400);

    // Uniqueness
    const orFields = [{ email: value.email }, { phone: value.phone }, { username: value.username }, { nationalId: value.nationalId }].filter(f => f);
    const existing = await User.findOne({ $or: orFields });
    if (existing && !existing.isDeleted) throw new AuthError('User exists', 409);

    // Role defaults (model enforces)
    value.password = await hashPassword(value.password);
    const user = new User(value);
    await user.save();

    // Preference
    const preference = new Preference({ userId: user._id, ...value.preferences });
    await preference.save();
    user.preferences = preference._id;
    await user.save();

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
        const secret = speakeasy.generateSecretSync();
        const code = speakeasy.totp({ secret: secret.base32, length: 6 });
        const v = await Verification.create({ userId: user._id, type: 'email', code, expiresAt: new Date(Date.now() + 15 * 60 * 1000), meta: { email: value.email } });
        verificationTokens.push({ type: 'email', code: process.env.NODE_ENV !== 'production' ? code : undefined });

        await redis.set(`verify:${v._id}`, code, 'EX', CACHE_TTLS.verifications);

        await publishEvent('verification.requested', { userId: user._id, type: 'email', details: { email: value.email }, role: user.role, firstName: user.firstName, lastName: user.lastName });
    }
    if (value.phone && !user.isPhoneVerified) {
        const secret = speakeasy.generateSecretSync();
        const code = speakeasy.totp({ secret: secret.base32, length: 6 });
        const v = await Verification.create({ userId: user._id, type: 'phone', code, expiresAt: new Date(Date.now() + 15 * 60 * 1000), meta: { phone: value.phone } });
        verificationTokens.push({ type: 'phone', code: process.env.NODE_ENV !== 'production' ? code : undefined });

        await redis.set(`verify:${v._id}`, code, 'EX', CACHE_TTLS.verifications);

        await publishEvent('verification.requested', { userId: user._id, type: 'phone', details: { phone: value.phone }, role: user.role, firstName: user.firstName, lastName: user.lastName });
    }

    // Role-specific events
    await publishEvent('user.registered', { userId: user._id, role: user.role, email: user.email, phone: user.phone, firstName: user.firstName, lastName: user.lastName });
    if (user.role === 'customer') {
        await publishEvent('customer.registered', { userId: user._id, firstName: user.firstName, lastName: user.lastName, phone: user.phone, email: user.email }); // Notification: OTP/welcome
    } else {
        await publishEvent('internal.user.registered', { userId: user._id, role: user.role, department: user.department, companies: user.companies, shops: user.shops }); // HR/audit
    }

    // Tenancy event if assigned
    if (user.companies.length > 0 || user.shops.length > 0) {
        await publishEvent('auth.user.tenancy.assigned', { userId: user._id, companies: user.companies, shops: user.shops });
    }

    // Cache
    await redis.set(`user:${user._id}`, JSON.stringify(user.toObject({ versionKey: false })), 'EX', CACHE_TTLS.user);

    return { user: user.toObject({ versionKey: false, transform: doc => { delete doc.password; return doc; } }), verificationTokens };
}

// Login (cached, rate-limited)
async function login(data, options = {}) {
    await rateLimit(`login:${data.identifier || options.ip}`, 5);
    const { error, value } = loginSchema.validate(data);
    if (error) throw new AuthError(error.details[0].message, 400);

    // Cached partial lookup, then full DB for password
    let user = await User.findOne({ $or: [{ email: value.identifier }, { phone: value.identifier }, { username: value.identifier }] }).select('+password');
    if (!user || user.isDeleted || user.accountStatus !== 'active') throw new AuthError('Invalid credentials', 401);
    if (user.lockUntil && user.lockUntil > new Date()) throw new AuthError('Account locked', 423);

    const passwordMatch = await comparePassword(value.password, user.password);
    if (!passwordMatch) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();
        await invalidateUserCache(user._id);
        throw new AuthError('Invalid credentials', 401);
    }

    // 2FA
    let method = 'password';
    if (user.twoFAEnabled) {
        if (!value.otp) throw new AuthError('2FA required', 401);
        const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: value.otp, window: 1 });
        if (!verified) throw new AuthError('Invalid 2FA', 401);
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
        accessToken: tokenService.signAccess({ sub: user._id.toString() }),
        refreshToken,
        user: await getCachedUser(user._id, '-password')
    };
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
    if (error) throw new AuthError(error.details[0].message, 400);

    const user = await User.findById(userId);
    if (!user) throw new AuthError('User not found', 404);

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
    if (error) throw new AuthError(error.details[0].message, 400);

    const user = await User.findById(userId).select('+password');
    if (!await comparePassword(value.oldPassword, user.password)) throw new AuthError('Old password wrong', 401);

    user.password = await hashPassword(value.newPassword);
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.password.changed', { userId });

    return { message: 'Changed' };
}

// Verify (cached code check)
async function verify(userId, data) {
    const { error, value } = verificationSchema.validate(data);
    if (error) throw new AuthError(error.details[0].message, 400);

    const cacheKey = `verify:${userId}:${value.type}:${value.code}`;
    let code = await redis.get(cacheKey);
    let token;
    if (!code) {
        token = await Verification.findOne({ userId, type: value.type, code: value.code, used: false, expiresAt: { $gt: new Date() } });
        if (!token) throw new AuthError('Invalid code', 400);
        code = token.code;
        await redis.set(cacheKey, code, 'EX', CACHE_TTLS.verifications);
    }

    if (code !== value.code) throw new AuthError('Invalid code', 400);

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
async function setup2FA(userId) {
    const user = await User.findById(userId);
    if (user.twoFAEnabled) throw new AuthError('2FA enabled', 400);

    const secret = speakeasy.generateSecret({ name: `Invexis (${user.email || user.phone})` });
    user.twoFASecret = secret.base32;
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.2fa.setup_requested', { userId });

    return { secret: secret.ascii, qr: secret.otpauth_url };
}

// Verify 2FA Setup
async function verify2FASetup(userId, data) {
    const { error, value } = twoFASchema.validate(data);
    if (error) throw new AuthError(error.details[0].message, 400);

    const user = await User.findById(userId).select('+twoFASecret');
    const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: value.otp, window: 1 });
    if (!verified) throw new AuthError('Invalid code', 400);

    user.twoFAEnabled = true;
    await user.save();
    await invalidateUserCache(userId);

    await publishEvent('user.2fa.enabled', { userId });

    return { enabled: true };
}

// Disable 2FA
async function disable2FA(userId, otp) {
    const user = await User.findById(userId).select('+twoFASecret');
    const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: otp, window: 1 });
    if (!verified) throw new AuthError('Invalid code', 400);

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
    if (!await comparePassword(currentPassword, user.password)) throw new AuthError('Password wrong', 401);

    const existing = await User.findOne({ email: newEmail });
    if (existing) throw new AuthError('Email in use', 409);

    const secret = speakeasy.generateSecretSync();
    const code = speakeasy.totp({ secret: secret.base32, length: 6 });
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
    if (!user) throw new AuthError('Not found', 404);

    const secret = speakeasy.generateSecretSync();
    const code = speakeasy.totp({ secret: secret.base32, length: 6 });
    await Verification.create({ userId: user._id, type: 'password_reset', code, meta: { identifier } });

    await redis.set(`verify:${user._id}:password_reset:${code}`, code, 'EX', CACHE_TTLS.verifications);

    await publishEvent('verification.requested', { userId: user._id, type: 'password_reset', details: { identifier } });

    return { message: 'Code sent' };
}

// Confirm Password Reset
async function confirmPasswordReset(identifier, code, newPassword) {
    const token = await Verification.findOne({ type: 'password_reset', code, used: false, expiresAt: { $gt: new Date() }, 'meta.identifier': identifier });
    if (!token) throw new AuthError('Invalid code', 400);

    token.used = true;
    await token.save();
    await redis.del(`verify:${token.userId}:password_reset:${code}`);

    const user = await User.findById(token.userId);
    user.password = await hashPassword(newPassword);
    user.failedLoginAttempts = 0;
    await user.save();
    await invalidateUserCache(user._id);

    await publishEvent('user.password.reset_completed', { userId: token.userId });

    return { message: 'Reset' };
}

// Resend Verification
async function resendVerification(userId, type) {
    const user = await getCachedUser(userId);
    if (!user) throw new AuthError('Not found', 404);
    if (type === 'email' && user.isEmailVerified) throw new AuthError('Verified', 400);

    const secret = speakeasy.generateSecretSync();
    const code = speakeasy.totp({ secret: secret.base32, length: 6 });
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
    if (!session) throw new AuthError('Not found', 404);

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
    if (!consent) throw new AuthError('Not found', 404);

    consent.revoked = true;
    consent.revokedAt = new Date();
    await consent.save();

    await publishEvent('user.consent.revoked', { userId, type });

    return { message: 'Revoked' };
}

// Delete Account
async function deleteAccount(userId) {
    const user = await User.findById(userId);
    if (!user) throw new AuthError('Not found', 404);

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
    if (!user) throw new AuthError('Not found', 404);

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
    if (error) throw new AuthError(error.details[0].message, 400);

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
    if (error) throw new AuthError(error.details[0].message, 400);

    const user = await User.findById(targetUserId);
    if (!user) throw new AuthError('Not found', 404);

    // Uniqueness for changes
    const or = [];
    if (value.email && value.email !== user.email) or.push({ email: value.email });
    if (value.phone && value.phone !== user.phone) or.push({ phone: value.phone });
    if (value.username && value.username !== user.username) or.push({ username: value.username });
    if (value.nationalId && value.nationalId !== user.nationalId) or.push({ nationalId: value.nationalId });

    if (or.length > 0) {
        const exists = await User.findOne({ $or: or, _id: { $ne: targetUserId } });
        if (exists) throw new AuthError('Field in use', 409);
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
    if (!user || user._id.toString() === adminId) throw new AuthError('Cannot delete', 400);

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
    if (!user) throw new AuthError('Not found', 404);

    await publishEvent('admin.user.viewed', { adminId, targetUserId });

    return { user };
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
    if (error) throw new AuthError(error.details[0].message, 400);

    const user = await User.findById(value.userId || userId);
    if (!user) throw new AuthError('User not found', 404);

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
    if (existing && !existing.revoked) throw new AuthError('Consent already accepted for this version', 409);

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
    await rateLimit(`otp:${identifier}`, 3);
    const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
    if (!user || user.accountStatus !== 'active') throw new AuthError('Invalid', 401);

    const secret = speakeasy.generateSecretSync();
    const code = speakeasy.totp({ secret: secret.base32, length: 6 });
    await Verification.create({ userId: user._id, type: 'otp_login', code, meta: { identifier } });

    await redis.set(`verify:${user._id}:otp_login:${code}`, code, 'EX', CACHE_TTLS.verifications);

    await publishEvent('verification.requested', { userId: user._id, type: 'otp_login', details: { identifier }, role: user.role });

    return { message: 'Sent' };
}

// Verify OTP Login
async function verifyOtpLogin(identifier, code, options = {}) {
    const cacheKey = `verify:*:otp_login:${code}`;
    let token = await redis.get(cacheKey);
    if (!token) {
        token = await Verification.findOne({ type: 'otp_login', code, used: false, expiresAt: { $gt: new Date() }, 'meta.identifier': identifier });
        if (!token) throw new AuthError('Invalid OTP', 401);
    }

    token.used = true;
    await token.save();
    await redis.del(cacheKey);

    const user = await User.findById(token.userId);
    const { refreshToken, session } = await tokenService.createSession(user._id, options.device, options.ip, options.location);
    user.sessions.push(session._id);
    await user.save();

    await publishEvent('user.otp.login_completed', { userId: token.userId, role: user.role, method: 'otp' });

    return {
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
    deleteUser,
    getUserById,
    getUsers,
    acceptConsent
};